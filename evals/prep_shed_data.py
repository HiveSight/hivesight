"""Reduce the national persona file to post-stratification cells + persona samples.

Mirrors the cell logic in run-shed-powered.mjs; output feeds that script.
The raw national JSON exceeds Node's max string length, so reduction happens here.
"""

import gzip
import json
import os

import numpy as np

SEED = 20260707
PERSONA_N = int(os.environ.get("PERSONA_N", "150"))
N_SAMPLES = 4  # one per question
DATA_PATH = os.environ.get(
    "US_PERSONA_PATH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad/US.json.gz",
)
OUT_PATH = os.path.join(os.path.dirname(__file__), "results", "prep-shed.json")

REFINE_MIN_SHARE = 0.0025


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


def main():
    print("Loading microdata (python)...")
    with gzip.open(DATA_PATH) as f:
        persons = json.load(f)["persons"]
    print(f"  {len(persons)} records")

    total_weight = sum(p["weight"] for p in persons)
    refine_min = total_weight * REFINE_MIN_SHARE

    # Pass 1: fully refined cells.
    refined = {}
    for p in persons:
        earned = p["employment_income"] + p["self_employment_income"]
        base = (age_band(p["age"]), earned_income_band(earned), "women" if p["is_female"] else "men")
        detail = (
            "homeowners" if p["tenure_type"] == 1 else "renters or other housing",
            "with children at home" if p["children_count"] > 0 else "without children at home",
            "receiving means-tested benefits"
            if (p["receives_snap"] or p["receives_ssi"] or p["receives_tanf"])
            else "not receiving means-tested benefits",
            "receiving Social Security" if p["receives_social_security"] else "not receiving Social Security",
        )
        key = base + detail
        cur = refined.setdefault(key, [0.0, 0])
        cur[0] += p["weight"]
        cur[1] += 1

    # Pass 2: merge sub-threshold refined cells into base cells.
    cells = {}
    for key, (w, n) in refined.items():
        base, detail = key[:3], key[3:]
        use_detail = w >= refine_min
        out_key = key if use_detail else base
        cur = cells.setdefault(out_key, {"weight": 0.0, "n": 0, "detailed": use_detail})
        cur["weight"] += w
        cur["n"] += n

    cell_list = []
    for key, v in sorted(cells.items(), key=lambda kv: -kv[1]["weight"]):
        cell = {
            "age": key[0],
            "income": key[1],
            "sex": key[2],
            "weight": v["weight"],
            "n": v["n"],
            "detailed": v["detailed"],
        }
        if v["detailed"]:
            cell["tenure"], cell["children"], cell["benefits"], cell["social_security"] = key[3], key[4], key[5], key[6]
        cell_list.append(cell)

    detailed_count = sum(1 for c in cell_list if c["detailed"])
    covered = sum(c["weight"] for c in cell_list) / total_weight
    print(f"  {len(cell_list)} cells ({detailed_count} detailed), {covered:.1%} of weight")

    # Weighted samples for the persona arm: numpy weighted choice without replacement
    # is slow at 4.2M; use systematic sampling on the cumulative weight axis.
    weights = np.array([p["weight"] for p in persons])
    cumw = np.cumsum(weights)
    rng = np.random.default_rng(SEED)
    keep_fields = [
        "age", "is_female", "employment_income", "self_employment_income",
        "tenure_type", "children_count", "receives_snap", "receives_ssi",
        "receives_tanf", "receives_social_security", "receives_unemployment",
        "is_in_college", "is_disabled", "weight",
    ]
    samples = []
    for _ in range(N_SAMPLES):
        step = total_weight / PERSONA_N
        start = rng.random() * step
        targets = start + step * np.arange(PERSONA_N)
        idx = np.searchsorted(cumw, targets)
        samples.append([{k: persons[i][k] for k in keep_fields} for i in idx])

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(
            {
                "seed": SEED,
                "personaN": PERSONA_N,
                "totalWeight": total_weight,
                "cells": cell_list,
                "samples": samples,
            },
            f,
        )
    print(f"  wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
