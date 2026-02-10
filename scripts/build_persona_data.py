"""
Build HiveSight persona data from PolicyEngine Enhanced CPS.

Extracts person-level microdata, groups by state, and uploads
gzipped JSON files to HuggingFace for use by the HiveSight app.

Usage:
    python scripts/build_persona_data.py
    python scripts/build_persona_data.py --output-dir /tmp/hivesight-data
    python scripts/build_persona_data.py --upload  # Upload to HuggingFace
"""

import argparse
import gzip
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

# FIPS code to state abbreviation mapping
FIPS_TO_STATE = {
    1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT",
    10: "DE", 11: "DC", 12: "FL", 13: "GA", 15: "HI", 16: "ID",
    17: "IL", 18: "IN", 19: "IA", 20: "KS", 21: "KY", 22: "LA",
    23: "ME", 24: "MD", 25: "MA", 26: "MI", 27: "MN", 28: "MS",
    29: "MO", 30: "MT", 31: "NE", 32: "NV", 33: "NH", 34: "NJ",
    35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH", 40: "OK",
    41: "OR", 42: "PA", 44: "RI", 45: "SC", 46: "SD", 47: "TN",
    48: "TX", 49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV",
    55: "WI", 56: "WY",
}

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DC": "District of Columbia", "DE": "Delaware", "FL": "Florida",
    "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky",
    "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming",
}

TENURE_MAP = {
    "OWNED_WITH_MORTGAGE": 1,
    "OWNED_WITHOUT_MORTGAGE": 1,
    "RENTED": 2,
    "NONE": 0,
}


def extract_persons(year: int = 2025) -> list[dict]:
    """Extract person-level data from PolicyEngine Enhanced CPS."""
    from policyengine_us import Microsimulation

    print("Loading PolicyEngine microsimulation...")
    sim = Microsimulation()

    print(f"Extracting variables for {year}...")

    # Person-level variables (direct)
    age = sim.calc("age", year).values
    is_female = sim.calc("is_female", year).values
    cps_race = sim.calc("cps_race", year).values
    is_hispanic = sim.calc("is_hispanic", year).values
    employment_income = sim.calc("employment_income", year).values
    self_employment_income = sim.calc(
        "self_employment_income", year
    ).values
    occupation_code = sim.calc("detailed_occupation_recode", year).values
    tenure_type_str = sim.calc("tenure_type", year, map_to="person").values
    children_count = sim.calc(
        "own_children_in_household", year, map_to="person"
    ).values
    is_in_college = sim.calc(
        "is_full_time_college_student", year
    ).values
    is_disabled = sim.calc("is_disabled", year).values
    ssi_reported = sim.calc("ssi_reported", year).values
    snap_reported = sim.calc("snap_reported", year, map_to="person").values
    tanf_reported = sim.calc("tanf_reported", year, map_to="person").values
    unemployment_comp = sim.calc("unemployment_compensation", year).values
    social_security = sim.calc("social_security", year).values
    medicare_premiums = sim.calc(
        "medicare_part_b_premiums", year
    ).values
    person_weight = sim.calc("person_weight", year).values

    # Household-level mapped to person
    state_fips = sim.calc("state_fips", year, map_to="person").values

    n_persons = len(age)
    print(f"Total persons: {n_persons}")

    # Filter to adults only (18+)
    adult_mask = age >= 18
    print(f"Adults (18+): {adult_mask.sum()}")

    persons = []
    for i in range(n_persons):
        if not adult_mask[i]:
            continue

        fips = int(state_fips[i])
        state_abbrev = FIPS_TO_STATE.get(fips, "")
        if not state_abbrev:
            continue

        # Map tenure_type string to integer
        tenure_str = str(tenure_type_str[i])
        tenure_int = TENURE_MAP.get(tenure_str, 0)

        persons.append({
            "age": int(age[i]),
            "is_female": bool(is_female[i]),
            "cps_race": int(cps_race[i]),
            "is_hispanic": bool(is_hispanic[i]),
            "employment_income": round(float(employment_income[i]), 2),
            "self_employment_income": round(
                float(self_employment_income[i]), 2
            ),
            "occupation_code": int(occupation_code[i]),
            "tenure_type": tenure_int,
            "children_count": int(children_count[i]),
            "is_in_college": bool(is_in_college[i]),
            "is_disabled": bool(is_disabled[i]),
            "has_medicaid": False,  # Not directly available in raw CPS
            "has_medicare": float(medicare_premiums[i]) > 0,
            "receives_ssi": float(ssi_reported[i]) > 0,
            "receives_snap": float(snap_reported[i]) > 0,
            "receives_tanf": float(tanf_reported[i]) > 0,
            "receives_unemployment": float(unemployment_comp[i]) > 0,
            "receives_social_security": float(social_security[i]) > 0,
            "zcta": "",  # Not available in CPS
            "weight": round(float(person_weight[i]), 2),
            "_state": state_abbrev,  # Internal, removed before saving
        })

    print(f"Extracted {len(persons)} adult person records")
    return persons


