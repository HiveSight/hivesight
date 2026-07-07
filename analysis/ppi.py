"""Prediction-powered inference (PPI) evaluation, per PAP v2.

For each anchor item: combine a small weighted human anchor subsample
(n=200) with the LLM cell predictions to form a rectified estimate with a
valid confidence interval (Angelopoulos et al. 2023, mean-estimation form):

    theta_PP = m_f + weighted_mean_anchor(y_i - f_i)

where m_f is the population-weighted mean of the LLM prediction (computed
from the anchor survey's full-sample weights over age x sex groups, no
labels used) and f_i is the LLM prediction for respondent i's age x sex
group. Coverage of the full-sample human target is evaluated over 500
weighted redraws of the anchor, against (a) the human-only n=200 interval
and (b) the unrectified LLM point estimate.

Run after the cells arm has populated anchor-cells-predictions.jsonl:
  uv run --with pandas python analysis/ppi.py
"""

import gzip
import json
import os

import numpy as np
import pandas as pd

SCRATCH = os.environ.get(
    "HS_SCRATCH",
    "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad",
)
ROOT = os.path.join(os.path.dirname(__file__), "..")
BANK = os.path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v1.json")
PRED_LOG = os.path.join(ROOT, "evals", "results", "anchor-cells-predictions.jsonl")
US_TABLE = os.path.join(ROOT, "public", "data", "v1", "US.json")
OUT = os.path.join(ROOT, "paper", "artifacts", "ppi.json")

ANCHOR_N = 200
REPLICATES = 500
SEED = 20260707
MODEL = "gpt-5-mini"


def age_band(age):
    if age < 30:
        return "18-29"
    if age < 45:
        return "30-44"
    if age < 65:
        return "45-64"
    return "65+"


def main():
    bank = json.load(open(BANK))
    items = {i["itemId"]: i for i in bank["items"]}
    us = json.load(open(US_TABLE))
    cells = us["table"]["cells"]

    # LLM cell predictions -> positive share per cell -> age x sex group means
    # (weighted by microdata cell weights within group).
    preds = {}
    with open(PRED_LOG) as f:
        for line in f:
            r = json.loads(line)
            if r["model"] != MODEL:
                continue
            preds.setdefault(r["itemId"], {})[r["cellIdx"]] = r["dist"]

    frames = {}
    for name, src in [("gss-respondents", "gss2024"), ("shed-respondents", "shed2024")]:
        with gzip.open(os.path.join(SCRATCH, f"{name}.json.gz"), "rt") as f:
            frames[src] = pd.DataFrame(json.load(f))

    rng = np.random.default_rng(SEED)
    per_item = {}
    cov_ppi, cov_human, widths_ratio, cov_llm_asif = [], [], [], []

    for item_id, item in items.items():
        if item_id not in preds:
            continue
        pos = item["positiveOptions"]
        cell_pred = preds[item_id]

        # f per age x sex group: microdata-weighted mean of cell positive shares.
        group_f, group_w = {}, {}
        for idx, cell in enumerate(cells):
            if idx not in cell_pred:
                continue
            share = sum(cell_pred[idx][oi] for oi in pos)
            g = (cell["age"], cell["sex"])
            group_f[g] = group_f.get(g, 0.0) + cell["weight"] * share
            group_w[g] = group_w.get(g, 0.0) + cell["weight"]
        group_f = {g: group_f[g] / group_w[g] for g in group_f}

        df = frames[item["source"]]
        sub = df[df["itemId"] == item_id].copy()
        sub["y"] = sub["opt"].isin(pos).astype(float)
        sub["g"] = list(zip(sub["age"].apply(age_band), sub["sex"]))
        sub = sub[sub["g"].isin(group_f)].reset_index(drop=True)
        if len(sub) < 600:
            continue
        sub["f"] = sub["g"].map(group_f)
        w_full = sub["weight"].values
        theta_true = float(np.average(sub["y"], weights=w_full))

        # Population mean of f under the survey's full-sample weights (no labels).
        m_f = float(np.average(sub["f"], weights=w_full))
        llm_raw = m_f  # unrectified LLM estimate at group granularity

        p_draw = w_full / w_full.sum()
        y, fv = sub["y"].values, sub["f"].values

        hits_ppi = hits_h = 0
        w_ppi_list, w_h_list = [], []
        for _ in range(REPLICATES):
            idx = rng.choice(len(sub), size=ANCHOR_N, replace=True, p=p_draw)
            yi, fi = y[idx], fv[idx]
            # Equal-weight within anchor (weights used for the draw).
            rect = yi - fi
            theta_pp = m_f + rect.mean()
            se_pp = rect.std(ddof=1) / np.sqrt(ANCHOR_N)
            lo, hi = theta_pp - 1.96 * se_pp, theta_pp + 1.96 * se_pp
            hits_ppi += int(lo <= theta_true <= hi)
            w_ppi_list.append(hi - lo)

            theta_h = yi.mean()
            se_h = yi.std(ddof=1) / np.sqrt(ANCHOR_N)
            lo_h, hi_h = theta_h - 1.96 * se_h, theta_h + 1.96 * se_h
            hits_h += int(lo_h <= theta_true <= hi_h)
            w_h_list.append(hi_h - lo_h)

        cov_p, cov_h = hits_ppi / REPLICATES, hits_h / REPLICATES
        ratio = float(np.median(w_ppi_list) / np.median(w_h_list))
        per_item[item_id] = {
            "thetaTrue": theta_true,
            "llmRaw": llm_raw,
            "llmRawAbsError": abs(llm_raw - theta_true),
            "coveragePPI": cov_p,
            "coverageHuman": cov_h,
            "medianWidthPPI": float(np.median(w_ppi_list)),
            "medianWidthHuman": float(np.median(w_h_list)),
            "widthRatio": ratio,
        }
        cov_ppi.append(cov_p)
        cov_human.append(cov_h)
        widths_ratio.append(ratio)
        cov_llm_asif.append(abs(llm_raw - theta_true))

    out = {
        "version": "ppi-v1",
        "anchorN": ANCHOR_N,
        "replicates": REPLICATES,
        "model": MODEL,
        "granularity": "age_band x sex groups from cell predictions",
        "pooled": {
            "items": len(per_item),
            "meanCoveragePPI": float(np.mean(cov_ppi)),
            "meanCoverageHuman": float(np.mean(cov_human)),
            "medianWidthRatio": float(np.median(widths_ratio)),
            "shareItemsPPINarrower": float(np.mean([r < 1 for r in widths_ratio])),
            "meanLlmRawAbsError": float(np.mean(cov_llm_asif)),
        },
        "items": per_item,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), indent=1)
    p = out["pooled"]
    print(f"PPI over {p['items']} items: coverage {p['meanCoveragePPI']:.3f} (human-only {p['meanCoverageHuman']:.3f}), "
          f"median width ratio {p['medianWidthRatio']:.3f}, PPI narrower on {p['shareItemsPPINarrower']:.0%} of items")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
