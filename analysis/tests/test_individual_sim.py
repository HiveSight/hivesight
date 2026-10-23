"""Properties of the individual-simulation analysis and the fresh-pool draw.

Run: uv run --with "numpy==2.3.4" --with pytest --with hypothesis pytest analysis/tests -q
"""

import gzip
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "analysis"))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))

import analyze_individual_sim as ais  # noqa: E402
from analyze_model_refresh import paired_errors  # noqa: E402
from build_cell_release import systematic_indices  # noqa: E402
from build_fresh_pools import item_seed, shuffled_systematic_indices  # noqa: E402

NODE = shutil.which("node")
FRAME = os.path.join(ROOT, "data", "raw", "US.json.gz")


def toy_item():
    return {
        "itemId": "toy",
        "positiveOptions": [0],
        "targets": {
            "overall": {"dist": [0.4, 0.3, 0.3]},
            "slices": {
                "sex": {"women": {"dist": [0.5, 0.25, 0.25]}, "men": {"dist": [0.3, 0.35, 0.35]}},
                "age_band": {"18-29": {"dist": [0.2, 0.4, 0.4]}, "65+": {"dist": [0.6, 0.2, 0.2]}},
            },
        },
    }


def record(female, age):
    return {"age": age, "is_female": female, "employment_income": 0, "self_employment_income": 0, "tenure_type": 1}


people_strategy = st.lists(
    st.tuples(
        st.booleans(),
        st.integers(18, 90),
        st.one_of(st.none(), st.lists(st.integers(0, 100), min_size=3, max_size=3).filter(lambda v: sum(v) > 0)),
    ),
    min_size=12,
    max_size=120,
)


def build(rows):
    records = [record(f, a) for f, a, _ in rows]
    people = [[i, None if d is None else [x / sum(d) for x in d]] for i, (_, _, d) in enumerate(rows)]
    return ais.People(toy_item(), people, records)


@settings(max_examples=60, deadline=None)
@given(people_strategy)
def test_census_is_the_all_people_estimate(rows):
    p = build(rows)
    e = p.expected_errors(len(rows), np.random.default_rng(0))
    full = p.errors(np.ones(len(rows), bool))
    if full is None:
        assert e is None
        return
    assert e[0] == full[0]
    assert e[1] == {b: (v, 1.0) for b, v in full[1].items()}


@settings(max_examples=60, deadline=None)
@given(people_strategy, st.integers(1, 200), st.integers(0, 2**31))
def test_expected_errors_cover_every_census_bin(rows, k, seed):
    p = build(rows)
    e = p.expected_errors(k, np.random.default_rng(seed), draws=20)
    if e is None:
        return
    top, bins = e
    assert 0 <= top <= 1
    assert set(bins) == p.census_bins()
    for err, rate in bins.values():
        assert 0 <= err <= 1 and 0 <= rate <= 1
        assert rate > 0 or err == 0


@settings(max_examples=60, deadline=None)
@given(people_strategy)
def test_bins_need_ten_answering_people(rows):
    p = build(rows)
    e = p.errors(np.ones(len(rows), bool))
    if e is None:
        return
    for key, (members, _) in p.bins.items():
        assert (key in e[1]) == ((members & p.ok).sum() >= ais.MIN_BIN)


@settings(max_examples=40, deadline=None)
@given(people_strategy)
def test_person_sampling_se_vanishes_at_the_census(rows):
    p = build(rows)
    assert all(v == 0 for v in p.sampling_se(len(rows)))


def test_person_sampling_se_counts_failed_replies_as_drawn():
    # 40 women and 40 men answer, 40 people fail: drawing 80 of the 120
    # records leaves some answering people out, so the SE is not zero.
    rows = [(True, 40, [30 + (j % 7), 40, 30]) for j in range(40)]
    rows += [(False, 40, [10 + (j % 5), 50, 40]) for j in range(40)]
    rows += [(True, 40, None)] * 40
    p = build(rows)
    se = p.sampling_se(80)
    assert se and all(v > 0 for v in se)
    assert all(v == 0 for v in p.sampling_se(120))


@settings(max_examples=40, deadline=None)
@given(people_strategy, st.floats(0.1, 10))
def test_equal_weights_reproduce_the_unweighted_estimate(rows, c):
    p = build(rows)
    everyone = np.ones(len(rows), bool)
    a, b = p.errors(everyone), p.errors(everyone, np.full(len(rows), c))
    if a is None:
        return
    assert b[0] == pytest.approx(a[0], abs=1e-12)
    assert set(a[1]) == set(b[1])
    assert all(b[1][k] == pytest.approx(a[1][k], abs=1e-12) for k in a[1])


