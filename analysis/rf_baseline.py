"""Random-forest/GBM baseline: how well do demographics alone predict item
responses when learned from the anchor survey's own respondents?

Per PAP v2 (exploratory): train a gradient-boosted classifier per item on an
80% weighted split of the anchor survey's respondents (features: age band,
sex, tenure, plus household income band for SHED), predict class
probabilities on the held-out 20%, aggregate with survey weights, and score
against the full-sample human targets used for the LLM arms.

Run: uv run --with "pandas,scikit-learn" python analysis/rf_baseline.py
"""

import gzip
import json
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split

SCRATCH = os.environ.get(
    "HS_SCRATCH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad",
)
ROOT = os.path.join(os.path.dirname(__file__), "..")
BANK = os.path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v1.json")
OUT = os.path.join(ROOT, "paper", "artifacts", "rf-baseline.json")

SEED = 20260707


def age_band(age):
    if age < 30:
        return "18-29"
    if age < 45:
        return "30-44"
    if age < 65:
        return "45-64"
    return "65+"


def load_responses(name):
    with gzip.open(os.path.join(SCRATCH, f"{name}.json.gz"), "rt") as f:
        return pd.DataFrame(json.load(f))


def positive_share(dist, positive):
    return float(sum(dist[i] for i in positive))


def main():
    bank = json.load(open(BANK))
    items = {i["itemId"]: i for i in bank["items"]}
    frames = {"gss2024": load_responses("gss-respondents"), "shed2024": load_responses("shed-respondents")}

    results = {}
    topline_errs, slice_errs = [], []

    for item_id, item in items.items():
        df = frames[item["source"]]
        sub = df[df["itemId"] == item_id].copy()
        if len(sub) < 400:
            continue
        sub["age_band"] = sub["age"].apply(age_band)

        feat_cols = ["age", "sex", "tenure"]
        if item["source"] == "shed2024":
            feat_cols.append("income_band")
        X = pd.get_dummies(sub[feat_cols], dummy_na=True)
        y = sub["opt"].values
        w = sub["weight"].values

        if len(np.unique(y)) < 2:
            continue
        Xtr, Xte, ytr, yte, wtr, wte, subtr, subte = train_test_split(
            X, y, w, sub, test_size=0.2, random_state=SEED
        )
        clf = HistGradientBoostingClassifier(random_state=SEED, max_depth=4)
        clf.fit(Xtr, ytr, sample_weight=wtr)
        proba = clf.predict_proba(Xte)
        classes = clf.classes_
        n_opt = len(item["options"])
        full = np.zeros((len(Xte), n_opt))
        for ci, c in enumerate(classes):
            full[:, int(c)] = proba[:, ci]

        # Weighted aggregate of predicted probabilities on the held-out fold.
        agg = (full * wte[:, None]).sum(axis=0) / wte.sum()
        human = np.array(item["targets"]["overall"]["dist"])
        pos = item["positiveOptions"]
        t_err = abs(positive_share(agg, pos) - positive_share(human, pos))

        slices_out, s_errs = {}, []
        subte = subte.reset_index(drop=True)
        for family, bins in (item["targets"].get("slices") or {}).items():
            col = {"age_band": "age_band", "sex": "sex", "income_band": "income_band", "tenure": "tenure"}.get(family)
            if col is None or col not in subte.columns:
                continue
            slices_out[family] = {}
            for label, target in bins.items():
                mask = (subte[col] == label).values
                if mask.sum() < 20:
                    continue
                ws = wte[mask]
                a = (full[mask] * ws[:, None]).sum(axis=0) / ws.sum()
                err = abs(positive_share(a, pos) - positive_share(np.array(target["dist"]), pos))
                slices_out[family][label] = {"estimate": positive_share(a, pos), "absError": err}
                s_errs.append(err)

        results[item_id] = {
            "toplineEstimate": positive_share(agg, pos),
            "toplineHuman": positive_share(human, pos),
            "toplineAbsError": t_err,
            "sliceMAE": float(np.mean(s_errs)) if s_errs else None,
            "slices": slices_out,
            "nTrain": int(len(Xtr)),
            "nTest": int(len(Xte)),
        }
        topline_errs.append(t_err)
        if s_errs:
            slice_errs.extend(s_errs)

    out = {
        "version": "rf-baseline-v1",
        "model": "HistGradientBoostingClassifier(max_depth=4)",
        "seed": SEED,
        "pooled": {
            "toplineMAE": float(np.mean(topline_errs)),
            "sliceMAE": float(np.mean(slice_errs)),
            "items": len(results),
        },
        "items": results,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), indent=1)
    print(f"RF baseline: {len(results)} items, topline MAE {np.mean(topline_errs):.3f}, slice MAE {np.mean(slice_errs):.3f}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