def group_by_state(
    persons: list[dict],
) -> dict[str, list[dict]]:
    """Group persons by state abbreviation."""
    by_state: dict[str, list[dict]] = defaultdict(list)
    for p in persons:
        state = p.pop("_state")
        by_state[state].append(p)
    return dict(by_state)


def save_gzipped_json(data: dict, filepath: Path):
    """Save data as gzipped JSON."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    json_bytes = json.dumps(data, separators=(",", ":")).encode("utf-8")
    with gzip.open(filepath, "wb") as f:
        f.write(json_bytes)
    size_kb = filepath.stat().st_size / 1024
    print(f"  Saved {filepath.name} ({size_kb:.1f} KB)")


def build_locations_list(
    state_counts: dict[str, int],
) -> list[dict]:
    """Build locations autocomplete list."""
    locations = [
        {"type": "national", "id": "US", "label": "United States"},
    ]
    for state, count in sorted(state_counts.items()):
        name = STATE_NAMES.get(state, state)
        locations.append({
            "type": "state",
            "id": state,
            "label": f"{name} ({count} persons)",
        })
    return locations


def main():
    parser = argparse.ArgumentParser(
        description="Build HiveSight persona data from PolicyEngine CPS"
    )
    parser.add_argument(
        "--output-dir",
        default="scripts/output/persona-data",
        help="Output directory for generated files",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload to HuggingFace after building",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=2025,
        help="Tax year for simulation",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    # Step 1: Extract data
    persons = extract_persons(args.year)

    # Step 2: Group by state
    by_state = group_by_state(persons)
    print(f"\nStates with data: {len(by_state)}")

    state_counts = {}
    for state, state_persons in sorted(by_state.items()):
        state_counts[state] = len(state_persons)
        print(f"  {state}: {len(state_persons)} persons")

    # Step 3: Save state files
    districts_dir = output_dir / "districts"
    print(f"\nSaving state files to {districts_dir}/...")

    all_persons = []
    for state, state_persons in by_state.items():
        save_gzipped_json(
            {"persons": state_persons},
            districts_dir / f"{state}.json.gz",
        )
        all_persons.extend(state_persons)

    # Step 4: Save national file
    save_gzipped_json(
        {"persons": all_persons},
        districts_dir / "US.json.gz",
    )

    # Step 5: Save locations list
    lookup_dir = output_dir / "lookup"
    locations = build_locations_list(state_counts)
    save_gzipped_json(locations, lookup_dir / "locations.json.gz")

    # Step 6: Save empty ZCTA lookup (ZCTAs not in CPS)
    save_gzipped_json({}, lookup_dir / "zcta_to_district.json.gz")

    print(f"\nDone! Total: {len(all_persons)} persons across {len(by_state)} states")
    print(f"Output: {output_dir}")

    # Step 7: Upload to HuggingFace
    if args.upload:
        upload_to_huggingface(output_dir)


def upload_to_huggingface(output_dir: Path):
    """Upload generated files to HuggingFace dataset repo."""
    try:
        from huggingface_hub import HfApi
    except ImportError:
        print("Install huggingface_hub: pip install huggingface_hub")
        sys.exit(1)

    repo_id = "policyengine/hivesight-persona-data"
    api = HfApi()

    print(f"\nUploading to {repo_id}...")

    # Upload all files
    api.upload_folder(
        folder_path=str(output_dir),
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Update persona data from Enhanced CPS 2024",
    )
    print(f"Uploaded to https://huggingface.co/datasets/{repo_id}")


if __name__ == "__main__":
    main()
