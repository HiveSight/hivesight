#!/usr/bin/env python3
"""
Convert PolicyEngine H5 microdata to gzipped JSON for HiveSight.

Downloads H5 files from the HuggingFace repo policyengine/policyengine-us-data,
extracts ~20 persona-relevant variables per person, and outputs:
  - One gzipped JSON per congressional district (e.g., NY-17.json.gz)
  - One gzipped JSON per state (e.g., NY.json.gz)
  - lookup/zcta_to_district.json.gz  (ZIP -> district mapping with population shares)
  - lookup/locations.json.gz         (autocomplete list for UI)

Requirements (install with uv):
    uv pip install huggingface_hub h5py tqdm numpy

Usage:
    python convert_h5_to_json.py --output-dir ./output
    python convert_h5_to_json.py --output-dir ./output --upload --hf-repo myorg/hivesight-data
    python convert_h5_to_json.py --output-dir ./output --districts-only  # skip states
    python convert_h5_to_json.py --output-dir ./output --limit 5         # process only 5 files (for testing)
"""

import argparse
import gzip
import json
import logging
import os
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import h5py
import numpy as np
from huggingface_hub import hf_hub_download, list_repo_tree

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HF_REPO = "policyengine/policyengine-us-data"
YEAR = "2024"  # year key inside H5 groups

# State FIPS -> abbreviation and name
STATE_FIPS_TO_ABBREV = {
    1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT", 10: "DE",
    11: "DC", 12: "FL", 13: "GA", 15: "HI", 16: "ID", 17: "IL", 18: "IN",
    19: "IA", 20: "KS", 21: "KY", 22: "LA", 23: "ME", 24: "MD", 25: "MA",
    26: "MI", 27: "MN", 28: "MS", 29: "MO", 30: "MT", 31: "NE", 32: "NV",
    33: "NH", 34: "NJ", 35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH",
    40: "OK", 41: "OR", 42: "PA", 44: "RI", 45: "SC", 46: "SD", 47: "TN",
    48: "TX", 49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV", 55: "WI",
    56: "WY",
}

STATE_ABBREV_TO_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

