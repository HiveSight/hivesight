"""Merge the per-model model-refresh artifacts into one run artifact.

Each refresh model ran in parallel with its own artifact
(evals/results/model-refresh-<model>.json) so concurrent writers could not
overwrite each other. This merges them, in a fixed order, into
evals/results/model-refresh-run.json (the file the addendum names) and
removes the per-model files. Fails on any key collision.

Run: uv run python evals/merge_refresh_artifacts.py
"""

import glob
import json
import os

RESULTS = os.path.join(os.path.dirname(__file__), "results")
OUT = os.path.join(RESULTS, "model-refresh-run.json")


def main():
    parts = sorted(glob.glob(os.path.join(RESULTS, "model-refresh-*.json")))
    parts = [p for p in parts if os.path.abspath(p) != os.path.abspath(OUT)]
    if not parts:
        raise SystemExit("no per-model artifacts to merge")
    merged = json.load(open(OUT)) if os.path.exists(OUT) else None
    for path in parts:
        part = json.load(open(path))
        if merged is None:
            merged = {k: v for k, v in part.items() if k not in ("results", "usage")}
            merged["results"], merged["usage"] = {}, {}
        for meta in ("version", "bank", "promptVersion"):
            if part.get(meta) != merged.get(meta):
                raise SystemExit(f"{path}: {meta} {part.get(meta)!r} != {merged.get(meta)!r}")
        for item, arms in part["results"].items():
            dest = merged["results"].setdefault(item, {})
            for key, value in arms.items():
                if key in dest:
                    raise SystemExit(f"{path}: duplicate result {item} {key}")
                dest[key] = value
        for key, value in (part.get("usage") or {}).items():
            if key in merged["usage"]:
                raise SystemExit(f"{path}: duplicate usage {key}")
            merged["usage"][key] = value
    merged["results"] = {k: dict(sorted(v.items())) for k, v in sorted(merged["results"].items())}
    merged["usage"] = dict(sorted(merged["usage"].items()))
    with open(OUT, "w") as f:
        json.dump(merged, f, indent=1)
    for path in parts:
        os.remove(path)
    print(f"merged {len(parts)} artifacts into {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
