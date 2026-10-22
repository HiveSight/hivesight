"""CI check: regenerated paper/artifacts/*.json match the committed versions.

Numbers are compared to a relative tolerance of 1e-9 rather than byte for
byte: Linux and macOS builds of numpy/scipy round the last bits differently
(e.g. 0.03974127130096648 vs 0.039741271300966496), which kept a byte-diff
check failing on every push since July 2026. Any substantive change still
fails, and so do added, removed or untracked artifacts.

Run after the analysis scripts: python3 analysis/compare_artifacts.py
"""

import json
import math
import subprocess
import sys

REL, ABS = 1e-9, 1e-12


def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def compare(a, b, path, out):
    if isinstance(a, bool) or isinstance(b, bool) or not all(isinstance(x, (int, float)) for x in (a, b)):
        if type(a) is not type(b):
            out.append(f"{path}: type {type(a).__name__} -> {type(b).__name__}")
        elif isinstance(a, dict):
            for key in sorted(set(a) | set(b)):
                if key not in a or key not in b:
                    out.append(f"{path}.{key}: {'added' if key in b else 'removed'}")
                else:
                    compare(a[key], b[key], f"{path}.{key}", out)
        elif isinstance(a, list):
            if len(a) != len(b):
                out.append(f"{path}: length {len(a)} -> {len(b)}")
            else:
                for i, (x, y) in enumerate(zip(a, b)):
                    compare(x, y, f"{path}[{i}]", out)
        elif a != b:
            out.append(f"{path}: {a!r} -> {b!r}")
        return
    if math.isnan(a) and math.isnan(b):
        return
    if not math.isclose(a, b, rel_tol=REL, abs_tol=ABS):
        out.append(f"{path}: {a!r} -> {b!r}")


def main():
    mismatches = []
    status = git("status", "--porcelain", "--untracked-files=all", "--", "paper/artifacts")
    for line in status.splitlines():
        if line.startswith("??") or line.startswith(" D"):
            mismatches.append(f"{line[3:]}: {'untracked' if line.startswith('??') else 'deleted'}")
    for path in git("ls-files", "paper/artifacts/*.json").split():
        committed = json.loads(git("show", f"HEAD:{path}"))
        with open(path) as f:
            current = json.load(f)
        compare(committed, current, path, mismatches)
    for m in mismatches[:50]:
        print(m)
    if mismatches:
        sys.exit(f"{len(mismatches)} artifact difference(s) beyond floating-point tolerance")
    print("paper/artifacts match the committed versions")


if __name__ == "__main__":
    main()
