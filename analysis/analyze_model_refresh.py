"""Model-refresh analysis (paper/pap-model-refresh-2026-10.md, amendments 1-2).

Scores the October 2026 refresh runs on anchor bank v2 with the PAP v2
registered pooling (subgroup MAE pooled across all reported slice bins) and
the item-mean pooling the July publication used, answers the addendum's
exploratory questions with item-resampling bootstrap CIs, applies the
registered product decision rule, and re-pools the July registered runs.

Inputs (all committed):
  evals/anchor-bank/anchor-bank-v{1,2}.json
  evals/results/model-refresh-run.json   (refresh runs)
  evals/results/anchor-bank-run-v2.json  (gpt-5-mini R-corrected reference)
  evals/results/anchor-bank-run-v1.json  (July registered runs)

Output: paper/artifacts/model-refresh.json

Run: uv run --with "numpy==2.3.4" python analysis/analyze_model_refresh.py
"""

import glob
import json
import os
import re

import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..")
A = lambda *p: os.path.join(ROOT, *p)
OUT = A("paper", "artifacts", "model-refresh.json")

SEED = 20261021
N_BOOT = 10000
TAG = "default:g149"
SUBSET20 = [
    "gss_happy", "gss_health", "gss_satfin", "gss_trust", "gss_cappun",
    "gss_grass", "gss_confed", "gss_consci", "gss_natsoc", "gss_nateduc",
    "gss_polviews", "gss_fefam", "shed_b2", "shed_b3", "shed_400cash",
    "shed_ef1", "shed_ef7", "shed_bk1", "shed_work", "shed_housing_stress",
]
REFERENCE = "gpt-5-mini"
# Provider per model; artifact keys are arm:provider:model:tag.
PROVIDER = {
    "gpt-5-mini": "openai", "gpt-6-luna": "openai", "gpt-6.1-sol": "openai",
    "gpt-6-astra": "openai", "claude-haiku-5-5": "anthropic",
    "claude-sonnet-5-5": "anthropic", "claude-opus-5-5": "anthropic",
}
CURRENT = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]
FULL_BANK = ["gpt-6-luna", "gpt-6.1-sol", "claude-haiku-5-5"]
# Registered product rule: default candidates in order, non-inferiority margin.
DEFAULT_CANDIDATES = ["gpt-6-luna", "gpt-6.1-sol"]
NONINFERIORITY = 0.01  # 1.0 point
SERVED = ["gpt-6-luna", "gpt-6.1-sol"]


REFRESH_START = "2026-10-21"  # per-call log timestamps on/after this belong to the refresh


def prices():
    """USD per million tokens [input, output] per model, read from evals/models.mjs
    so the analysis prices runs exactly as the runner's spend cap did."""
    src = open(A("evals", "models.mjs")).read()
    pattern = r'^\s*"([\w.-]+)":.*price:\s*\[([\d.]+),\s*([\d.]+)\]'
    return {m: (float(a), float(b)) for m, a, b in re.findall(pattern, src, re.M)}


def log_costs(model):
    """Calls, tokens and USD for a model's refresh runs, rebuilt from the
    committed per-call logs (process counters miss runs cut off mid-way;
    calls repeated after an interruption are real spend and are counted)."""
    p_in, p_out = prices()[model]
    calls = failed = tok_in = tok_out = 0
    for path in sorted(glob.glob(A("evals", "results", "logs", f"v2-{PROVIDER[model]}-{model}-*.jsonl"))):
        for line in open(path):
            row = json.loads(line)
            if row.get("at", "") < REFRESH_START:
                continue
            if row.get("content") is None and row.get("error"):
                failed += 1
                continue
            calls += 1
            tok_in += row["usage"]["in"]
            tok_out += row["usage"]["out"]
    return {
        "calls": calls, "failedCalls": failed, "tokensIn": tok_in, "tokensOut": tok_out,
        "usd": round((tok_in * p_in + tok_out * p_out) / 1e6, 2),
    }


def load(*p):
    with open(A(*p)) as f:
        return json.load(f)


def pos_share(dist, positive):
    return float(sum(dist[i] for i in positive))


def topline_err(item, res):
    if not res or not res.get("topline"):
        return None
    return abs(pos_share(res["topline"], item["positiveOptions"]) - pos_share(item["targets"]["overall"]["dist"], item["positiveOptions"]))


def bin_errs(item, res):
    """{(family, label): abs error} for every reported bin the arm estimated."""
    out = {}
    if not res:
        return out
    for family, bins in (item["targets"].get("slices") or {}).items():
        est_fam = (res.get("slices") or {}).get(family) or {}
        for label, target in bins.items():
            est = est_fam.get(label)
            if est:
                out[(family, label)] = abs(pos_share(est, item["positiveOptions"]) - pos_share(target["dist"], item["positiveOptions"]))
    return out