BINS = [("sex", "men"), ("sex", "women"), ("age_band", "65+")]
errs_strategy = st.dictionaries(
    st.sampled_from([f"i{j}" for j in range(12)]),
    st.tuples(st.floats(0, 1), st.dictionaries(st.sampled_from(BINS), st.floats(0, 1), min_size=1)),
    min_size=2,
)
weighted_strategy = st.dictionaries(
    st.sampled_from([f"i{j}" for j in range(12)]),
    st.tuples(
        st.floats(0, 1),
        st.dictionaries(st.sampled_from(BINS), st.tuples(st.floats(0, 1), st.floats(0.05, 1)), min_size=1),
    ),
    min_size=2,
)


@settings(max_examples=40, deadline=None)
@given(errs_strategy, errs_strategy)
def test_unit_weights_match_the_refresh_bootstrap(a, b):
    """Differential: the study's weighted pairing with unit weights is the
    refresh's paired_errors, draw for draw."""
    items = sorted(set(a) | set(b))
    assert ais.paired(a, b, items, "x") == paired_errors(a, b, items, ais.rng_for("x"))


@settings(max_examples=40, deadline=None)
@given(weighted_strategy, weighted_strategy)
def test_paired_difference_is_antisymmetric(a, b):
    items = sorted(set(a) | set(b))
    ab, ba = ais.paired(a, b, items, "y"), ais.paired(b, a, items, "y")
    if ab is None:
        assert ba is None
        return
    for metric in ("topline", "subgroup"):
        if ab[metric] is None:
            assert ba[metric] is None
            continue
        assert ab[metric]["diff"] == pytest.approx(-ba[metric]["diff"], abs=1e-12)
        assert ab[metric]["lo"] == pytest.approx(-ba[metric]["hi"], abs=1e-12)


@settings(max_examples=40, deadline=None)
@given(weighted_strategy)
def test_paired_point_estimate_is_the_weighted_mae_difference(a):
    # Against an arm that always shows each bin with the same error: the
    # difference is the weighted MAE of A minus that constant.
    b = {iid: (0.25, {k: 0.1 for k in bins}) for iid, (_, bins) in a.items()}
    items = sorted(a)
    d = ais.paired(a, b, items, "z")
    sa = ais.score_errors(a, items)
    assert d["topline"]["diff"] == pytest.approx(sa["toplineMAE"] - 0.25, abs=1e-12)
    assert d["subgroup"]["diff"] == pytest.approx(sa["subgroupMAE"] - 0.1, abs=1e-12)
    zero = ais.paired(a, a, items, "z")
    assert zero["topline"] == {"diff": 0.0, "lo": 0.0, "hi": 0.0}


def test_score_errors_pools_and_weights_bins():
    errs = {"x": (0.1, {("sex", "men"): 0.2}), "y": (0.3, {("sex", "men"): 0.0, ("sex", "women"): 0.4, ("age_band", "65+"): 0.8})}
    s = ais.score_errors(errs, ["x", "y"])
    assert s["subgroupMAE"] == pytest.approx(1.4 / 4)
    assert s["subgroupMAE_itemMean"] == pytest.approx((0.2 + 0.4) / 2)
    assert s["toplineMAE"] == pytest.approx(0.2)
    # A bin shown in a quarter of subsamples counts a quarter.
    w = ais.score_errors({"x": (0.1, {("sex", "men"): (0.8, 0.25), ("sex", "women"): (0.2, 1.0)})}, ["x"])
    assert w["subgroupMAE"] == pytest.approx((0.8 * 0.25 + 0.2) / 1.25)
    assert w["expectedBinsShown"] == pytest.approx(1.25)


def test_named_bootstraps_do_not_depend_on_other_comparisons():
    a = {f"i{j}": (0.1 * j, {("sex", "men"): 0.05 * j}) for j in range(8)}
    b = {f"i{j}": (0.2, {("sex", "men"): 0.1}) for j in range(8)}
    first = ais.paired(a, b, sorted(a), "Q1|m|all63")
    ais.paired(b, a, sorted(a), "something else")
    assert ais.paired(a, b, sorted(a), "Q1|m|all63") == first


@settings(max_examples=40, deadline=None)
@given(st.lists(st.floats(0, 5), min_size=1, max_size=300), st.integers(1, 400), st.integers(0, 2**31))
def test_systematic_indices(weights, n, seed):
    assume(sum(weights) > 0)
    persons = [{"weight": w} for w in weights]
    idx = systematic_indices(persons, n, np.random.default_rng(seed))
    if len(persons) <= n:
        assert idx == list(range(len(persons)))
        return
    assert len(idx) == n
    assert idx == sorted(idx)
    assert all(0 <= i < len(persons) for i in idx)
    # Zero-weight records are never drawn (barring a random start of exactly 0).
    assert all(weights[i] > 0 for i in idx)


