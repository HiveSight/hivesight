"""Render the paper for hivesight.ai (static, served at /paper).

Hermetic render (PolicyBench lesson): JUPYTER_PREFER_ENV_PATH=1 so Quarto
resolves the python3 kernel from the active environment rather than by NAME
via user-level kernelspecs, which can execute a different checkout.

Figures render as SVG for the site profile (crisp at any width; the
submission PDF profile keeps PDF figures).

Run: uv run --with "jupyter,nbclient,ipykernel,numpy,scipy,matplotlib" \
       python paper/render_site.py
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "paper")


def main():
    env = os.environ.copy()
    env["JUPYTER_PREFER_ENV_PATH"] = "1"
    env.setdefault("QUARTO_PYTHON", sys.executable)
    env["HS_PAPER_TARGET"] = "html"

    # Site figures: regenerate as SVG next to the PDFs.
    subprocess.run(
        [sys.executable, os.path.join(ROOT, "analysis", "make_paper_assets.py")],
        check=True, env=env,
    )

    shutil.rmtree(OUT, ignore_errors=True)
    subprocess.run(
        ["quarto", "render", "paper.qmd", "--profile", "site", "--to", "html"],
        cwd=HERE, check=True, env=env,
    )
    index = os.path.join(OUT, "paper.html")
    if os.path.exists(index):
        os.replace(index, os.path.join(OUT, "index.html"))
    idx = os.path.join(OUT, "index.html")
    assert os.path.exists(idx), "render produced no index"
    # Serve at the extensionless /paper: anchor all relative asset URLs.
    html = open(idx).read()
    if "<base " not in html:
        html = html.replace("<head>", '<head><base href="/paper/">', 1)
        open(idx, "w").write(html)
    size = os.path.getsize(os.path.join(OUT, "index.html")) / 1024
    print(f"rendered public/paper/index.html ({size:.0f} KB)")


if __name__ == "__main__":
    main()
