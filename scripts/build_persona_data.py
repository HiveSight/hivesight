"""
Build HiveSight persona data from PolicyEngine local calibration files.

Reads district-level and state-level H5 files from the
policyengine/policyengine-us-data HuggingFace model repo. These files
contain locally calibrated microdata with ~5K-15K persons per district,
ZCTA/ZIP codes, county, tract, and properly calibrated weights.

Usage:
    python scripts/build_persona_data.py
    python scripts/build_persona_data.py --output-dir /tmp/hivesight-data
    python scripts/build_persona_data.py --upload
"""

import argparse
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

import h5py
import numpy as np

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
    b"OWNED_WITH_MORTGAGE": 1,
    b"OWNED_WITHOUT_MORTGAGE": 1,
    b"RENTED": 2,
    b"NONE": 0,
}

HF_REPO = "policyengine/policyengine-us-data"


def download_h5(filename: str) -> str:
    """Download an H5 file from HuggingFace, return local path."""
    from huggingface_hub import hf_hub_download

    return hf_hub_download(
        repo_id=HF_REPO,
        filename=filename,
        repo_type="model",
    )


def list_district_files() -> list[str]:
    """List all district H5 files on HuggingFace."""
    from huggingface_hub import HfApi

    api = HfApi()
    files = api.list_repo_files(HF_REPO, repo_type="model")
    return sorted(f for f in files if f.startswith("districts/") and f.endswith(".h5"))


def list_state_files() -> list[str]:
    """List all state H5 files on HuggingFace."""
    from huggingface_hub import HfApi

    api = HfApi()
    files = api.list_repo_files(HF_REPO, repo_type="model")
    return sorted(f for f in files if f.startswith("states/") and f.endswith(".h5"))


def safe_bytes(val) -> str:
    """Convert bytes or string to str."""
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace")
    return str(val)


