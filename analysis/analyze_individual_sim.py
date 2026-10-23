"""Individual-simulation analysis (paper/pap-individual-sim-2026-10.md).

Extends analysis/analyze_model_refresh.py: the same scoring (absolute error
of the designated positive-option share), the same PAP v2 bin-pooled
subgroup MAE and the same paired item-resampling bootstrap, applied to the
study's individual-probability arms. Answers the registered questions,
computes the descriptive checks, and applies the registered product rules.

Inputs (all committed):
  evals/anchor-bank/anchor-bank-v2.json
  evals/results/model-refresh-run.json            (cells, direct, persona, persona-prob)
  evals/results/individual-sim-<model>-<pool|fresh>.json
  public/data/v1/US.json                          (the released pool and population cells)
  evals/anchor-bank/fresh-pools-US.json.gz        (the per-item fresh pools)
  evals/results/persona-prob-subset20-people.json (amendment 2's people, for D1)
  evals/results/logs/v2-openai-<model>-persona-prob-<pool|fresh>-all-default:g149.jsonl[.gz]

Output: paper/artifacts/individual-sim.json

Run: uv run --with "numpy==2.3.4" python analysis/analyze_individual_sim.py
"""

import glob
import gzip
import json
import os
import sys
import zlib

import numpy as np

from analyze_model_refresh import (
    A,
    PROVIDER,
    ROOT,
    SUBSET20,
    TAG,
    arm_failures,
    item_errors,
    load,
    mean,
    pos_share,
    prices,
    score,
)

sys.path.insert(0, A("pipeline"))
from build_cell_release import age_band, earned_income_band  # noqa: E402

OUT = A("paper", "artifacts", "individual-sim.json")
MOCK_OUT = A("individual-sim.MOCK.json")  # git-ignored
SEED = 20261023
N_BOOT = 10000
MODELS = ["gpt-6-luna", "gpt-6.1-sol"]
DEFAULT_MODEL = "gpt-6-luna"
POOL, FRESH = "persona-prob-pool", "persona-prob-fresh"
RUNS = [("gpt-6-luna", POOL), ("gpt-6-luna", FRESH), ("gpt-6.1-sol", POOL)]
CENSUS = 1200
K_GRID = [150, 300, 600]
B_SUB = 200
MIN_BIN = 10
FLAG_RATE = 0.10
# Registered product rules (addendum, "Product rules").
K_TOLERANCE = 0.005  # K*: adds no more than 0.5 points to the census's error
GATE_MARGIN = 0.02  # a model offers the mode only if no more than 2.0 points behind its cells
DEFAULT_TOPLINE_MARGIN = 0.01  # default eligibility: topline CI upper bound below +1.0 point
OFFICIAL_API = "https://api.openai.com/v1"
# MOCK_DATA: end-to-end tests against a local stand-in API set this; the output
# is then stamped as mock and written to MOCK_OUT, never to OUT.
MOCK = os.environ.get("HIVESIGHT_MOCK_RUN") == "1"


def slice_label(family, p):
    """The runner's PERSONA_SLICE (evals/run-anchor-bank-v2.mjs)."""
    if family == "age_band":
        a = p["age"]
        return "18-29" if a < 30 else "30-44" if a < 45 else "45-64" if a < 65 else "65+"
    if family == "sex":
        return "women" if p["is_female"] else "men"
    if family == "income_band":
        e = p["employment_income"] + p["self_employment_income"]
        return "<$25k" if e < 25000 else "$25k-$74,999" if e < 75000 else "$75k-$149,999" if e < 150000 else "$150k+"
    if family == "tenure":
        return "homeowners" if p["tenure_type"] == 1 else "renters or other housing"
    return None


def cell40(p):
    """A record's age x earned-income x sex cell, as the population cell table bands it."""
    return (age_band(p["age"]), earned_income_band(p["employment_income"] + p["self_employment_income"]),
            "women" if p["is_female"] else "men")


def bw(v):
    """A bin entry as (error, weight); plain errors weigh 1."""
    return v if isinstance(v, tuple) else (v, 1.0)