@settings(max_examples=40, deadline=None)
@given(st.lists(st.floats(0.01, 5), min_size=50, max_size=300), st.integers(1, 40), st.integers(0, 2**31))
def test_shuffled_systematic_draw(weights, n, seed):
    w = np.array(weights)
    idx = shuffled_systematic_indices(w, n, np.random.default_rng(seed))
    assert len(idx) == n and idx == sorted(idx)
    assert all(0 <= i < len(w) for i in idx)
    # A record is drawn at most ceil(n * w / W) times.
    counts = np.bincount(idx, minlength=len(w))
    assert np.all(counts <= np.ceil(n * w / w.sum()) + 1e-9)


def test_shuffled_systematic_inclusion_is_proportional_to_weight():
    w = np.array([1.0] * 50 + [3.0] * 50)
    hits = np.zeros(100)
    rng = np.random.default_rng(5)
    for _ in range(4000):
        hits[shuffled_systematic_indices(w, 20, rng)] += 1
    # Expected inclusion: 20 * w / 200 = 0.1 (light) and 0.3 (heavy).
    assert hits[:50].mean() / 4000 == pytest.approx(0.1, abs=0.01)
    assert hits[50:].mean() / 4000 == pytest.approx(0.3, abs=0.01)


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_python_ports_match_the_runner():
    """item_seed is a port of the runner's itemSeed; slice_label of its
    PERSONA_SLICE (not exported, so the analysis's check_aggregates compares
    slices with the runner's on every item; here, pin the boundaries)."""
    bank = json.load(open(os.path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v2.json")))
    ids = [i["itemId"] for i in bank["items"]]
    script = """
      import { itemSeed } from "./evals/run-anchor-bank-v2.mjs";
      console.log(JSON.stringify(JSON.parse(process.argv[1]).map((i) => itemSeed(i, 20261023))));
    """
    out = subprocess.run([NODE, "--input-type=module", "-e", script, json.dumps(ids)], cwd=ROOT,
                         capture_output=True, text=True, check=True)
    assert json.loads(out.stdout) == [item_seed(i) for i in ids]
    assert ais.slice_label("age_band", {"age": 29}) == "18-29"
    assert ais.slice_label("age_band", {"age": 30}) == "30-44"
    assert ais.slice_label("age_band", {"age": 65}) == "65+"
    base = {"employment_income": 24999.99, "self_employment_income": 0}
    assert ais.slice_label("income_band", base) == "<$25k"
    assert ais.slice_label("income_band", {**base, "self_employment_income": 0.01}) == "$25k-$74,999"
    assert ais.slice_label("income_band", {"employment_income": 150000, "self_employment_income": 0}) == "$150k+"
    assert ais.slice_label("tenure", {"tenure_type": 2}) == "renters or other housing"


def test_cell40_matches_the_population_cells():
    us = json.load(open(os.path.join(ROOT, "public", "data", "v1", "US.json")))
    keys = {(c["age"], c["income"], c["sex"]) for c in us["table"]["cells"]}
    assert len(keys) == 40
    assert {ais.cell40(p) for p in us["samples"]} <= keys


def test_fresh_pools_match_the_registered_checksum():
    import hashlib

    raw = open(os.path.join(ROOT, "evals", "anchor-bank", "fresh-pools-US.json.gz"), "rb").read()
    src = open(os.path.join(ROOT, "evals", "run-anchor-bank-v2.mjs")).read()
    assert f'FRESH_POOLS_SHA256 = "{hashlib.sha256(raw).hexdigest()}"' in src


@pytest.mark.skipif(not os.path.exists(FRAME), reason="frame not downloaded")
def test_fresh_pools_rebuild_from_the_pinned_frame():
    import build_cell_release as b

    with gzip.open(FRAME) as f:
        persons = json.load(f)["persons"]
    released = json.load(open(os.path.join(ROOT, "public", "data", "v1", "US.json")))["samples"]
    assert b.systematic_sample(persons, b.SAMPLE_N, np.random.default_rng(b.SEED)) == released
    with gzip.open(os.path.join(ROOT, "evals", "anchor-bank", "fresh-pools-US.json.gz"), "rt") as f:
        fresh = json.load(f)
    weights = np.array([p["weight"] for p in persons])
    for item_id in ("gss_happy", "shed_b2"):
        pool = fresh["items"][item_id]
        idx = shuffled_systematic_indices(weights, b.SAMPLE_N, np.random.default_rng(item_seed(item_id)))
        assert idx == pool["frameIdx"]
        assert [b.sample_record(persons[i]) for i in idx] == pool["records"]
