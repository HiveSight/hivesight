"""Revision analysis suite (PAP v3 addendum): scores the v4 corrected runs
and computes every referee-driven inference/sensitivity from committed
artifacts. Tolerates partially-complete v2 run artifacts (skips with notes).

Inputs (all committed):
  evals/anchor-bank/anchor-bank-v{1,2}.json, historical-targets.json
  evals/results/anchor-bank-run-v{1,2}.json
  evals/results/logs/*.jsonl (per-call logs; used for granularity subgroups)
  public/data/v1/US.json

Output: paper/artifacts/anchor-analysis-v2.json

Run: uv run --with "numpy,scipy" python analysis/analyze_anchor_v2.py
"""

import glob
import json
import math
import os
import re

import numpy as np
from scipy import stats

ROOT = os.path.join(os.path.dirname(__file__), "..")
A = lambda *p: os.path.join(ROOT, *p)
OUT = A("paper", "artifacts", "anchor-analysis-v2.json")

RNG = np.random.default_rng(20260707)
MINI = "gpt-5-mini"
K_V1 = {"cells": f"cells:openai:{MINI}", "naive": f"naive:openai:{MINI}", "persona": f"persona:openai:{MINI}"}
SUBSET20 = [
    "gss_happy", "gss_health", "gss_satfin", "gss_trust", "gss_cappun",
    "gss_grass", "gss_confed", "gss_consci", "gss_natsoc", "gss_nateduc",
    "gss_polviews", "gss_fefam", "shed_b2", "shed_b3", "shed_400cash",
    "shed_ef1", "shed_ef7", "shed_bk1", "shed_work", "shed_housing_stress",
]
PILOT_OVERLAP = ["shed_b2", "shed_b3", "shed_400cash", "shed_housing_stress"]
VOLUNTEERED6 = ["gss_trust", "gss_fair", "gss_helpful", "gss_getahead", "gss_courts", "gss_divlaw"]
# $/M tokens, July 2026 list prices.
PRICE = {"gpt-5-mini": (0.25, 2.00), "gpt-5.2": (1.25, 10.00), "claude-haiku-4-5-20251001": (1.00, 5.00)}
DEFF = {"gss2024": 1.5, "shed2024": 1.2}


def load(p, default=None):
    try:
        return json.load(open(A(p)))
    except FileNotFoundError:
        return default


def pos_share(dist, positive):
    return float(sum(dist[i] for i in positive))


def item_map(bank):
    return {i["itemId"]: i for i in bank["items"]}


def arm_topline_err(item, arm_res, signed=False):
    if not arm_res or not arm_res.get("topline"):
        return None
    est = pos_share(arm_res["topline"], item["positiveOptions"])
    hum = pos_share(item["targets"]["overall"]["dist"], item["positiveOptions"])
    return (est - hum) if signed else abs(est - hum)


def slice_errs(item, arm_res, families=None):
    out = []
    if not arm_res:
        return out
    for family, bins in (item["targets"].get("slices") or {}).items():
        if families and family not in families:
            continue
        arm_fam = (arm_res.get("slices") or {}).get(family) or {}
        for label, target in bins.items():
            est = arm_fam.get(label)
            if not est:
                continue
            out.append(abs(pos_share(est, item["positiveOptions"]) - pos_share(target["dist"], item["positiveOptions"])))
    return out


def slice_spearman(item, arm_res, families=None):
    if not arm_res:
        return None
    pairs = []
    for family, bins in (item["targets"].get("slices") or {}).items():
        if families and family not in families:
            continue
        arm_fam = (arm_res.get("slices") or {}).get(family) or {}
        for label, target in bins.items():
            est = arm_fam.get(label)
            if not est:
                continue
            pairs.append((pos_share(est, item["positiveOptions"]), pos_share(target["dist"], item["positiveOptions"])))
    if len(pairs) < 4:
        return None
    r = stats.spearmanr([p[0] for p in pairs], [p[1] for p in pairs]).statistic
    return None if np.isnan(r) else float(r)


def tv_dist(item, arm_res):
    if not arm_res or not arm_res.get("topline"):
        return None
    h = np.array(item["targets"]["overall"]["dist"])
    e = np.array(arm_res["topline"])
    return 0.5 * float(np.abs(h - e).sum())


def pooled(vals):
    v = [x for x in vals if x is not None]
    return float(np.mean(v)) if v else None