class People:
    """One item's individual replies: positive share per person (NaN when the
    reply did not parse), each person's slice bins and cell."""

    def __init__(self, item, people, records):
        self.item = item
        self.pos = np.array([np.nan if d is None else pos_share(d, item["positiveOptions"]) for _, d in people])
        self.ok = ~np.isnan(self.pos)
        self.target_top = pos_share(item["targets"]["overall"]["dist"], item["positiveOptions"])
        self.cells = [cell40(records[i]) for i, _ in people]
        self.bins = {}  # (family, label) -> (member mask, target positive share)
        for family, bins in (item["targets"].get("slices") or {}).items():
            labels = np.array([slice_label(family, records[i]) for i, _ in people], dtype=object)
            for label, target in bins.items():
                self.bins[(family, label)] = (labels == label, pos_share(target["dist"], item["positiveOptions"]))

    def errors(self, chosen, weights=None):
        """Errors of the estimate from the people in boolean mask `chosen`
        (weighted means when `weights` is given): (topline error,
        {bin: error}) over people who answered, bins with fewer than MIN_BIN
        answering people unreported."""
        use = chosen & self.ok
        if not use.any():
            return None
        w = np.ones(len(self.pos)) if weights is None else weights

        def est(m):
            return float(np.sum(self.pos[m] * w[m]) / np.sum(w[m]))

        top = abs(est(use) - self.target_top)
        bins = {}
        for key, (members, target) in self.bins.items():
            m = use & members
            if m.sum() >= MIN_BIN and np.sum(w[m]) > 0:
                bins[key] = abs(est(m) - target)
        return top, bins

    def census_bins(self):
        return set(self.errors(np.ones(len(self.pos), bool))[1]) if self.ok.any() else set()

    def expected_errors(self, k, rng, draws=B_SUB):
        """Expected errors when the estimate asks k people drawn with equal
        probability, without replacement, over `draws` subsamples: the mean
        topline error, and for every bin the census reports, (mean error over
        the subsamples showing the bin, share of subsamples showing it)."""
        n = len(self.pos)
        if k >= n:
            e = self.errors(np.ones(n, bool))
            return None if e is None else (e[0], {b: (v, 1.0) for b, v in e[1].items()})
        tops, sums, counts = [], {}, {}
        for _ in range(draws):
            chosen = np.zeros(n, bool)
            chosen[rng.choice(n, k, replace=False)] = True
            e = self.errors(chosen)
            if e is None:
                continue
            tops.append(e[0])
            for b, v in e[1].items():
                sums[b] = sums.get(b, 0.0) + v
                counts[b] = counts.get(b, 0) + 1
        if not tops:
            return None
        bins = {b: (sums[b] / counts[b], counts[b] / draws) for b in sums}
        for b in self.census_bins() - set(bins):
            bins[b] = (0.0, 0.0)  # never shown at this k
        return float(np.mean(tops)), bins

    def sampling_se(self, k):
        """Person-sampling standard errors of bin estimates when k of the
        people are drawn without replacement (finite-population corrected; 0
        at the census), for bins expecting at least MIN_BIN answering people."""
        n = int(self.ok.sum())
        out = []
        for members, _ in self.bins.values():
            vals = self.pos[members & self.ok]
            nb = len(vals)
            if nb < 2:
                continue
            kb = nb * min(k, n) / n
            if kb < MIN_BIN:
                continue
            out.append(float(np.std(vals, ddof=1) * np.sqrt(max(0.0, 1 / kb - 1 / nb))))
        return out

    def frame_se(self):
        """Standard errors of census bin estimates as samples from the
        population (between-person SD over the square root of bin size)."""
        out = []
        for members, _ in self.bins.values():
            vals = self.pos[members & self.ok]
            if len(vals) >= MIN_BIN:
                out.append(float(np.std(vals, ddof=1) / np.sqrt(len(vals))))
        return out


def rng_for(name):
    """A bootstrap or subsample generator seeded by the study seed and a stable
    hash of its name, so no result depends on which other comparisons ran."""
    return np.random.default_rng([SEED, zlib.crc32(name.encode())])


