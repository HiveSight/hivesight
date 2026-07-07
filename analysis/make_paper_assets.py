"""Assemble the flat summary the paper reads, and render its figures.

Inputs: paper/artifacts/{anchor-analysis,ppi,rf-baseline}.json,
        evals/results/{brfss-states-run-v1,shed-2024-powered-comparison-v2}.json
Output: paper/artifacts/summary.json, paper/figures/*.pdf

Run: uv run --with "numpy,scipy,matplotlib" python analysis/make_paper_assets.py
"""

import json
import os

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.stats import spearmanr

ROOT = os.path.join(os.path.dirname(__file__), "..")
ART = os.path.join(ROOT, "paper", "artifacts")
FIG = os.path.join(ROOT, "paper", "figures")
os.makedirs(FIG, exist_ok=True)

INK = "#191d2b"
INDIGO = "#3e4b8f"
HONEY = "#dd9a0a"
AMBER = "#b3671f"
GRAY = "#8a8fa0"

plt.rcParams.update({
    "font.size": 9, "axes.edgecolor": GRAY, "axes.labelcolor": INK,
    "text.color": INK, "xtick.color": INK, "ytick.color": INK,
    "axes.spines.top": False, "axes.spines.right": False,
    "figure.dpi": 150,
})


def savefig(fig, stem):
    for ext in ("pdf", "svg"):
        fig.savefig(os.path.join(FIG, f"{stem}.{ext}"))


def load(name, default=None):
    p = os.path.join(ART, f"{name}.json")
    if not os.path.exists(p):
        return default
    return json.load(open(p))


