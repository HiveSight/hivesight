"""Build independent per-item person pools for the individual-simulation
study (paper/pap-individual-sim-2026-10.md, arm persona-prob-fresh).

For every anchor-bank v2 item, draws a fresh weight-proportional sample of
1,200 adults from the pinned US population frame, with its own seed per
item. The released pool (build_cell_release.py) is a systematic sample in
frame order; here the systematic pass runs over a random order of the frame,
because systematic samples whose random starts happen to fall close together
share most of their records, so pools drawn in frame order are not
independent. Like the released pool, each pool is a weight-proportional
sample, so its records are weighted equally.

Input: the US frame `US.json.gz` from the Hugging Face dataset at the pinned
revision (DATA.md; default data/raw/US.json.gz or $US_PERSONA_PATH). Its
SHA-256 is checked before drawing.

Output: evals/anchor-bank/fresh-pools-US.json.gz

Run: uv run --with "numpy==2.3.4" python pipeline/build_fresh_pools.py
"""

import gzip
import hashlib
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_cell_release import HF_BASE, SAMPLE_FIELDS, SAMPLE_N, US_LOCAL, sample_record  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BANK = os.path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v2.json")
OUT = os.path.join(ROOT, "evals", "anchor-bank", "fresh-pools-US.json.gz")
FRAME_SHA256 = "9f7a7e20dfdb01ca934ad349ea1ba4417aa8e9018280958389cdb1a49a03d0bd"
SEED_BASE = 20261023


def item_seed(item_id, base=SEED_BASE):
    """FNV-1a over "<base>:<itemId>", as evals/run-anchor-bank-v2.mjs itemSeed."""
    h = 0x811C9DC5
    for ch in f"{base}:{item_id}":
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shuffled_systematic_indices(weights, n, rng):
    """Frame indices (ascending) of a systematic weight-proportional sample of
    n records taken over a random permutation of the frame."""
    order = rng.permutation(len(weights))
    cumw = np.cumsum(weights[order])
    step = cumw[-1] / n
    targets = rng.random() * step + step * np.arange(n)
    return sorted(int(i) for i in order[np.searchsorted(cumw, targets)])


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    if sha256(US_LOCAL) != FRAME_SHA256:
        sys.exit(f"{US_LOCAL} does not match the pinned frame (SHA-256 {FRAME_SHA256})")
    with gzip.open(US_LOCAL) as f:
        persons = json.load(f)["persons"]
    weights = np.array([p["weight"] for p in persons])
    items = [i["itemId"] for i in json.load(open(BANK))["items"]]
    pools = {}
    for item_id in items:
        seed = item_seed(item_id)
        idx = shuffled_systematic_indices(weights, SAMPLE_N, np.random.default_rng(seed))
        pools[item_id] = {"seed": seed, "frameIdx": idx, "records": [sample_record(persons[i]) for i in idx]}
    out = {
        "version": "fresh-pools-v1",
        "frame": {
            "source": f"{HF_BASE}/districts/US.json.gz",
            "sha256": FRAME_SHA256,
            "records": len(persons),
        },
        "seedBase": SEED_BASE,
        "design": "systematic weight-proportional sample over a seeded random permutation of the frame",
        "n": SAMPLE_N,
        "fields": SAMPLE_FIELDS,
        "items": pools,
    }
    # mtime=0 keeps the gzip bytes deterministic.
    with open(OUT, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as f:
        f.write(json.dumps(out, separators=(",", ":")).encode())
    sets = [set(p["frameIdx"]) for p in pools.values()]
    overlap = [len(a & b) for i, a in enumerate(sets) for b in sets[i + 1:]]
    distinct = len(set().union(*sets))
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(pools)} pools of {SAMPLE_N}; "
          f"{distinct} distinct frame records; records shared by two pools: "
          f"mean {np.mean(overlap):.2f}, max {max(overlap)}")


if __name__ == "__main__":
    main()