def paired(errs_a, errs_b, item_ids, name):
    """Bootstrap (items resampled) CI on A minus B from per-item errors
    {itemId: (topline error, {bin: error or (error, weight)})}. Subgroup
    differences pool the bins both arms report, each weighted by the product
    of its weights (1 for arms that always show the bin; a subsampled arm's
    share of subsamples showing it). With unit weights this is
    analyze_model_refresh.paired_errors."""
    rows = []
    for iid in item_ids:
        ea, eb = errs_a.get(iid), errs_b.get(iid)
        if ea is None or eb is None:
            continue
        (ta, ba), (tb, bb) = ea, eb
        diffs = []
        for k in sorted(set(ba) & set(bb)):
            (va, wa), (vb, wb) = bw(ba[k]), bw(bb[k])
            if wa * wb > 0:
                diffs.append((va - vb, wa * wb))
        rows.append((ta - tb, diffs))
    if not rows:
        return None
    n = len(rows)
    top = np.array([r[0] for r in rows])
    bin_sums = np.array([sum(d * w for d, w in r[1]) for r in rows])
    bin_weights = np.array([sum(w for _, w in r[1]) for r in rows])
    bin_counts = np.array([len(r[1]) for r in rows])
    idx = rng_for(name).integers(0, n, (N_BOOT, n))
    boot_top = top[idx].mean(axis=1)
    wsum = bin_weights[idx].sum(axis=1)
    boot_sub = np.where(wsum > 0, bin_sums[idx].sum(axis=1) / np.where(wsum > 0, wsum, 1), np.nan)

    def ci(point, boot):
        lo, hi = np.nanpercentile(boot, [2.5, 97.5])
        return {"diff": float(point), "lo": float(lo), "hi": float(hi)}

    return {
        "items": n,
        "bins": int(bin_counts.sum()),
        "topline": ci(top.mean(), boot_top),
        "subgroup": ci(bin_sums.sum() / bin_weights.sum(), boot_sub) if bin_weights.sum() > 0 else None,
    }


def score_errors(errs, item_ids):
    """Topline MAE and bin-pooled subgroup MAE from per-item errors, bins
    weighted as in paired(): E[sum of shown errors] / E[number shown]."""
    tops, sums, weights, item_means, shown = [], 0.0, 0.0, [], 0
    for iid in item_ids:
        e = errs.get(iid)
        if e is None:
            continue
        tops.append(e[0])
        b = [bw(v) for v in e[1].values()]
        s, w = sum(v * wt for v, wt in b), sum(wt for _, wt in b)
        sums += s
        weights += w
        shown += sum(1 for _, wt in b if wt > 0)
        if w > 0:
            item_means.append(s / w)
    return {
        "items": len(tops),
        "toplineMAE": mean(tops),
        "subgroupMAE": sums / weights if weights > 0 else None,
        "subgroupMAE_itemMean": mean(item_means),
        "bins": shown,
        "expectedBinsShown": weights,
    }


def run_log(model, arm):
    """The one per-call log of a study run (.jsonl while running, .jsonl.gz once committed)."""
    stem = A("evals", "results", "logs", f"v2-{PROVIDER[model]}-{model}-{arm}-all-{TAG}.jsonl")
    paths = [p for p in (stem, stem + ".gz") if os.path.exists(p)]
    if len(paths) != 1:
        raise SystemExit(f"expected exactly one log for {model} {arm}, found {[os.path.basename(p) for p in paths]}")
    return paths[0]