def main():
    anchor = load("anchor-analysis")
    ppi = load("ppi")
    rf = load("rf-baseline")
    brfss_run_p = os.path.join(ROOT, "evals", "results", "brfss-states-run-v1.json")
    brfss = json.load(open(brfss_run_p)) if os.path.exists(brfss_run_p) else None
    pilot = json.load(open(os.path.join(ROOT, "evals", "results", "shed-2024-powered-comparison-v2.json")))

    mini = "openai:gpt-5-mini"
    s = {"generatedFrom": sorted(os.listdir(ART))}

    # Pilot
    s["pilot"] = {k: {"topline": v["toplineMAE"], "slice": v["sliceMAE"]} for k, v in pilot["pooled"].items()}

    # Anchor pooled
    s["anchor"] = anchor["pooled"]
    s["hypotheses"] = anchor["hypotheses"]
    s["nItems"] = len(anchor["perItem"])

    # PPI + RF
    if ppi:
        s["ppi"] = ppi["pooled"]
    if rf:
        s["rf"] = rf["pooled"]

    # ---- Figure 1: pooled MAE by arm (topline + subgroup), full bank
    pool = anchor["pooled"]
    arms = [
        ("Persona roleplay*", f"persona:{mini}", "sliceMAE_subset20", "toplineMAE_subset20"),
        ("Direct estimate", f"naive:{mini}", "sliceMAE", "toplineMAE"),
        ("Population cells", f"cells:{mini}", "sliceMAE", "toplineMAE"),
    ]
    labels = [a[0] for a in arms if a[1] in pool]
    top = [pool[a[1]][a[3]] * 100 for a in arms if a[1] in pool]
    sub = [pool[a[1]][a[2]] * 100 for a in arms if a[1] in pool]
    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(5.4, 2.8))
    ax.bar(x - 0.18, top, 0.36, label="Topline MAE", color=GRAY)
    ax.bar(x + 0.18, sub, 0.36, label="Subgroup MAE", color=INDIGO)
    for xi, v in zip(x - 0.18, top):
        ax.text(xi, v + 0.3, f"{v:.1f}", ha="center", fontsize=8)
    for xi, v in zip(x + 0.18, sub):
        ax.text(xi, v + 0.3, f"{v:.1f}", ha="center", fontsize=8)
    ax.set_xticks(x, labels)
    ax.set_ylabel("Mean absolute error (pts)")
    ax.legend(frameon=False)
    fig.tight_layout()
    savefig(fig, "fig1-arms")
    plt.close(fig)

    # ---- Figure 2: signed topline error by valence (cells arm)
    per = anchor["perItem"]
    fig, ax = plt.subplots(figsize=(5.4, 2.6))
    order = ["positive", "neutral", "negative"]
    colors = {"positive": INDIGO, "neutral": GRAY, "negative": AMBER}
    for vi, val in enumerate(order):
        errs = [
            it["arms"][f"cells:{mini}"]["topline"]["signedError"] * 100
            for it in per.values()
            if it["valence"] == val and it["arms"].get(f"cells:{mini}", {}).get("topline")
        ]
        xs = np.random.default_rng(vi).normal(vi, 0.05, len(errs))
        ax.scatter(xs, errs, s=14, color=colors[val], alpha=0.75)
        ax.hlines(np.mean(errs), vi - 0.22, vi + 0.22, color=INK, lw=1.6)
    ax.axhline(0, color=GRAY, lw=0.7, ls="--")
    ax.set_xticks(range(3), [f"{v}\n(n={sum(1 for it in per.values() if it['valence']==v)})" for v in order])
    ax.set_ylabel("Signed topline error (pts)")
    fig.tight_layout()
    savefig(fig, "fig2-valence")
    plt.close(fig)

    # ---- BRFSS small-area
    if brfss:
        b = {"items": {}}
        fig, axes = plt.subplots(1, 4, figsize=(9.6, 2.6), sharey=False)
        for ax, (item_id, rec) in zip(axes, brfss["items"].items()):
            hs, cs = [], []
            for st, r in rec["states"].items():
                if r.get("cells") is None:
                    continue
                hs.append(r["human"] * 100)
                cs.append(r["cells"] * 100)
            hs_a, cs_a = np.array(hs), np.array(cs)
            mae_cells = float(np.mean(np.abs(cs_a - hs_a)))
            naive_pairs = [(r["naive"] * 100, r["human"] * 100) for r in rec["states"].values() if r.get("naive") is not None]
            mae_naive = float(np.mean([abs(a - b2) for a, b2 in naive_pairs])) if naive_pairs else None
            const_pairs = [(rec["nationalCells"] * 100, r["human"] * 100) for r in rec["states"].values()] if rec.get("nationalCells") else []
            mae_const = float(np.mean([abs(a - b2) for a, b2 in const_pairs])) if const_pairs else None
            rho = float(spearmanr(cs_a, hs_a).statistic)
            b["items"][item_id] = {
                "maeCells": mae_cells / 100, "maeNaive": (mae_naive or 0) / 100 if mae_naive else None,
                "maeNationalConst": (mae_const or 0) / 100 if mae_const else None,
                "spearman": rho, "states": len(hs),
            }
            ax.scatter(hs_a, cs_a, s=10, color=INDIGO, alpha=0.8)
            lims = [min(hs_a.min(), cs_a.min()) - 2, max(hs_a.max(), cs_a.max()) + 2]
            ax.plot(lims, lims, color=GRAY, lw=0.7, ls="--")
            ax.set_title(item_id.replace("brfss_", ""), fontsize=8)
            ax.set_xlabel("BRFSS (pts)", fontsize=8)
        axes[0].set_ylabel("Estimate (pts)", fontsize=8)
        fig.tight_layout()
        savefig(fig, "fig3-states")
        plt.close(fig)
        b["pooled"] = {
            "maeCells": float(np.mean([v["maeCells"] for v in b["items"].values()])),
            "maeNaive": float(np.mean([v["maeNaive"] for v in b["items"].values() if v["maeNaive"] is not None])),
            "maeNationalConst": float(np.mean([v["maeNationalConst"] for v in b["items"].values() if v["maeNationalConst"] is not None])),
            "medianSpearman": float(np.median([v["spearman"] for v in b["items"].values()])),
        }
        s["brfss"] = b

    # ---- Figure 5: contamination regression scatter (from analysis v2)
    a2 = load("anchor-analysis-v2")
    if a2 and a2.get("contamination"):
        fig, ax = plt.subplots(figsize=(5.4, 3.0))
        marks = {"cells": (INDIGO, "o"), "naive": (HONEY, "s")}
        for arm, (color, m) in marks.items():
            block = a2["contamination"].get(arm)
            if not block or not block.get("points"):
                continue
            xs = [p[0] * 100 for p in block["points"]]
            ys = [p[1] * 100 for p in block["points"]]
            ax.scatter(xs, ys, s=14, color=color, marker=m, alpha=0.75,
                       label=f"{arm} (slope {block['slope']:.2f})")
            import numpy as _np
            xr = _np.linspace(min(xs), max(xs), 10)
            ax.plot(xr, block["intercept"] * 100 + block["slope"] * xr, color=color, lw=1.2)
        xr_all = _np.linspace(-8, 8, 10)
        ax.plot(xr_all, -xr_all, color=GRAY, lw=0.8, ls="--", label="pure recall (slope −1)")
        ax.axhline(0, color=GRAY, lw=0.5)
        ax.set_xlabel("Target movement since prior wave (pts)")
        ax.set_ylabel("Signed error on 2024 target (pts)")
        ax.legend(frameon=False, fontsize=8)
        fig.tight_layout()
        savefig(fig, "fig5-contamination")
        plt.close(fig)

    json.dump(s, open(os.path.join(ART, "summary.json"), "w"), indent=1)
    print("wrote summary.json and figures")
    print(json.dumps({k: v for k, v in s.items() if k in ("anchor", "ppi", "rf")}, indent=1)[:1200])


if __name__ == "__main__":
    main()