def extract_persons_from_h5(
    h5_path: str,
    district_id: str = "",
) -> list[dict]:
    """Extract adult person records from a local calibration H5 file."""
    with h5py.File(h5_path, "r") as f:
        # Auto-detect year from age variable
        year = sorted(f["age"].keys())[-1]

        # Person-level variables
        age = f["age"][year][:]
        n_persons = len(age)

        # Build household-to-person mapping for weight lookup
        person_hh_id = f["person_household_id"][year][:]
        hh_id = f["household_id"][year][:]
        hh_weight = f["household_weight"][year][:]
        hh_id_to_weight = dict(zip(hh_id, hh_weight))

        # Map household weight to person level
        person_weight = np.array(
            [float(hh_id_to_weight.get(pid, 0)) for pid in person_hh_id]
        )

        is_female = f["is_female"][year][:]
        cps_race = f["cps_race"][year][:]
        is_hispanic = f["is_hispanic"][year][:]
        emp_income = f["employment_income_before_lsr"][year][:]
        se_income = f["self_employment_income_before_lsr"][year][:]
        occupation = f["detailed_occupation_recode"][year][:]
        is_college = f["is_full_time_college_student"][year][:]
        is_disabled = f["is_disabled"][year][:]
        ssi = f["ssi_reported"][year][:]
        unemployment = f["unemployment_compensation"][year][:]
        medicare_premiums = f["medicare_part_b_premiums"][year][:]

        # Social security components
        ss_retirement = f["social_security_retirement"][year][:]
        ss_disability = f["social_security_disability"][year][:]
        ss_survivors = f["social_security_survivors"][year][:]
        ss_dependents = f["social_security_dependents"][year][:]

        # Insurance
        has_esi = f["has_esi"][year][:]
        has_marketplace = f["has_marketplace_health_coverage"][year][:]

        # Household-level variables (need mapping to person)
        # tenure_type is at household level (shape matches hh_id)
        tenure_raw = f["tenure_type"][year][:]
        hh_id_to_tenure = dict(zip(hh_id, tenure_raw))

        # SPM unit level variables (snap, tanf)
        spm_unit_id = f["spm_unit_id"][year][:]
        person_spm_id = f["person_spm_unit_id"][year][:]
        snap_raw = f["snap_reported"][year][:]
        spm_to_snap = dict(zip(spm_unit_id, snap_raw))

        # own_children_in_household is person-level if available
        if "own_children_in_household" in f:
            children = f["own_children_in_household"][year][:]
        else:
            children = np.zeros(n_persons, dtype=np.int32)

        # ZCTA (household-level)
        has_zcta = "zcta" in f
        if has_zcta:
            zcta_raw = f["zcta"][year][:]
            hh_id_to_zcta = dict(zip(hh_id, zcta_raw))

        # State FIPS (household-level)
        state_fips_raw = f["state_fips"][year][:]
        hh_id_to_fips = dict(zip(hh_id, state_fips_raw))

        # tanf_reported is person-level
        tanf = f["tanf_reported"][year][:]

        # medicaid_take_up_seed exists but we can check has_esi/marketplace
        # for insurance proxy

        adult_mask = age >= 18
        persons = []

        for i in range(n_persons):
            if not adult_mask[i]:
                continue

            w = person_weight[i]
            if w <= 0:
                continue

            hh = person_hh_id[i]
            fips = int(hh_id_to_fips.get(hh, 0))
            state_abbrev = FIPS_TO_STATE.get(fips, "")
            if not state_abbrev:
                continue

            tenure_bytes = hh_id_to_tenure.get(hh, b"NONE")
            tenure_int = TENURE_MAP.get(tenure_bytes, 0)

            spm_id = person_spm_id[i]
            snap_val = float(spm_to_snap.get(spm_id, 0))

            zcta_str = ""
            if has_zcta:
                zcta_bytes = hh_id_to_zcta.get(hh, b"")
                zcta_str = safe_bytes(zcta_bytes)

            total_ss = (
                float(ss_retirement[i])
                + float(ss_disability[i])
                + float(ss_survivors[i])
                + float(ss_dependents[i])
            )

            persons.append({
                "age": int(age[i]),
                "is_female": bool(is_female[i]),
                "cps_race": int(cps_race[i]),
                "is_hispanic": bool(is_hispanic[i]),
                "employment_income": round(float(emp_income[i]), 2),
                "self_employment_income": round(float(se_income[i]), 2),
                "occupation_code": int(occupation[i]),
                "tenure_type": tenure_int,
                "children_count": int(children[i]),
                "is_in_college": bool(is_college[i]),
                "is_disabled": bool(is_disabled[i]),
                "has_medicaid": not bool(has_esi[i]) and not bool(has_marketplace[i]) and float(emp_income[i]) < 20000,
                "has_medicare": float(medicare_premiums[i]) > 0,
                "receives_ssi": float(ssi[i]) > 0,
                "receives_snap": snap_val > 0,
                "receives_tanf": float(tanf[i]) > 0,
                "receives_unemployment": float(unemployment[i]) > 0,
                "receives_social_security": total_ss > 0,
                "zcta": zcta_str,
                "weight": round(w, 2),
                "_state": state_abbrev,
                "_district": district_id,
            })

    return persons


