"""State-level human targets from BRFSS 2023 for the small-area validation.

Items (BRFSS 2023 questionnaire wordings, full-sample core):
  GENHLTH, EXERANY2, MEDCOST1, SMOKE100.
Weight: _LLCPWT. States with n >= 300 kept (all pass in practice).

Run: uv run --with pandas python analysis/build_brfss_targets.py
"""

import json
import os

import numpy as np
import pandas as pd

SCRATCH = os.environ.get(
    "HS_SCRATCH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad",
)
XPT = os.path.join(SCRATCH, "LLCP2023.XPT ")  # CDC ships trailing space in name
OUT = os.path.join(os.path.dirname(__file__), "..", "paper", "artifacts", "brfss-state-targets.json")

FIPS = {
    1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT", 10: "DE",
    11: "DC", 12: "FL", 13: "GA", 15: "HI", 16: "ID", 17: "IL", 18: "IN",
    19: "IA", 20: "KS", 21: "KY", 22: "LA", 23: "ME", 24: "MD", 25: "MA",
    26: "MI", 27: "MN", 28: "MS", 29: "MO", 30: "MT", 31: "NE", 32: "NV",
    33: "NH", 34: "NJ", 35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH",
    40: "OK", 41: "OR", 42: "PA", 44: "RI", 45: "SC", 46: "SD", 47: "TN",
    48: "TX", 49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV", 55: "WI",
    56: "WY",
}

ITEMS = {
    "brfss_genhlth": {
        "var": "GENHLTH",
        "wording": "Would you say that in general your health is excellent, very good, good, fair, or poor?",
        "options": ["Excellent", "Very good", "Good", "Fair", "Poor"],
        "codes": {1: 0, 2: 1, 3: 2, 4: 3, 5: 4},
        "positiveOptions": [0, 1],
        "valence": "positive",
        "domain": "health",
    },
    "brfss_exerany": {
        "var": "EXERANY2",
        "wording": "During the past month, other than your regular job, did you participate in any physical activities or exercises such as running, calisthenics, golf, gardening, or walking for exercise?",
        "options": ["Yes", "No"],
        "codes": {1: 0, 2: 1},
        "positiveOptions": [0],
        "valence": "positive",
        "domain": "health",
    },
    "brfss_medcost": {
        "var": "MEDCOST1",
        "wording": "Was there a time in the past 12 months when you needed to see a doctor but could not because you could not afford it?",
        "options": ["Yes", "No"],
        "codes": {1: 0, 2: 1},
        "positiveOptions": [0],
        "valence": "negative",
        "domain": "health",
    },
    "brfss_smoke100": {
        "var": "SMOKE100",
        "wording": "Have you smoked at least 100 cigarettes in your entire life?",
        "options": ["Yes", "No"],
        "codes": {1: 0, 2: 1},
        "positiveOptions": [0],
        "valence": "neutral",
        "domain": "health",
    },
}


def main():
    cols = ["_STATE", "_LLCPWT"] + [v["var"] for v in ITEMS.values()]
    print("reading BRFSS XPT (large)...")
    df = pd.read_sas(XPT, format="xport")
    df = df[[c for c in cols if c in df.columns]].copy()
    print(f"  {len(df)} rows")
    df["state"] = df["_STATE"].map(FIPS)
    df = df[df["state"].notna() & (df["_LLCPWT"] > 0)].copy()

    out_items = {}
    for item_id, spec in ITEMS.items():
        sub = df[df[spec["var"]].isin(spec["codes"])].copy()
        sub["_opt"] = sub[spec["var"]].map(spec["codes"])
        pos = spec["positiveOptions"]
        national = float(
            np.average(sub["_opt"].isin(pos).astype(float), weights=sub["_LLCPWT"])
        )
        states = {}
        for st, g in sub.groupby("state"):
            if len(g) < 300:
                continue
            states[st] = {
                "share": float(np.average(g["_opt"].isin(pos).astype(float), weights=g["_LLCPWT"])),
                "n": int(len(g)),
            }
        out_items[item_id] = {
            **{k: spec[k] for k in ["wording", "options", "positiveOptions", "valence", "domain"]},
            "national": national,
            "n": int(len(sub)),
            "states": states,
        }
        print(f"{item_id}: national {national:.3f}, {len(states)} states")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"version": "brfss-2023-v1", "weight": "_LLCPWT", "items": out_items}, open(OUT, "w"), indent=1)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
