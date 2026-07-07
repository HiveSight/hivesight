"""Build the v1 data release: post-stratification cell tables + verbatim
sample pools for the national file and all states.

Output: public/data/v1/{GEO}.json with {table: CellTable, samples: [...]}.
Band and cell logic mirrors src/engine/bands.ts and src/engine/data.ts
(reduceToCells); parity is pinned by src/engine/__tests__/parity.test.ts.

Districts are not prebuilt: the app reduces district files at request time
(they are small); states and US are prebuilt because they are large.
"""

import gzip
import io
import json
import os
import sys
import urllib.request

import numpy as np

HF_BASE = "https://huggingface.co/datasets/MaxGhenis/hivesight-persona-data/resolve/f27f20ae7d9dd255bd9d93b4ffaf3f057685c813"
DATASET_VERSION = "hivesight-cells:v1"
REFINE_MIN_SHARE = 0.0025
SAMPLE_N = 1200
SEED = 20260707

STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
]

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data", "v1")

US_LOCAL = os.environ.get(
    "US_PERSONA_PATH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad/US.json.gz",
)

SAMPLE_FIELDS = [
    "age", "is_female", "employment_income", "self_employment_income",
    "tenure_type", "children_count", "receives_snap", "receives_ssi",
    "receives_tanf", "receives_social_security", "receives_unemployment",
    "is_in_college", "is_disabled", "weight",
]


def age_band(age):
    if age < 30:
        return "18-29"
    if age < 45:
        return "30-44"
    if age < 65:
        return "45-64"
    return "65+"


def earned_income_band(earned):
    if earned <= 0:
        return "$0 earned"
    if earned < 25_000:
        return "$1-$24,999"
    if earned < 75_000:
        return "$25k-$74,999"
    if earned < 150_000:
        return "$75k-$149,999"
    return "$150k+"


def reduce_to_cells(persons, geography):
    total_weight = sum(p["weight"] for p in persons)
    refine_min = total_weight * REFINE_MIN_SHARE

    refined = {}
    for p in persons:
        earned = p["employment_income"] + p["self_employment_income"]
        key = (
            age_band(p["age"]),
            earned_income_band(earned),
            "women" if p["is_female"] else "men",
            "homeowners" if p["tenure_type"] == 1 else "renters or other housing",
            "with children at home" if p["children_count"] > 0 else "without children at home",
            "receiving means-tested benefits"
            if (p["receives_snap"] or p["receives_ssi"] or p["receives_tanf"])
            else "not receiving means-tested benefits",
            "receiving Social Security" if p["receives_social_security"] else "not receiving Social Security",
        )
        cur = refined.setdefault(key, [0.0, 0])
        cur[0] += p["weight"]
        cur[1] += 1

    merged = {}
    for key, (w, n) in refined.items():
        use_detail = w >= refine_min
        out_key = key if use_detail else key[:3]
        cur = merged.setdefault(out_key, {"weight": 0.0, "n": 0, "detailed": use_detail})
        cur["weight"] += w
        cur["n"] += n

    cells = []
    for key, v in sorted(merged.items(), key=lambda kv: -kv[1]["weight"]):
        cell = {
            "age": key[0],
            "income": key[1],
            "sex": key[2],
            "weight": round(v["weight"], 2),
            "n": v["n"],
            "detailed": v["detailed"],
        }
        if v["detailed"]:
            cell["tenure"], cell["children"], cell["benefits"], cell["social_security"] = (
                key[3], key[4], key[5], key[6],
            )
        cells.append(cell)

    return {
        "datasetVersion": DATASET_VERSION,
        "geography": geography,
        "totalWeight": round(total_weight, 2),
        "cells": cells,
    }


def systematic_sample(persons, n, rng):
    total = sum(p["weight"] for p in persons)
    if len(persons) <= n:
        picked = persons
    else:
        weights = np.array([p["weight"] for p in persons])
        cumw = np.cumsum(weights)
        step = total / n
        targets = rng.random() * step + step * np.arange(n)
        idx = np.searchsorted(cumw, targets)
        picked = [persons[i] for i in idx]
    return [
        {k: (round(p[k], 2) if isinstance(p[k], float) else p[k]) for k in SAMPLE_FIELDS}
        for p in picked
    ]


def load_persons(geo):
    if geo == "US" and os.path.exists(US_LOCAL):
        with gzip.open(US_LOCAL) as f:
            return json.load(f)["persons"]
    url = f"{HF_BASE}/districts/{geo}.json.gz"
    with urllib.request.urlopen(url, timeout=180) as res:
        raw = res.read()
    return json.loads(gzip.decompress(raw))["persons"]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    geos = sys.argv[1:] or (["US"] + STATES)
    rng = np.random.default_rng(SEED)
    for geo in geos:
        out_path = os.path.join(OUT_DIR, f"{geo}.json")
        if os.path.exists(out_path):
            print(f"{geo}: exists, skipping")
            continue
        try:
            persons = load_persons(geo)
        except Exception as e:
            print(f"{geo}: FAILED to load ({e})")
            continue
        table = reduce_to_cells(persons, geo)
        samples = systematic_sample(persons, SAMPLE_N, rng)
        with open(out_path, "w") as f:
            json.dump({"table": table, "samples": samples}, f)
        size_kb = os.path.getsize(out_path) / 1024
        print(f"{geo}: {len(persons)} records -> {len(table['cells'])} cells, {len(samples)} samples ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