def tv(item, res):
    if not res or not res.get("topline"):
        return None
    return 0.5 * float(np.abs(np.array(item["targets"]["overall"]["dist"]) - np.array(res["topline"])).sum())


def mean(xs):
    xs = [x for x in xs if x is not None]
    return float(np.mean(xs)) if xs else None


def arm_failures(res):
    """(failed, attempted) elicitations for one item's arm result. Cells and
    persona arms record failures; the direct arm records a null estimate."""
    if "failures" in res:
        return res["failures"] or 0, res.get("cellCount") or res.get("n") or 0
    estimates = [res.get("topline")] + [e for fam in (res.get("slices") or {}).values() for e in fam.values()]
    return sum(e is None for e in estimates), len(estimates)


def score(items, getter, item_ids):
    """Pooled metrics for one arm over item_ids. Items with no usable topline
    are listed in missingItems; items over 10% failed elicitations in
    flaggedItems."""
    tops, tvs, bins_all, item_means, covered, failures, cells = [], [], [], [], [], 0, 0
    missing, flagged = [], []
    for iid in item_ids:
        res = getter(iid)
        if not res:
            continue
        failed, attempted = arm_failures(res)
        if attempted and failed / attempted > 0.10:
            flagged.append(iid)
        if not res.get("topline"):
            missing.append(iid)
            continue
        covered.append(iid)
        tops.append(topline_err(items[iid], res))
        tvs.append(tv(items[iid], res))
        b = list(bin_errs(items[iid], res).values())
        bins_all.extend(b)
        if b:
            item_means.append(float(np.mean(b)))
        failures += failed
        cells += attempted
    return {
        "items": len(covered),
        "toplineMAE": mean(tops),
        "subgroupMAE": mean(bins_all),  # registered: pooled across bins
        "subgroupMAE_itemMean": mean(item_means),  # July publication pooling
        "bins": len(bins_all),
        "toplineTV": mean(tvs),
        "failureRate": (failures / cells) if cells else None,
        "missingItems": missing,
        "flaggedItems": flagged,
    }


def paired(items, get_a, get_b, item_ids, rng):
    """Bootstrap (items resampled) CI on A minus B: topline MAE and bin-pooled
    subgroup MAE over bins both arms estimated."""
    rows = []
    for iid in item_ids:
        ra, rb = get_a(iid), get_b(iid)
        ta, tb = topline_err(items[iid], ra), topline_err(items[iid], rb)
        if ta is None or tb is None:
            continue
        ba, bb = bin_errs(items[iid], ra), bin_errs(items[iid], rb)
        common = sorted(set(ba) & set(bb))
        rows.append((ta - tb, [ba[k] - bb[k] for k in common]))
    if not rows:
        return None
    n = len(rows)
    top = np.array([r[0] for r in rows])
    bin_sums = np.array([sum(r[1]) for r in rows])
    bin_counts = np.array([len(r[1]) for r in rows])
    idx = rng.integers(0, n, (N_BOOT, n))
    boot_top = top[idx].mean(axis=1)
    counts = bin_counts[idx].sum(axis=1)
    boot_sub = np.where(counts > 0, bin_sums[idx].sum(axis=1) / np.maximum(counts, 1), np.nan)

    def ci(point, boot):
        lo, hi = np.nanpercentile(boot, [2.5, 97.5])
        return {"diff": float(point), "lo": float(lo), "hi": float(hi)}

    return {
        "items": n,
        "bins": int(bin_counts.sum()),
        "topline": ci(top.mean(), boot_top),
        "subgroup": ci(bin_sums.sum() / bin_counts.sum(), boot_sub) if bin_counts.sum() else None,
    }