def save_gzipped_json(data, filepath: Path):
    """Save data as gzipped JSON."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    json_bytes = json.dumps(data, separators=(",", ":")).encode("utf-8")
    with gzip.open(filepath, "wb") as f:
        f.write(json_bytes)
    size_kb = filepath.stat().st_size / 1024
    print(f"  Saved {filepath.name} ({size_kb:.1f} KB)")


def main():
    parser = argparse.ArgumentParser(
        description="Build HiveSight persona data from PolicyEngine local calibration files"
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
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    districts_dir = output_dir / "districts"
    lookup_dir = output_dir / "lookup"

    # Step 1: List all district files
    print("Listing district files on HuggingFace...")
    district_files = list_district_files()
    print(f"Found {len(district_files)} district files")

    # Step 2: Process each district
    all_persons_by_district = {}
    all_persons_by_state = defaultdict(list)
    zcta_to_districts = defaultdict(list)

    for idx, df in enumerate(district_files):
        district_name = Path(df).stem  # e.g., "NY-17"
        print(f"\n[{idx + 1}/{len(district_files)}] Processing {district_name}...")

        h5_path = download_h5(df)
        persons = extract_persons_from_h5(h5_path, district_id=district_name)
        print(f"  Extracted {len(persons)} adults")

        # Track ZCTAs for this district
        district_zctas = set()
        for p in persons:
            if p["zcta"]:
                district_zctas.add(p["zcta"])

        for zcta in district_zctas:
            zcta_to_districts[zcta].append(district_name)

        # Group by state
        for p in persons:
            state = p.pop("_state")
            district = p.pop("_district")
            all_persons_by_state[state].append(p)

        all_persons_by_district[district_name] = persons

        # Save district file
        # Strip internal fields before saving
        clean_persons = []
        for p in all_persons_by_district[district_name]:
            cp = dict(p)
            cp.pop("_state", None)
            cp.pop("_district", None)
            clean_persons.append(cp)

        save_gzipped_json(
            {"persons": clean_persons},
            districts_dir / f"{district_name}.json.gz",
        )

    # Step 3: Save state files
    print(f"\nSaving state files...")
    state_counts = {}
    district_counts = {}
    all_persons = []

    for state, state_persons in sorted(all_persons_by_state.items()):
        state_counts[state] = len(state_persons)
        print(f"  {state}: {len(state_persons)} persons")
        save_gzipped_json(
            {"persons": state_persons},
            districts_dir / f"{state}.json.gz",
        )
        all_persons.extend(state_persons)

    # Step 4: Save national file
    print(f"\nSaving national file ({len(all_persons)} persons)...")
    save_gzipped_json(
        {"persons": all_persons},
        districts_dir / "US.json.gz",
    )

    # Step 5: Build and save locations list
    locations = [
        {"type": "national", "id": "US", "label": "United States"},
    ]
    for state, count in sorted(state_counts.items()):
        name = STATE_NAMES.get(state, state)
        locations.append({
            "type": "state",
            "id": state,
            "label": f"{name} ({count:,} persons)",
        })
    for district_name in sorted(all_persons_by_district.keys()):
        state_code = district_name.split("-")[0]
        state_name = STATE_NAMES.get(state_code, state_code)
        n = len(all_persons_by_district[district_name])
        # Clean up internal fields from count (they're already removed in clean_persons)
        locations.append({
            "type": "district",
            "id": district_name,
            "label": f"{district_name} - {state_name} ({n:,} persons)",
        })
    save_gzipped_json(locations, lookup_dir / "locations.json.gz")

    # Step 6: Build ZCTA-to-district lookup
    # For each ZCTA, compute share across districts (equal split for now)
    zcta_lookup = {}
    for zcta, districts in sorted(zcta_to_districts.items()):
        share = round(1.0 / len(districts), 4)
        zcta_lookup[zcta] = [
            {"district": d, "share": share} for d in districts
        ]
    save_gzipped_json(zcta_lookup, lookup_dir / "zcta_to_district.json.gz")
    print(f"\nZCTA lookup: {len(zcta_lookup)} ZCTAs mapped to districts")

    print(f"\nDone! {len(all_persons):,} persons across "
          f"{len(all_persons_by_district)} districts, "
          f"{len(state_counts)} states")

    # Step 7: Upload
    if args.upload:
        upload_to_huggingface(output_dir)


def upload_to_huggingface(output_dir: Path):
    """Upload generated files to HuggingFace dataset repo."""
    try:
        from huggingface_hub import HfApi
    except ImportError:
        print("Install huggingface_hub: uv pip install huggingface_hub")
        sys.exit(1)

    repo_id = "MaxGhenis/hivesight-persona-data"
    api = HfApi()

    print(f"\nUploading to {repo_id}...")
    api.upload_folder(
        folder_path=str(output_dir),
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Update persona data from local calibration files (436 districts, ZCTAs)",
    )
    print(f"Uploaded to https://huggingface.co/datasets/{repo_id}")


if __name__ == "__main__":
    main()