def boot_ci(diffs, alpha=0.05, n=10000):
    diffs = np.array(diffs)
    idx = RNG.integers(0, len(diffs), (n, len(diffs)))
    means = diffs[idx].mean(axis=1)
    lo, hi = np.percentile(means, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return float(np.mean(diffs)), float(lo), float(hi)


def main():
    bank1, bank2 = load("evals/anchor-bank/anchor-bank-v1.json"), load("evals/anchor-bank/anchor-bank-v2.json")
    hist = load("evals/anchor-bank/historical-targets.json")["items"]
    run1 = load("evals/results/anchor-bank-run-v1.json")
    run2 = load("evals/results/anchor-bank-run-v2.json", {"results": {}})
    us = load("public/data/v1/US.json")
    items1, items2 = item_map(bank1), item_map(bank2)
    out = {"version": "anchor-analysis-v2", "notes": []}

    def r1(iid, arm):
        return run1["results"].get(iid, {}).get(K_V1[arm])

    def r2(iid, arm, tag="default:g149"):
        return run2["results"].get(iid, {}).get(f"{arm}:openai:{MINI}:{tag}")

    # ---------------- 1. v4 corrected run pooled + v1 comparison ----------
    for label, items, getter in [("v1_registered", items1, r1), ("v4_corrected", items2, r2)]:
        block = {}
        for arm in ["cells", "naive"]:
            t = [arm_topline_err(items[i], getter(i, arm)) for i in items]
            s = [pooled(slice_errs(items[i], getter(i, arm))) for i in items]
            tvs = [tv_dist(items[i], getter(i, arm)) for i in items]
            sp_age = [slice_spearman(items[i], getter(i, arm), families={"age_band"}) for i in items]
            sp_all = [slice_spearman(items[i], getter(i, arm)) for i in items]
            block[arm] = {
                "items": sum(1 for x in t if x is not None),
                "toplineMAE": pooled(t), "sliceMAE": pooled(s), "toplineTV": pooled(tvs),
                "medianSpearmanAge": (lambda v: float(np.median(v)) if v else None)([x for x in sp_age if x is not None]),
                "nSpearmanAge": sum(1 for x in sp_age if x is not None),
                "medianSpearmanAll": (lambda v: float(np.median(v)) if v else None)([x for x in sp_all if x is not None]),
            }
        out[label] = block

    # ---------------- 2. paired inference on cells vs naive ---------------
    def paired_block(items, getter):
        res = {}
        for metric, fn in [
            ("topline", lambda it, a: arm_topline_err(it, a)),
            ("subgroup", lambda it, a: pooled(slice_errs(it, a))),
        ]:
            pairs = []
            for iid, it in items.items():
                c, n = fn(it, getter(iid, "cells")), fn(it, getter(iid, "naive"))
                if c is not None and n is not None:
                    pairs.append(c - n)
            if len(pairs) < 10:
                res[metric] = {"n": len(pairs), "note": "insufficient"}
                continue
            mean, lo, hi = boot_ci(pairs)
            _, lo90, hi90 = boot_ci(pairs, alpha=0.10)
            w = stats.wilcoxon(pairs, alternative="less")  # H1 direction: cells < naive
            res[metric] = {
                "n": len(pairs), "meanDiff": mean, "ci95": [lo, hi],
                "tostEquivalent15": bool(lo90 > -0.015 and hi90 < 0.015),
                "wilcoxonOneSidedP": float(w.pvalue),
            }
        # paired Spearman (age family) cells vs naive
        sp = []
        for iid, it in items.items():
            c = slice_spearman(it, getter(iid, "cells"), families={"age_band"})
            n = slice_spearman(it, getter(iid, "naive"), families={"age_band"})
            if c is not None and n is not None:
                sp.append(c - n)
        if len(sp) >= 10:
            mean, lo, hi = boot_ci(sp)
            w = stats.wilcoxon(sp, alternative="greater")
            res["spearmanAgeDiff"] = {"n": len(sp), "meanDiff": mean, "ci95": [lo, hi], "wilcoxonOneSidedP": float(w.pvalue)}
        return res

    out["paired_v1"] = paired_block(items1, r1)
    out["paired_v4"] = paired_block(items2, r2)

    # ---------------- 3. H1 by slice family (v1 registered) ---------------
    fam_block = {}
    for fam in ["age_band", "sex", "income_band", "tenure"]:
        c = [pooled(slice_errs(items1[i], r1(i, "cells"), families={fam})) for i in items1]
        n = [pooled(slice_errs(items1[i], r1(i, "naive"), families={fam})) for i in items1]
        pairs = [(a, b) for a, b in zip(c, n) if a is not None and b is not None]
        if pairs:
            fam_block[fam] = {
                "items": len(pairs),
                "cellsMAE": float(np.mean([p[0] for p in pairs])),
                "naiveMAE": float(np.mean([p[1] for p in pairs])),
            }
    out["h1_by_family"] = fam_block

    # ---------------- 4. valence: permutation + confound ------------------
    signed = {iid: arm_topline_err(items1[iid], r1(iid, "cells"), signed=True) for iid in items1}
    signed = {k: v for k, v in signed.items() if v is not None}
    val = {iid: items1[iid]["valence"] for iid in signed}
    groups = {v: [signed[i] for i in signed if val[i] == v] for v in ["positive", "neutral", "negative"]}
    obs = np.mean(groups["positive"]) - np.mean(groups["negative"])
    labels = [val[i] for i in signed]
    errs = np.array([signed[i] for i in signed])
    perm = []
    for _ in range(10000):
        lab = RNG.permutation(labels)
        p = errs[np.array(lab) == "positive"].mean() - errs[np.array(lab) == "negative"].mean()
        perm.append(p)
    pval = float(np.mean(np.abs(perm) >= abs(obs)))
    # position/extremity confound
    first_pos = np.array([1 if min(items1[i]["positiveOptions"]) == 0 else 0 for i in signed])
    X = np.column_stack([np.ones(len(errs)), first_pos])
    beta, *_ = np.linalg.lstsq(X, errs, rcond=None)
    out["valence"] = {
        "means": {v: {"mean": float(np.mean(g)), "sd": float(np.std(g, ddof=1)), "n": len(g)} for v, g in groups.items()},
        "posMinusNeg": float(obs), "permutationP": pval,
        "signShare": {v: float(np.mean(np.array(g) > 0)) for v, g in groups.items()},
        "firstPositionCoef": float(beta[1]),
        "note": "negative class n=3; two of three are derived/composite items",
    }

    # ---------------- 5. contamination regression -------------------------
    cont = {}
    for arm in ["cells", "naive"]:
        xs, ys, ids = [], [], []
        for iid, it in items1.items():
            if iid not in hist:
                continue
            res = r1(iid, arm)
            se = arm_topline_err(it, res, signed=True)
            if se is None:
                continue
            t24 = pos_share(it["targets"]["overall"]["dist"], it["positiveOptions"])
            delta = t24 - hist[iid]["positiveShare"]
            xs.append(delta); ys.append(se); ids.append(iid)
        lr = stats.linregress(xs, ys)
        cont[arm] = {
            "points": [[float(x), float(y)] for x, y in zip(xs, ys)],
            "n": len(xs), "slope": float(lr.slope), "slopeSE": float(lr.stderr),
            "intercept": float(lr.intercept), "r": float(lr.rvalue), "p": float(lr.pvalue),
            "meanAbsDelta": float(np.mean(np.abs(xs))),
            "interpretation": "memorization of older published values predicts slope near -1; slope near 0 is inconsistent with pure recall",
        }
    out["contamination"] = cont

    # ---------------- 6. replicates ---------------------------------------
    reps = {}
    for tag in ["default:g149", "default:g149:rep1", "default:g149:rep2", "default:g149:rep3"]:
        t = [arm_topline_err(items2[i], r2(i, "cells", tag)) for i in SUBSET20 if i in items2]
        s = [pooled(slice_errs(items2[i], r2(i, "cells", tag))) for i in SUBSET20 if i in items2]
        if any(x is not None for x in t):
            reps[tag] = {"toplineMAE": pooled(t), "sliceMAE": pooled(s)}
    if len(reps) >= 2:
        out["replicates"] = {
            "runs": reps,
            "toplineSD": float(np.std([v["toplineMAE"] for v in reps.values()], ddof=1)),
            "sliceSD": float(np.std([v["sliceMAE"] for v in reps.values() if v["sliceMAE"] is not None], ddof=1)),
        }
    else:
        out["notes"].append("replicates incomplete")

    # ---------------- 7. order-reversal + paraphrase ----------------------
    for name, tag, ids in [
        ("orderReversal", "order-reversed:g149", SUBSET20),
        ("paraphrase", "paraphrase:g149", sorted(SUBSET20)[1::2]),
    ]:
        deltas = []
        for iid in ids:
            a, b = r2(iid, "cells"), r2(iid, "cells", tag)
            if a and b and a.get("topline") and b.get("topline"):
                pa = pos_share(a["topline"], items2[iid]["positiveOptions"])
                pb = pos_share(b["topline"], items2[iid]["positiveOptions"])
                deltas.append(abs(pa - pb))
        if deltas:
            out[name] = {"n": len(deltas), "meanAbsDelta": float(np.mean(deltas)), "maxAbsDelta": float(np.max(deltas))}
        else:
            out["notes"].append(f"{name} incomplete")

    # ---------------- 8. volunteered options ------------------------------
    vol = {"massShift": {}, "excluding6_v1": {}, "noVolunteeredArm": {}}
    for iid in VOLUNTEERED6:
        it = items2[iid]
        res = r2(iid, "cells") or r1(iid, "cells")
        if not res or not res.get("topline"):
            continue
        vmodel = sum(res["topline"][i] for i in it["volunteered"])
        vhuman = sum(it["targets"]["overall"]["dist"][i] for i in it["volunteered"])
        vol["massShift"][iid] = {"model": vmodel, "human": vhuman, "shift": vmodel - vhuman}
    keep = [i for i in items1 if i not in VOLUNTEERED6]
    vol["excluding6_v1"] = {
        arm: {
            "toplineMAE": pooled([arm_topline_err(items1[i], r1(i, arm)) for i in keep]),
            "sliceMAE": pooled([pooled(slice_errs(items1[i], r1(i, arm))) for i in keep]),
        }
        for arm in ["cells", "naive"]
    }
    nv = {}
    for iid in VOLUNTEERED6:
        it = items2[iid]
        res = r2(iid, "cells", "no-volunteered:g149")
        if not res or not res.get("topline"):
            continue
        offered = [i for i in range(len(it["options"])) if i not in it["volunteered"]]
        h = np.array(it["targets"]["overall"]["dist"])[offered]
        h = h / h.sum()
        e = np.array(res["topline"])[offered]
        e = e / e.sum() if e.sum() > 0 else e
        pos = [offered.index(i) for i in it["positiveOptions"] if i in offered]
        nv[iid] = {"absErrRenormalized": float(abs(e[pos].sum() - h[pos].sum()))}
    vol["noVolunteeredArm"] = nv
    out["volunteered"] = vol

    # ---------------- 9. granularity curve --------------------------------
    def coarsen_key(cell, g):
        if g == 1:
            return ()
        if g == 8:
            return (cell["age"], cell["sex"])
        if g == 40:
            return (cell["age"], cell["income"], cell["sex"])
        return None

    # reconstruct coarse cell lists in runner order (Map insertion over US cells)
    def coarse_cells(g):
        seen, order = {}, []
        for c in us["table"]["cells"]:
            k = coarsen_key(c, g)
            if k not in seen:
                seen[k] = {"weight": 0.0, "age": None, "sex": None, "income": None}
                if g >= 8:
                    seen[k]["age"], seen[k]["sex"] = c["age"], c["sex"]
                if g >= 40:
                    seen[k]["income"] = c["income"]
                order.append(k)
            seen[k]["weight"] += c["weight"]
        return [seen[k] for k in order]

    # per-call logs for granularity runs -> subgroup aggregates
    logs = {}
    for g in [1, 8, 40]:
        pat = A("evals", "results", "logs", f"v2-openai-{MINI}-cells-all-default:g{g}.jsonl")
        if os.path.exists(pat):
            recs = [json.loads(l) for l in open(pat)]
            byitem = {}
            for r in recs:
                if r.get("arm") != "cells":
                    continue
                byitem.setdefault(r["itemId"], {})[r["cellIdx"]] = r
            logs[g] = byitem

    gran = {}
    for g in [1, 8, 40, 149]:
        t_errs, sp_ages = [], []
        for iid, it in items2.items():
            if g == 149:
                res = r2(iid, "cells")
                t_errs.append(arm_topline_err(it, res))
                sp_ages.append(slice_spearman(it, res, families={"age_band"}))
                continue
            res = r2(iid, "cells", f"default:g{g}")
            t_errs.append(arm_topline_err(it, res))
            # age-band estimates from logs (g>=8)
            if g >= 8 and g in logs and iid in logs[g]:
                cellsg = coarse_cells(g)
                # parse dist from logged content (canonical order = presented order here)
                by_age = {}
                for idx, rec in logs[g][iid].items():
                    m = re.search(r"\{[\s\S]*\}", rec["content"] or "")
                    if not m:
                        continue
                    try:
                        raw = json.loads(m.group(0))
                    except Exception:
                        continue
                    vals = [raw.get(f"option_{p}") for p in range(len(it["options"]))]
                    if any(not isinstance(v, (int, float)) or v < 0 for v in vals):
                        continue
                    tot = sum(vals)
                    if tot <= 0:
                        continue
                    dist = [v / tot for v in vals]
                    cell = cellsg[int(idx)]
                    a = cell["age"]
                    cur = by_age.setdefault(a, [0.0, np.zeros(len(dist))])
                    cur[0] += cell["weight"]
                    cur[1] = cur[1] + cell["weight"] * np.array(dist)
                bins = (it["targets"].get("slices") or {}).get("age_band") or {}
                pairs = []
                for a, (w, acc) in by_age.items():
                    if a in bins and w > 0:
                        est = pos_share(list(acc / w), it["positiveOptions"])
                        hum = pos_share(bins[a]["dist"], it["positiveOptions"])
                        pairs.append((est, hum))
                if len(pairs) >= 4:
                    r = stats.spearmanr([p[0] for p in pairs], [p[1] for p in pairs]).statistic
                    if not np.isnan(r):
                        sp_ages.append(float(r))
        gran[str(g)] = {
            "toplineMAE": pooled(t_errs),
            "medianSpearmanAge": (lambda v: float(np.median(v)) if v else None)([x for x in sp_ages if x is not None]),
            "nItems": sum(1 for x in t_errs if x is not None),
        }
    out["granularity"] = gran

    # ---------------- 10. pilot overlap sensitivity (v1) -------------------
    keep = [i for i in items1 if i not in PILOT_OVERLAP]
    out["pilotOverlap"] = {
        arm: {
            "toplineMAE": pooled([arm_topline_err(items1[i], r1(i, arm)) for i in keep]),
            "sliceMAE": pooled([pooled(slice_errs(items1[i], r1(i, arm))) for i in keep]),
            "items": len(keep),
        }
        for arm in ["cells", "naive", "persona"]
        if any(r1(i, arm) for i in keep)
    }

    # ---------------- 11. cost table ---------------------------------------
    def cost_block(model, calls_per_item, tok_in_per_call, tok_out_per_call):
        pin, pout = PRICE[model]
        usd = (calls_per_item * tok_in_per_call * pin + calls_per_item * tok_out_per_call * pout) / 1e6
        return {"callsPerItem": calls_per_item, "usdPerItem": round(usd, 4)}

    u1 = run1.get("usage", {})
    main_u = u1.get(f"openai:{MINI}:cells+naive:all", {})
    per_call_in = main_u.get("tokIn", 0) / max(main_u.get("calls", 1), 1)
    per_call_out = main_u.get("tokOut", 0) / max(main_u.get("calls", 1), 1)
    naive_calls = round(np.mean([1 + len([1 for fam in (items1[i]["targets"].get("slices") or {}).values() for _ in fam]) for i in items1]), 1)
    out["cost"] = {
        "prices": {k: {"inPerM": v[0], "outPerM": v[1]} for k, v in PRICE.items()},
        "assumedTokensPerCall": {"in": round(per_call_in, 1), "out": round(per_call_out, 1)},
        "cells": cost_block(MINI, 149, per_call_in, per_call_out),
        "naive": cost_block(MINI, naive_calls, per_call_in, per_call_out),
        "persona": cost_block(MINI, 150, 151, 43),
        "note": "token averages from the registered v1 run's usage block; July 2026 list prices",
    }

    # ---------------- 12. noise floors -------------------------------------
    # persona sampling floor: E|phat-p| = sqrt(2/pi)*sqrt(p(1-p)/n)
    floors = []
    for iid in SUBSET20:
        it = items1.get(iid)
        if not it:
            continue
        p = pos_share(it["targets"]["overall"]["dist"], it["positiveOptions"])
        floors.append(math.sqrt(2 / math.pi) * math.sqrt(p * (1 - p) / 150))
    out["personaNoiseFloor"] = {"meanExpectedMAE": pooled(floors), "n": 150}
    persona_gss = pooled([arm_topline_err(items1[i], r1(i, "persona")) for i in SUBSET20 if i.startswith("gss")])
    persona_shed = pooled([arm_topline_err(items1[i], r1(i, "persona")) for i in SUBSET20 if i.startswith("shed")])
    out["personaBySource"] = {"gssToplineMAE": persona_gss, "shedToplineMAE": persona_shed}

    # target noise: weighted SE with deff, topline + subgroup floor
    t_floor, s_floor, s_floor_100 = [], [], []
    for iid, it in items1.items():
        p = pos_share(it["targets"]["overall"]["dist"], it["positiveOptions"])
        n = it["targets"]["overall"]["n"]
        deff = DEFF[it["source"]]
        se = math.sqrt(deff * p * (1 - p) / n)
        t_floor.append(math.sqrt(2 / math.pi) * se)
        for fam in (it["targets"].get("slices") or {}).values():
            for b in fam.values():
                pb = pos_share(b["dist"], it["positiveOptions"])
                seb = math.sqrt(deff * pb * (1 - pb) / b["n"])
                s_floor.append(math.sqrt(2 / math.pi) * seb)
                if b["n"] >= 100:
                    s_floor_100.append(math.sqrt(2 / math.pi) * seb)
    out["targetNoise"] = {
        "deff": DEFF,
        "toplineExpectedMAEFloor": pooled(t_floor),
        "subgroupExpectedMAEFloor": pooled(s_floor),
        "subgroupExpectedMAEFloor_nMin100": pooled(s_floor_100),
    }
    # subgroup MAE sensitivity: bins n>=100 only (v1, cells & naive)
    def slice_errs_minn(item, arm_res, min_n):
        outv = []
        for family, bins in (item["targets"].get("slices") or {}).items():
            arm_fam = (arm_res.get("slices") or {}).get(family) or {}
            for label, target in bins.items():
                if target["n"] < min_n:
                    continue
                est = arm_fam.get(label)
                if est:
                    outv.append(abs(pos_share(est, item["positiveOptions"]) - pos_share(target["dist"], item["positiveOptions"])))
        return outv
    out["subgroupMAE_nMin100"] = {
        arm: pooled([pooled(slice_errs_minn(items1[i], r1(i, arm), 100)) for i in items1])
        for arm in ["cells", "naive"]
    }

    # ---------------- 13. frame coverage + DK ------------------------------
    total_w = us["table"]["totalWeight"]
    detailed_w = sum(c["weight"] for c in us["table"]["cells"] if c["detailed"])
    out["frameCoverage"] = {
        "detailedWeightShare": detailed_w / total_w,
        "undetailedCells": sum(1 for c in us["table"]["cells"] if not c["detailed"]),
        "cells": len(us["table"]["cells"]),
    }
    out["dkRates"] = {
        "mean": pooled([items2[i].get("dkRate") for i in items2]),
        "max": max((items2[i].get("dkRate") or 0) for i in items2),
        "top5": sorted(((items2[i].get("dkRate") or 0, i) for i in items2), reverse=True)[:5],
        "note": "GSS rates exclude ballot nonassignment but conflate web-skip with DK",
    }

    # ---------------- 14. BRFSS bootstrap ----------------------------------
    brun = load("evals/results/brfss-states-run-v1.json")
    if brun:
        bb = {}
        for iid, rec in brun["items"].items():
            rows = [(r["cells"], r["naive"], rec.get("nationalCells"), r["human"])
                    for r in rec["states"].values() if r.get("cells") is not None]
            arr = np.array(rows, dtype=float)
            diffs_const = np.abs(arr[:, 0] - arr[:, 3]) - np.abs(arr[:, 2] - arr[:, 3])
            mean, lo, hi = boot_ci(list(diffs_const))
            bb[iid] = {"cellsMinusConstMAE": mean, "ci95": [lo, hi], "states": len(rows)}
        alld = []
        for iid, rec in brun["items"].items():
            for r in rec["states"].values():
                if r.get("cells") is not None:
                    alld.append(abs(r["cells"] - r["human"]) - abs(rec["nationalCells"] - r["human"]))
        mean, lo, hi = boot_ci(alld)
        bb["pooled_cellsMinusConst"] = {"mean": mean, "ci95": [lo, hi], "n": len(alld)}
        out["brfssInference"] = bb

    json.dump(out, open(OUT, "w"), indent=1)
    print(json.dumps({k: out[k] for k in ["v1_registered", "v4_corrected", "paired_v1", "contamination", "granularity"] if k in out}, indent=1)[:3000])
    print("notes:", out["notes"])
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
