"""Score the anchor-bank runs per PAP v2 and emit the paper's main artifact.

Inputs: evals/anchor-bank/anchor-bank-v1.json (human targets),
        evals/results/anchor-bank-run-v1.json (arm estimates).
Output: paper/artifacts/anchor-analysis.json

Run: uv run --with "numpy,scipy" python analysis/analyze_anchor.py
"""

import json
import os

import numpy as np
from scipy.stats import spearmanr, wilcoxon

ROOT = os.path.join(os.path.dirname(__file__), "..")
BANK = os.path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v1.json")
RUN = os.path.join(ROOT, "evals", "results", "anchor-bank-run-v1.json")
OUT = os.path.join(ROOT, "paper", "artifacts", "anchor-analysis.json")

SUBSET20 = [
    "gss_happy", "gss_health", "gss_satfin", "gss_trust", "gss_cappun",
    "gss_grass", "gss_confed", "gss_consci", "gss_natsoc", "gss_nateduc",
    "gss_polviews", "gss_fefam", "shed_b2", "shed_b3", "shed_400cash",
    "shed_ef1", "shed_ef7", "shed_bk1", "shed_work", "shed_housing_stress",
]


def pos_share(dist, positive):
    return float(sum(dist[i] for i in positive))


def tv(a, b):
    return 0.5 * float(np.abs(np.array(a) - np.array(b)).sum())


def score_arm(item, arm):
    """Per-item scores for one arm result."""
    pos = item["positiveOptions"]
    human_t = item["targets"]["overall"]["dist"]
    out = {}
    if arm.get("topline"):
        est = pos_share(arm["topline"], pos)
        hum = pos_share(human_t, pos)
        out["topline"] = {
            "estimate": est,
            "human": hum,
            "absError": abs(est - hum),
            "signedError": est - hum,
            "tv": tv(arm["topline"], human_t),
        }
    slice_errs, pairs = [], []
    slice_detail = {}
    for family, bins in (item["targets"].get("slices") or {}).items():
        arm_fam = (arm.get("slices") or {}).get(family) or {}
        fam_detail = {}
        for label, target in bins.items():
            est_dist = arm_fam.get(label)
            if not est_dist:
                continue
            est = pos_share(est_dist, pos)
            hum = pos_share(target["dist"], pos)
            fam_detail[label] = {"estimate": est, "human": hum, "absError": abs(est - hum)}
            slice_errs.append(abs(est - hum))
            pairs.append((est, hum))
        if fam_detail:
            slice_detail[family] = fam_detail
    out["sliceMAE"] = float(np.mean(slice_errs)) if slice_errs else None
    out["sliceN"] = len(slice_errs)
    out["slices"] = slice_detail
    if len(pairs) >= 4:
        r, _ = spearmanr([p[0] for p in pairs], [p[1] for p in pairs])
        out["sliceSpearman"] = float(r)
    return out


def pool(scores, key, items_filter=None):
    vals = [
        s[key]["absError"] if key == "topline" else s[key]
        for iid, s in scores.items()
        if s.get(key) is not None and (items_filter is None or iid in items_filter)
    ]
    return float(np.mean(vals)) if vals else None


def main():
    bank = json.load(open(BANK))
    run = json.load(open(RUN))
    items = {i["itemId"]: i for i in bank["items"]}

    arm_keys = sorted({k for r in run["results"].values() for k in r})
    print("arm keys:", arm_keys)

    analysis = {"version": "anchor-analysis-v1", "armKeys": arm_keys, "perItem": {}, "pooled": {}, "hypotheses": {}}

    scored = {k: {} for k in arm_keys}
    for item_id, arms in run["results"].items():
        item = items[item_id]
        analysis["perItem"][item_id] = {
            "source": item["source"], "valence": item["valence"], "domain": item["domain"],
            "wording": item["wording"][:90],
            "human": pos_share(item["targets"]["overall"]["dist"], item["positiveOptions"]),
            "arms": {},
        }
        for key, arm in arms.items():
            s = score_arm(item, arm)
            scored[key][item_id] = s
            analysis["perItem"][item_id]["arms"][key] = {
                "topline": s.get("topline"), "sliceMAE": s.get("sliceMAE"),
                "sliceSpearman": s.get("sliceSpearman"), "sliceN": s.get("sliceN"),
            }

    for key in arm_keys:
        sc = scored[key]
        analysis["pooled"][key] = {
            "items": len(sc),
            "toplineMAE": pool(sc, "topline"),
            "sliceMAE": pool(sc, "sliceMAE"),
            "toplineMAE_subset20": pool(sc, "topline", SUBSET20),
            "sliceMAE_subset20": pool(sc, "sliceMAE", SUBSET20),
            "medianSliceSpearman": float(np.median([s["sliceSpearman"] for s in sc.values() if s.get("sliceSpearman") is not None])) if any(s.get("sliceSpearman") is not None for s in sc.values()) else None,
        }

    mini = "openai:gpt-5-mini"
    cells_k, naive_k, persona_k = f"cells:{mini}", f"naive:{mini}", f"persona:{mini}"

    # H1: cells subgroup MAE < naive subgroup MAE (paired Wilcoxon over items).
    common = [i for i in scored.get(cells_k, {}) if i in scored.get(naive_k, {})
              and scored[cells_k][i].get("sliceMAE") is not None and scored[naive_k][i].get("sliceMAE") is not None]
    if common:
        c = [scored[cells_k][i]["sliceMAE"] for i in common]
        n = [scored[naive_k][i]["sliceMAE"] for i in common]
        stat = wilcoxon(c, n) if len(common) >= 10 else None
        analysis["hypotheses"]["H1_cells_vs_naive_subgroups"] = {
            "items": len(common), "cellsSliceMAE": float(np.mean(c)), "naiveSliceMAE": float(np.mean(n)),
            "wilcoxonP": float(stat.pvalue) if stat else None,
            "supported": bool(np.mean(c) < np.mean(n)),
        }

    # H2/H3: vs persona on subset20.
    pcommon = [i for i in scored.get(persona_k, {}) if i in scored.get(cells_k, {})]
    if pcommon:
        analysis["hypotheses"]["H2_cells_vs_persona_subgroups"] = {
            "items": len(pcommon),
            "cellsSliceMAE": pool(scored[cells_k], "sliceMAE", pcommon),
            "personaSliceMAE": pool(scored[persona_k], "sliceMAE", pcommon),
        }
        analysis["hypotheses"]["H3_persona_topline"] = {
            "personaToplineMAE": pool(scored[persona_k], "topline", pcommon),
            "cellsToplineMAE": pool(scored[cells_k], "topline", pcommon),
        }

    # H4: signed error by valence (cells arm).
    by_val = {}
    for iid, s in scored.get(cells_k, {}).items():
        if s.get("topline"):
            by_val.setdefault(items[iid]["valence"], []).append(s["topline"]["signedError"])
    analysis["hypotheses"]["H4_valence_signed_error"] = {
        v: {"mean": float(np.mean(errs)), "n": len(errs)} for v, errs in by_val.items()
    }

    # H5: rank correlation.
    spear = [s["sliceSpearman"] for s in scored.get(cells_k, {}).values()
             if s.get("sliceSpearman") is not None and s.get("sliceN", 0) >= 4]
    analysis["hypotheses"]["H5_rank_correlation"] = {
        "median": float(np.median(spear)) if spear else None, "items": len(spear),
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(analysis, open(OUT, "w"), indent=1)
    print(json.dumps(analysis["pooled"], indent=1))
    print(json.dumps(analysis["hypotheses"], indent=1)[:1500])
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