def main():
    rng = np.random.default_rng(SEED)
    bank2 = {i["itemId"]: i for i in load("evals", "anchor-bank", "anchor-bank-v2.json")["items"]}
    bank1 = {i["itemId"]: i for i in load("evals", "anchor-bank", "anchor-bank-v1.json")["items"]}
    refresh = load("evals", "results", "model-refresh-run.json")
    v2 = load("evals", "results", "anchor-bank-run-v2.json")
    v1 = load("evals", "results", "anchor-bank-run-v1.json")
    all2 = sorted(bank2)

    def r(model, arm):
        key = f"{arm}:{PROVIDER[model]}:{model}:{TAG}"
        src = v2 if (model == REFERENCE and arm in ("cells", "naive")) else refresh
        return lambda iid: (src["results"].get(iid) or {}).get(key)

    out = {
        "generatedFrom": "analysis/analyze_model_refresh.py",
        "registration": "paper/pap-model-refresh-2026-10.md (tags pap-model-refresh-2026-10, -amend1, -amend2; see its post-run notes)",
        "runNotes": [
            "gpt-6.1-sol full-bank cells/direct was interrupted at 2026-10-22T00:28:07Z and resumed at 10:47:26Z with unchanged code; 97 calls were repeated.",
            "Every refresh comparison is exploratory; the persona-prob arm (amendment 2) was added after the other results were read.",
        ],
        "instrument": "anchor bank v2, prompts v4, 149 national cells",
        "pooling": "subgroupMAE pools absolute errors across all reported slice bins (PAP v2); subgroupMAE_itemMean averages within item first (July publication)",
        "models": {},
    }

    # ---- per model x arm, on the full bank and on the 20-item subset
    for model in [REFERENCE] + CURRENT:
        m = {}
        for arm in ("cells", "naive", "persona", "persona-july", "persona-prob"):
            full = score(bank2, r(model, arm), all2)
            if full["items"] == 0:
                continue
            m[arm] = {"all": full if full["items"] > len(SUBSET20) else None,
                      "subset20": score(bank2, r(model, arm), SUBSET20)}
        m["cost"] = log_costs(model)
        out["models"][model] = m

    # ---- Q1 personas vs gpt-5-mini; Q2 cells vs persona within model; Q3 cells vs gpt-5-mini
    q1, q2, q3 = {}, {}, {}
    for model in CURRENT:
        q1[model] = paired(bank2, r(model, "persona"), r(REFERENCE, "persona"), SUBSET20, rng)
    for model in [REFERENCE] + CURRENT:
        q2[model] = paired(bank2, r(model, "cells"), r(model, "persona"), SUBSET20, rng)
    for model in CURRENT:
        items = all2 if model in FULL_BANK else SUBSET20
        q3[model] = paired(bank2, r(model, "cells"), r(REFERENCE, "cells"), items, rng)
    out["Q1_personaVsReference"] = q1
    out["Q2_cellsVsPersona"] = q2
    out["Q3_cellsVsReference"] = q3
    out["personaDesignEffect"] = paired(bank2, r(REFERENCE, "persona-july"), r(REFERENCE, "persona"), SUBSET20, rng)

    # ---- Q4 (amendment 2, exploratory): individual probability vs answer, vs cells
    out["Q4_personaProb"] = {
        model: {
            "vsPersona": paired(bank2, r(model, "persona-prob"), r(model, "persona"), SUBSET20, rng),
            "vsCells": paired(bank2, r(model, "persona-prob"), r(model, "cells"), SUBSET20, rng),
        }
        for model in [REFERENCE] + CURRENT
    }

    # ---- registered product decision rule
    ref_sub = out["models"][REFERENCE]["cells"]["all"]["subgroupMAE"]
    decision = {"referenceCellsSubgroupMAE": ref_sub, "margin": NONINFERIORITY, "candidates": {}}
    chosen = None
    for model in DEFAULT_CANDIDATES:
        cells = (out["models"].get(model, {}).get("cells") or {}).get("all")
        sub = cells["subgroupMAE"] if cells and cells["items"] == len(all2) else None
        passes = sub is not None and sub <= ref_sub + NONINFERIORITY
        decision["candidates"][model] = {"cellsSubgroupMAE": sub, "passes": passes}
        if passes and chosen is None:
            chosen = model
    decision["default"] = chosen or REFERENCE
    out["productDecision"] = decision

    # ---- accuracy the product displays per served model (full bank, cells)
    out["servedBenchmark"] = {
        model: {
            "topline": out["models"][model]["cells"]["all"]["toplineMAE"],
            "subgroup": out["models"][model]["cells"]["all"]["subgroupMAE"],
            "items": out["models"][model]["cells"]["all"]["items"],
        }
        for model in SERVED
        if (out["models"].get(model, {}).get("cells") or {}).get("all")
    }

    # ---- July registered runs (bank v1) under both poolings
    july = {}
    for key in ("cells:openai:gpt-5-mini", "naive:openai:gpt-5-mini", "persona:openai:gpt-5-mini",
                "cells:openai:gpt-5.2", "cells:anthropic:claude-haiku-4-5-20251001"):
        s = score(bank1, lambda iid, k=key: (v1["results"].get(iid) or {}).get(k), sorted(bank1))
        if s["items"]:
            july[key] = s
    out["julyRegisteredRepooled"] = july

    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"wrote {os.path.relpath(OUT, ROOT)}")
    print(json.dumps({"productDecision": decision, "servedBenchmark": out["servedBenchmark"]}, indent=1))


if __name__ == "__main__":
    main()