def log_costs(model, arm, people_stored):
    """Calls, tokens and USD for one study run from its per-call log, checking
    that every call went to the official API and that the log covers every
    stored person."""
    p_in, p_out = prices()[model]
    path = run_log(model, arm)
    calls = failed = tok_in = tok_out = truncated = 0
    apis = set()
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                truncated += 1  # cut off by a crash mid-write; the runner skips it too
                continue
            apis.add(row.get("api"))
            if row.get("content") is None and row.get("error"):
                failed += 1
                continue
            calls += 1
            tok_in += row["usage"]["in"]
            tok_out += row["usage"]["out"]
    if apis != {OFFICIAL_API} and not MOCK:
        raise SystemExit(f"{os.path.basename(path)}: calls went to {sorted(map(str, apis))}, not {OFFICIAL_API}")
    if calls < people_stored:
        raise SystemExit(f"{os.path.basename(path)}: {calls} answered calls for {people_stored} stored people")
    return {
        "log": os.path.basename(path),
        "calls": calls, "failedCalls": failed, "truncatedLines": truncated, "tokensIn": tok_in, "tokensOut": tok_out,
        "usd": round((tok_in * p_in + tok_out * p_out) / 1e6, 2),
    }


def check_aggregates(item, res, people):
    """The runner's stored topline and slices must equal the equal-weight
    means of the stored people (a cross-language check of the slice port)."""
    full = people.errors(np.ones(len(people.pos), bool))
    stored = item_errors(item, res)
    if full is None or stored is None:
        assert full is None and stored is None, item["itemId"]
        return
    assert abs(full[0] - stored[0]) < 1e-5, (item["itemId"], full[0], stored[0])
    assert set(full[1]) == set(stored[1]), (item["itemId"], sorted(set(full[1]) ^ set(stored[1])))
    for b in full[1]:
        assert abs(full[1][b] - stored[1][b]) < 1e-5, (item["itemId"], b)