# Tenure type string -> simplified integer code
TENURE_MAP = {
    b"OWNED_WITH_MORTGAGE": 1,
    b"RENTED": 2,
    b"NONE": 0,
    # SPM unit tenure uses slightly different labels
    b"OWNER_WITH_MORTGAGE": 1,
    b"OWNER_WITHOUT_MORTGAGE": 1,
    b"RENTER": 2,
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Variable extraction helpers
# ---------------------------------------------------------------------------


def _read_var(f: h5py.File, name: str, year: str = YEAR):
    """Read a variable from H5, returning None if missing."""
    if name not in f:
        return None
    grp = f[name]
    if year not in grp:
        # Fall back to whatever year key exists
        keys = list(grp.keys())
        if not keys:
            return None
        year = keys[0]
    return grp[year][:]


def _map_to_persons(person_entity_ids, entity_ids, entity_values):
    """
    Map entity-level values (household or SPM unit) to person-level.

    person_entity_ids: int array (n_persons,) - e.g. person_household_id
    entity_ids: int array (n_entities,) - e.g. household_id
    entity_values: array (n_entities,) - the entity-level variable

    Returns array (n_persons,) with the entity value for each person.
    """
    # Build lookup: entity_id -> index
    entity_id_to_idx = {}
    for idx, eid in enumerate(entity_ids):
        entity_id_to_idx[int(eid)] = idx

    n_persons = len(person_entity_ids)
    # Determine output dtype
    out = np.zeros(n_persons, dtype=entity_values.dtype)
    for i in range(n_persons):
        eid = int(person_entity_ids[i])
        idx = entity_id_to_idx.get(eid)
        if idx is not None:
            out[i] = entity_values[idx]
    return out


def extract_persons(h5_path: str, geo_id: str, geo_type: str):
    """
    Extract person-level records from an H5 file.

    Returns:
        dict with "geo_id", "geo_type", "persons" list, and "zcta_weights" dict
        zcta_weights maps zcta -> total household weight in this file
    """
    with h5py.File(h5_path, "r") as f:
        n_persons = _read_var(f, "person_id")
        if n_persons is None:
            log.warning("No person_id in %s, skipping", h5_path)
            return None
        n_persons = len(n_persons)

        # Entity IDs for mapping household/spm-level vars to persons
        person_hh_id = _read_var(f, "person_household_id")
        hh_id = _read_var(f, "household_id")
        person_spm_id = _read_var(f, "person_spm_unit_id")
        spm_id = _read_var(f, "spm_unit_id")

        # --- Person-level variables ---
        age = _read_var(f, "age")
        is_female = _read_var(f, "is_female")
        cps_race = _read_var(f, "cps_race")
        is_hispanic = _read_var(f, "is_hispanic")
        employment_income = _read_var(f, "employment_income_before_lsr")
        self_employment_income = _read_var(f, "self_employment_income_before_lsr")
        occupation = _read_var(f, "detailed_occupation_recode")
        own_children = _read_var(f, "own_children_in_household")
        is_college = _read_var(f, "is_full_time_college_student")
        is_disabled = _read_var(f, "is_disabled")
        ssi = _read_var(f, "ssi_reported")
        tanf = _read_var(f, "tanf_reported")
        unemployment = _read_var(f, "unemployment_compensation")
        social_security = _read_var(f, "social_security")

        # --- Household-level variables (need mapping to person) ---
        hh_weight_raw = _read_var(f, "household_weight")
        zcta_raw = _read_var(f, "zcta")
        tenure_raw = _read_var(f, "tenure_type")

        # --- SPM-unit-level variables ---
        snap_raw = _read_var(f, "snap_reported")
        spm_tenure_raw = _read_var(f, "spm_unit_tenure_type")

        # Map household-level vars to person-level
        if hh_id is not None and person_hh_id is not None:
            if hh_weight_raw is not None:
                hh_weight = _map_to_persons(person_hh_id, hh_id, hh_weight_raw)
            else:
                hh_weight = np.ones(n_persons, dtype=np.float32)

            if zcta_raw is not None:
                zcta_person = _map_to_persons(person_hh_id, hh_id, zcta_raw)
            else:
                zcta_person = np.array([b""] * n_persons)

            if tenure_raw is not None:
                tenure_person = _map_to_persons(person_hh_id, hh_id, tenure_raw)
            else:
                tenure_person = None
        else:
            hh_weight = np.ones(n_persons, dtype=np.float32)
            zcta_person = np.array([b""] * n_persons)
            tenure_person = None

        # Map SPM-unit-level vars to person-level
        if spm_id is not None and person_spm_id is not None:
            if snap_raw is not None:
                snap_person = _map_to_persons(person_spm_id, spm_id, snap_raw)
            else:
                snap_person = np.zeros(n_persons, dtype=np.float32)
        else:
            snap_person = np.zeros(n_persons, dtype=np.float32)

        # Determine tenure: prefer household-level, fallback to SPM tenure
        if tenure_person is not None:
            tenure_codes = np.array(
                [TENURE_MAP.get(t, 0) for t in tenure_person], dtype=np.int8
            )
        elif spm_tenure_raw is not None and spm_id is not None and person_spm_id is not None:
            spm_tenure_person = _map_to_persons(person_spm_id, spm_id, spm_tenure_raw)
            tenure_codes = np.array(
                [TENURE_MAP.get(t, 0) for t in spm_tenure_person], dtype=np.int8
            )
        else:
            tenure_codes = np.zeros(n_persons, dtype=np.int8)

        # Build ZCTA weight accumulator (for zcta_to_district lookup)
        zcta_weights = defaultdict(float)
        if hh_weight_raw is not None and zcta_raw is not None:
            for z, w in zip(zcta_raw, hh_weight_raw):
                z_str = z.decode("utf-8") if isinstance(z, bytes) else str(z)
                if z_str:
                    zcta_weights[z_str] += float(w)

        # Build person records
        persons = []
        for i in range(n_persons):
            # Decode ZCTA
            z = zcta_person[i]
            zcta_str = z.decode("utf-8") if isinstance(z, bytes) else str(z)

            person = {
                "age": int(age[i]) if age is not None else None,
                "is_female": bool(is_female[i]) if is_female is not None else None,
                "cps_race": int(cps_race[i]) if cps_race is not None else None,
                "is_hispanic": bool(is_hispanic[i]) if is_hispanic is not None else None,
                "employment_income": round(float(employment_income[i]), 0)
                if employment_income is not None
                else None,
                "self_employment_income": round(float(self_employment_income[i]), 0)
                if self_employment_income is not None
                else None,
                "occupation_code": int(occupation[i])
                if occupation is not None
                else None,
                "tenure_type": int(tenure_codes[i]),
                "children_count": int(own_children[i])
                if own_children is not None
                else None,
                "is_in_college": bool(is_college[i])
                if is_college is not None
                else None,
                "is_disabled": bool(is_disabled[i])
                if is_disabled is not None
                else None,
                "receives_ssi": bool(ssi[i] > 0) if ssi is not None else None,
                "receives_snap": bool(snap_person[i] > 0),
                "receives_tanf": bool(tanf[i] > 0) if tanf is not None else None,
                "receives_unemployment": bool(unemployment[i] > 0)
                if unemployment is not None
                else None,
                "receives_social_security": bool(social_security[i] > 0)
                if social_security is not None
                else None,
                "social_security": round(float(social_security[i]), 0)
                if social_security is not None
                else None,
                "zcta": zcta_str if zcta_str else None,
                "weight": round(float(hh_weight[i]), 2),
            }
            persons.append(person)

    return {
        "geo_id": geo_id,
        "geo_type": geo_type,
        "persons": persons,
        "zcta_weights": dict(zcta_weights),
    }


# ---------------------------------------------------------------------------
# File processing (runs in worker processes)
# ---------------------------------------------------------------------------


def process_file(hf_path: str, geo_id: str, geo_type: str, output_dir: str):
    """
    Download one H5 file, extract persons, write gzipped JSON.
    Returns (geo_id, zcta_weights) for building the ZCTA lookup.
    """
    try:
        local_path = hf_hub_download(HF_REPO, hf_path)
        result = extract_persons(local_path, geo_id, geo_type)
        if result is None:
            return (geo_id, {})

        # Write output
        subdir = os.path.join(output_dir, geo_type + "s")
        os.makedirs(subdir, exist_ok=True)
        out_path = os.path.join(subdir, f"{geo_id}.json.gz")

        output_data = {
            f"{geo_type}_id": geo_id,
            "persons": result["persons"],
        }

        with gzip.open(out_path, "wt", encoding="utf-8") as fout:
            json.dump(output_data, fout, separators=(",", ":"))

        return (geo_id, result["zcta_weights"])

    except Exception as e:
        log.error("Failed processing %s: %s", hf_path, e)
        return (geo_id, {})


# ---------------------------------------------------------------------------
# Lookup builders
# ---------------------------------------------------------------------------


def build_zcta_to_district(all_zcta_weights: dict, output_dir: str):
    """
    Build ZCTA -> district mapping with population-share weights.

    all_zcta_weights: {district_id: {zcta: total_weight}}
    """
    # Invert: zcta -> [(district, weight), ...]
    zcta_districts = defaultdict(list)
    for district_id, zw in all_zcta_weights.items():
        for zcta, weight in zw.items():
            if zcta:
                zcta_districts[zcta].append((district_id, weight))

    # Normalize to shares
    lookup = {}
    for zcta, entries in sorted(zcta_districts.items()):
        total = sum(w for _, w in entries)
        if total <= 0:
            continue
        shares = [
            {"district": d, "share": round(w / total, 4)}
            for d, w in sorted(entries, key=lambda x: -x[1])
        ]
        lookup[zcta] = shares

    lookup_dir = os.path.join(output_dir, "lookup")
    os.makedirs(lookup_dir, exist_ok=True)
    out_path = os.path.join(lookup_dir, "zcta_to_district.json.gz")

    with gzip.open(out_path, "wt", encoding="utf-8") as fout:
        json.dump(lookup, fout, separators=(",", ":"))

    log.info("Wrote ZCTA->district lookup: %d ZCTAs -> %s", len(lookup), out_path)
    return lookup


def build_locations_list(
    district_ids: list, state_ids: list, zcta_lookup: dict, output_dir: str
):
    """
    Build a location autocomplete list.

    Includes states, districts, and ZCTAs.
    """
    locations = []

    # States
    for state_abbrev in sorted(state_ids):
        name = STATE_ABBREV_TO_NAME.get(state_abbrev, state_abbrev)
        locations.append(
            {"type": "state", "id": state_abbrev, "label": f"{name} ({state_abbrev})"}
        )

    # Districts
    for district_id in sorted(district_ids):
        locations.append(
            {"type": "district", "id": district_id, "label": district_id}
        )

    # ZCTAs
    for zcta in sorted(zcta_lookup.keys()):
        # Get the primary district for labeling
        primary = zcta_lookup[zcta][0]["district"] if zcta_lookup[zcta] else ""
        state_abbrev = primary.split("-")[0] if primary else ""
        locations.append(
            {
                "type": "zip",
                "id": zcta,
                "label": f"{zcta} ({state_abbrev})" if state_abbrev else zcta,
            }
        )

    lookup_dir = os.path.join(output_dir, "lookup")
    os.makedirs(lookup_dir, exist_ok=True)
    out_path = os.path.join(lookup_dir, "locations.json.gz")

    with gzip.open(out_path, "wt", encoding="utf-8") as fout:
        json.dump(locations, fout, separators=(",", ":"))

    log.info(
        "Wrote locations list: %d entries (%d states, %d districts, %d zips) -> %s",
        len(locations),
        len(state_ids),
        len(district_ids),
        len(zcta_lookup),
        out_path,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def discover_files():
    """Discover district and state H5 files in the HF repo."""
    log.info("Discovering files in %s ...", HF_REPO)

    districts = []
    for item in list_repo_tree(HF_REPO, path_in_repo="districts"):
        if hasattr(item, "path") and item.path.endswith(".h5"):
            # e.g. districts/NY-17.h5 -> NY-17
            geo_id = Path(item.path).stem
            districts.append((item.path, geo_id, "district"))

    states = []
    for item in list_repo_tree(HF_REPO, path_in_repo="states"):
        if hasattr(item, "path") and item.path.endswith(".h5"):
            geo_id = Path(item.path).stem
            states.append((item.path, geo_id, "state"))

    log.info("Found %d district files and %d state files", len(districts), len(states))
    return districts, states


def main():
    parser = argparse.ArgumentParser(
        description="Convert PolicyEngine H5 microdata to gzipped JSON for HiveSight."
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./output",
        help="Root output directory (default: ./output)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of parallel workers (default: 4)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of files to process per type (0 = all, useful for testing)",
    )
    parser.add_argument(
        "--districts-only",
        action="store_true",
        help="Only process district files, skip states",
    )
    parser.add_argument(
        "--states-only",
        action="store_true",
        help="Only process state files, skip districts",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload output to HuggingFace after processing",
    )
    parser.add_argument(
        "--hf-repo",
        type=str,
        default="",
        help="HuggingFace repo to upload to (required if --upload is set)",
    )
    args = parser.parse_args()

    output_dir = os.path.abspath(args.output_dir)
    os.makedirs(output_dir, exist_ok=True)
    log.info("Output directory: %s", output_dir)

    # Discover files
    district_files, state_files = discover_files()

    # Apply filters
    if args.states_only:
        district_files = []
    if args.districts_only:
        state_files = []
    if args.limit > 0:
        district_files = district_files[: args.limit]
        state_files = state_files[: args.limit]

    all_files = district_files + state_files
    if not all_files:
        log.error("No files to process.")
        sys.exit(1)

    log.info(
        "Processing %d district files and %d state files with %d workers",
        len(district_files),
        len(state_files),
        args.workers,
    )

    # Process files in parallel
    try:
        from tqdm import tqdm
    except ImportError:
        # Minimal fallback if tqdm not installed
        def tqdm(iterable, **kwargs):
            return iterable

    # Collect ZCTA weights from district files only (for ZCTA->district mapping)
    all_zcta_weights = {}  # district_id -> {zcta: weight}
    district_ids = []
    state_ids = []

    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {}
        for hf_path, geo_id, geo_type in all_files:
            fut = executor.submit(process_file, hf_path, geo_id, geo_type, output_dir)
            futures[fut] = (geo_id, geo_type)

        for fut in tqdm(
            as_completed(futures), total=len(futures), desc="Processing H5 files"
        ):
            geo_id, geo_type = futures[fut]
            try:
                result_geo_id, zcta_weights = fut.result()
                if geo_type == "district":
                    district_ids.append(geo_id)
                    if zcta_weights:
                        all_zcta_weights[geo_id] = zcta_weights
                elif geo_type == "state":
                    state_ids.append(geo_id)
            except Exception as e:
                log.error("Error processing %s: %s", geo_id, e)

    # Build lookup files (only if we processed districts)
    if district_ids:
        zcta_lookup = build_zcta_to_district(all_zcta_weights, output_dir)
        build_locations_list(district_ids, state_ids, zcta_lookup, output_dir)
    else:
        log.info("No districts processed; skipping ZCTA lookup and locations list.")

    # Upload if requested
    if args.upload:
        if not args.hf_repo:
            log.error("--hf-repo is required when --upload is set")
            sys.exit(1)
        try:
            from huggingface_hub import HfApi

            api = HfApi()
            log.info("Uploading to %s ...", args.hf_repo)
            api.upload_folder(
                folder_path=output_dir,
                repo_id=args.hf_repo,
                repo_type="dataset",
            )
            log.info("Upload complete.")
        except Exception as e:
            log.error("Upload failed: %s", e)
            sys.exit(1)

    log.info("Done. Output in %s", output_dir)


if __name__ == "__main__":
    main()