def main():
    bank = {i["itemId"]: i for i in load("evals", "anchor-bank", "anchor-bank-v2.json")["items"]}
    all63 = sorted(bank)
    other43 = [i for i in all63 if i not in SUBSET20]
    sets = {"all63": all63, "other43": other43}
    refresh = load("evals", "results", "model-refresh-run.json")
    us = load("public", "data", "v1", "US.json")
    pool_records = us["samples"]
    with gzip.open(A("evals", "anchor-bank", "fresh-pools-US.json.gz"), "rt") as f:
        fresh_pools = json.load(f)["items"]

    # Population share of each age x earned-income x sex cell (D5).
    pop = {}
    for c in us["table"]["cells"]:
        key = (c["age"], c["income"], c["sex"])
        pop[key] = pop.get(key, 0.0) + c["weight"]
    total = sum(pop.values())
    pop = {k: v / total for k, v in pop.items()}

    def refresh_get(model, arm):
        key = f"{arm}:{PROVIDER[model]}:{model}:{TAG}"
        return lambda iid: (refresh["results"].get(iid) or {}).get(key)

    artifacts = {}
    for model, arm in RUNS:
        path = A("evals", "results", f"individual-sim-{model}-{arm.removeprefix('persona-prob-')}.json")
        if os.path.exists(path):
            art = load(path)
            if art.get("api") != OFFICIAL_API and not MOCK:
                raise SystemExit(f"{os.path.basename(path)} was written against {art.get('api')}")
            artifacts[(model, arm)] = art

    def study_get(model, arm):
        art = artifacts.get((model, arm))
        key = f"{arm}:{PROVIDER[model]}:{model}:{TAG}"
        return (lambda iid: (art["results"].get(iid) or {}).get(key)) if art else (lambda iid: None)

    def errs_of(get, items=all63):
        return {iid: item_errors(bank[iid], get(iid)) for iid in items if get(iid)}

    out = {
        "generatedFrom": "analysis/analyze_individual_sim.py",
        "registration": "paper/pap-individual-sim-2026-10.md (tag pap-individual-sim-2026-10)",
        "instrument": "anchor bank v2, prompts v4, persona-prob prompt (model refresh amendment 2)",
        "pooling": "subgroupMAE pools absolute errors across reported slice bins (PAP v2); at K < 1,200 each bin is weighted by the share of subsamples that show it",
        "intervals": "paired item-resampling bootstrap, 10,000 resamples; conditional on the released pool, the single cells and direct runs, and the census replies",
        "kGrid": K_GRID + [CENSUS],
        "subsamplesPerItem": B_SUB,
        "models": {},
    }
    if MOCK:
        out["MOCK_DATA"] = "Built from a local stand-in API, not model output. Never commit or display."

    # ---- people per item, census checks, expected errors by K
    people_of, expected, coverage = {}, {}, {}
    for model, arm in RUNS:
        get = study_get(model, arm)
        covered, flagged, stored = [], [], 0
        for iid in all63:
            res = get(iid)
            if not res or "people" not in res:
                continue
            failed, attempted = arm_failures(res)
            if attempted and failed / attempted > FLAG_RATE:
                flagged.append(iid)
            records = pool_records if arm == POOL else fresh_pools[iid]["records"]
            p = People(bank[iid], res["people"], records)
            check_aggregates(bank[iid], res, p)
            people_of[(model, arm, iid)] = p
            stored += len(res["people"])
            if res.get("topline") and iid not in flagged:
                covered.append(iid)
        coverage[(model, arm)] = {"covered": covered, "flagged": flagged, "people": stored}
        for k in K_GRID + [CENSUS]:
            errs = {}
            for iid in all63:
                p = people_of.get((model, arm, iid))
                if p is not None:
                    e = p.expected_errors(k, rng_for(f"sub|{model}|{arm}|{iid}|{k}"))
                    if e is not None:
                        errs[iid] = e
            expected[(model, arm, k)] = errs

    def k_errs(model, arm, k):
        return expected.get((model, arm, k), {})

    # ---- scores per model and arm
    for model in MODELS:
        m = {}
        for arm in ("cells", "naive", "persona", "persona-prob"):
            entry = {}
            for name, items in list(sets.items()) + [("subset20", SUBSET20)]:
                s = score(bank, refresh_get(model, arm), items)
                if s["items"] == len(items):
                    entry[name] = s
            if entry:
                m[arm] = entry
        for arm in (POOL, FRESH):
            if (model, arm) not in artifacts:
                continue
            cov = coverage[(model, arm)]
            entry = {
                "coveredItems": len(cov["covered"]),
                "flaggedItems": cov["flagged"],
                "census": {name: score(bank, study_get(model, arm), items)
                           for name, items in list(sets.items()) + [("subset20", SUBSET20)]},
                "byK": {},
            }
            for k in K_GRID + [CENSUS]:
                errs = k_errs(model, arm, k)
                rates = [r for e in errs.values() for _, r in e[1].values()]
                se = [v for iid in all63 if (model, arm, iid) in people_of for v in people_of[(model, arm, iid)].sampling_se(k)]
                entry["byK"][str(k)] = {
                    **{name: score_errors(errs, items) for name, items in sets.items()},
                    "binShowRate": mean(rates),
                    "meanPersonSamplingSE": mean(se) if se else 0.0,
                    "binsWithSE": len(se),
                }
            frame_se = [v for iid in all63 if (model, arm, iid) in people_of for v in people_of[(model, arm, iid)].frame_se()]
            entry["meanFrameSE"] = mean(frame_se)
            entry["cost"] = log_costs(model, arm, cov["people"])
            m[arm] = entry
        out["models"][model] = m

    # ---- Q1 individual vs cells; Q2 individual vs direct (census of the pool)
    q1, q2 = {}, {}
    for model in MODELS:
        census = k_errs(model, POOL, CENSUS)
        cells, direct = errs_of(refresh_get(model, "cells")), errs_of(refresh_get(model, "naive"))
        q1[model] = {name: paired(census, cells, items, f"Q1|{model}|{name}") for name, items in sets.items()}
        q2[model] = {name: paired(census, direct, items, f"Q2|{model}|{name}") for name, items in sets.items()}
    out["Q1_individualVsCells"] = q1
    out["Q2_individualVsDirect"] = q2

    # ---- Q3 people per item: each K against cells (K = 1,200 is Q1's all63 comparison)
    out["Q3_byKVsCells"] = {
        model: {
            **{str(k): paired(k_errs(model, POOL, k), errs_of(refresh_get(model, "cells")), all63, f"Q3|{model}|{k}")
               for k in K_GRID},
            str(CENSUS): q1[model]["all63"],
        }
        for model in MODELS
    }

    # ---- Q4 independent people (gpt-6-luna): fresh pools vs the released pool, vs cells
    fresh = k_errs(DEFAULT_MODEL, FRESH, CENSUS)
    out["Q4_freshPools"] = {
        "vsPool": paired(fresh, k_errs(DEFAULT_MODEL, POOL, CENSUS), all63, "Q4|vsPool"),
        "vsCells": paired(fresh, errs_of(refresh_get(DEFAULT_MODEL, "cells")), all63, "Q4|vsCells"),
    }

    # ---- Q5 models: gpt-6-luna minus gpt-6.1-sol, census of the pool
    out["Q5_lunaVsSol"] = paired(k_errs("gpt-6-luna", POOL, CENSUS), k_errs("gpt-6.1-sol", POOL, CENSUS), all63, "Q5")

    # ---- D1 test-retest within item: amendment 2's people asked again in the census
    retest = {}
    prior = load("evals", "results", "persona-prob-subset20-people.json")["models"]
    for model in MODELS:
        get = study_get(model, POOL)
        rs, diffs, sds, pairs, items = [], [], [], 0, 0
        for iid, rows in prior.get(model, {}).get("items", {}).items():
            res = get(iid)
            if not res:
                continue
            now = dict((i, d) for i, d in res["people"])
            pos = bank[iid]["positiveOptions"]
            both = [(pos_share(d, pos), pos_share(now[i], pos)) for i, d in rows if d is not None and now.get(i) is not None]
            if len(both) < MIN_BIN:
                continue
            a, b = np.array(both).T
            items += 1
            pairs += len(a)
            diffs.append(float(np.mean(np.abs(a - b))))
            sds.append(float(np.std(a, ddof=1)))
            if np.std(a) > 0 and np.std(b) > 0:
                rs.append(float(np.corrcoef(a, b)[0, 1]))
        if items:
            retest[model] = {
                "items": items,
                "pairs": pairs,
                "meanWithinItemPearson": mean(rs),
                "itemsWithPearson": len(rs),
                "meanWithinItemAbsDiff": mean(diffs),
                "meanWithinItemSD": mean(sds),
            }
    out["D1_testRetest"] = retest

    # ---- D4 continuity on the 20-item subset: census vs amendment 2's 150 people and vs persona
    out["D4_subset20"] = {
        model: {
            "vsPersonaProb150": paired(k_errs(model, POOL, CENSUS), errs_of(refresh_get(model, "persona-prob"), SUBSET20), SUBSET20, f"D4|{model}|pp"),
            "vsPersona": paired(k_errs(model, POOL, CENSUS), errs_of(refresh_get(model, "persona"), SUBSET20), SUBSET20, f"D4|{model}|persona"),
        }
        for model in MODELS
    }

    # ---- D5 composition: the census post-stratified to population age x earned-income x sex cells
    d5 = {}
    for model, arm in RUNS:
        errs, dropped = {}, []
        for iid in all63:
            p = people_of.get((model, arm, iid))
            if p is None:
                continue
            counts = {}
            for c, ok in zip(p.cells, p.ok):
                if ok:
                    counts[c] = counts.get(c, 0) + 1
            w = np.array([pop.get(c, 0.0) / counts[c] if ok and c in counts else 0.0 for c, ok in zip(p.cells, p.ok)])
            dropped.append(sum(v for c, v in pop.items() if c not in counts))
            e = p.errors(np.ones(len(p.pos), bool) & (w > 0), w)
            if e is not None:
                errs[iid] = e
        if errs:
            d5[f"{model}|{arm}"] = {
                "all63": score_errors(errs, all63),
                "meanPopulationShareWithoutPoolMembers": mean(dropped),
                "vsCensus": paired(errs, k_errs(model, arm, CENSUS), all63, f"D5|{model}|{arm}"),
            }
    out["D5_postStratified"] = d5

    # ---- registered product rules
    # K*: the smallest K whose error, compared with the census's on the same
    # items and the bins a K-person run shows, is at most K_TOLERANCE higher
    # on both topline and subgroups (gpt-6-luna, all 63 items covered).
    luna_cov = coverage.get((DEFAULT_MODEL, POOL), {"covered": []})
    k_star, added = None, {}
    if len(luna_cov["covered"]) == len(all63):
        census = k_errs(DEFAULT_MODEL, POOL, CENSUS)
        for k in K_GRID:
            d = paired(k_errs(DEFAULT_MODEL, POOL, k), census, all63, f"K|{DEFAULT_MODEL}|{k}")
            added[str(k)] = d
            if k_star is None and d["topline"]["diff"] <= K_TOLERANCE and d["subgroup"]["diff"] <= K_TOLERANCE:
                k_star = k
        k_star = k_star or CENSUS
    rule = {"addedErrorVsCensusByK": added, "kTolerance": K_TOLERANCE, "people": k_star,
            "gate": {"margin": GATE_MARGIN, "byModel": {}}}

    # Rules 2-4 score a K*-person run as the census on all bins plus the error
    # asking K* people adds on the bins such a run shows (zero at K* = 1,200),
    # so subgroups a small run hides cannot flatter it.
    def added_at(model):
        if k_star in (None, CENSUS):
            return {"topline": 0.0, "subgroup": 0.0}
        d = paired(k_errs(model, POOL, k_star), k_errs(model, POOL, CENSUS), all63, f"K|{model}|{k_star}")
        return {"topline": d["topline"]["diff"], "subgroup": d["subgroup"]["diff"]}

    for model in MODELS:
        cov = coverage.get((model, POOL), {"covered": [], "flagged": []})
        complete = len(cov["covered"]) == len(all63)
        q = q1[model]["all63"]
        add = added_at(model) if k_star and complete else None
        gap = ({"topline": q["topline"]["diff"] + add["topline"], "subgroup": q["subgroup"]["diff"] + add["subgroup"]}
               if add and q and q["subgroup"] else None)
        rule["gate"]["byModel"][model] = {
            "complete": complete,
            "flaggedItems": cov["flagged"],
            "addedErrorAtKStar": add,
            "gapToCells": gap,
            "passes": bool(gap and gap["topline"] <= GATE_MARGIN and gap["subgroup"] <= GATE_MARGIN),
        }
    luna = rule["gate"]["byModel"][DEFAULT_MODEL]
    q = q1[DEFAULT_MODEL]["all63"]
    rule["defaultEligible"] = bool(luna["passes"]
                                   and q["subgroup"]["hi"] + luna["addedErrorAtKStar"]["subgroup"] < 0
                                   and q["topline"]["hi"] + luna["addedErrorAtKStar"]["topline"] < DEFAULT_TOPLINE_MARGIN)
    rule["defaultToplineMargin"] = DEFAULT_TOPLINE_MARGIN
    out["productRule"] = rule

    # ---- accuracy the individual mode displays, per model that passes the gate
    out["individualBenchmark"] = {}
    for model in MODELS:
        g = rule["gate"]["byModel"][model]
        if g["passes"]:
            census = score_errors(k_errs(model, POOL, CENSUS), all63)
            at_k = score_errors(k_errs(model, POOL, k_star), all63)
            out["individualBenchmark"][model] = {
                "topline": census["toplineMAE"] + g["addedErrorAtKStar"]["topline"],
                "subgroup": census["subgroupMAE"] + g["addedErrorAtKStar"]["subgroup"],
                "items": census["items"],
                "people": k_star,
                "shareOfSubgroupsShown": at_k["expectedBinsShown"] / census["bins"],
            }

    with open(MOCK_OUT if MOCK else OUT, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"wrote {os.path.relpath(MOCK_OUT if MOCK else OUT, ROOT)}{' (MOCK_DATA)' if MOCK else ''}")
    print(json.dumps({
        "people": k_star,
        "addedErrorVsCensusByK": {k: (d["topline"]["diff"], d["subgroup"]["diff"]) for k, d in added.items()},
        "gate": {m: g["passes"] for m, g in rule["gate"]["byModel"].items()},
        "defaultEligible": rule["defaultEligible"], "individualBenchmark": out["individualBenchmark"],
    }, indent=1))


if __name__ == "__main__":
    main()
