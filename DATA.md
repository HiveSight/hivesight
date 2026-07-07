# Data acquisition, versions, and checksums

Every human-target artifact in this repository derives from four public data
products. None of the respondent-level files are redistributed here; the
committed artifacts contain weighted aggregates only. To regenerate targets
from scratch, obtain the files below, place them at the paths given (or set
the environment variables), verify checksums, and run the builders in
REPRODUCING.md.

## GSS 1972–2024 cumulative file, Release 2

- Source: NORC, https://gss.norc.org/us/en/gss/get-the-data/stata.html
- File: `gss7224_r2.dta` (Stata format, ~595 MB)
- SHA-256: `02456dff12a84849fb0bedda2abfd441312c41d1795cad47fd5b364821dd95b7`
- Path: set `GSS_DTA=/path/to/gss7224_r2.dta` (builder default points at the
  authors' local copy)
- Terms: GSS data are free for research use but are **not redistributed** in
  this repository. Weights used: `wtssnrps` (2022, 2024).

## SHED 2024 and 2023 public use files

- Source: Board of Governors of the Federal Reserve System,
  https://www.federalreserve.gov/consumerscommunities/shed_data.htm
- Files: `SHED_public_use_data_2024_(CSV).zip` → `public2024.csv`
  (Feb 9 2026 revision); `SHED_public_use_data_2023_(CSV).zip` →
  `public2023.csv`
- SHA-256 (`public2024.csv`):
  `82897c55a7c3dc1c056270506714d174732215927419f7d571400612cdd30819`
- SHA-256 (`public2023.csv`):
  `b83343cf6ab2662d3d8ed821e1a460ed7bd7804275b7997b727e0e2a2276b336`
- Path: `$HS_SCRATCH/public2024.csv`, `$HS_SCRATCH/public2023.csv`
- Weight used: `weight`.

## BRFSS 2023

- Source: CDC, https://www.cdc.gov/brfss/annual_data/annual_2023.html
- File: `LLCP2023XPT.zip` → `LLCP2023.XPT ` — note the **trailing space in
  the filename inside CDC's zip**; the builder expects it verbatim.
- SHA-256 (`LLCP2023.XPT `):
  `3d3bf8ef5195bde227828ddc4c90745b76e8b304f8f5b9a043b6d99895fd1615`
- Path: `$HS_SCRATCH/LLCP2023.XPT ` (trailing space)
- Weight used: `_LLCPWT`. Kentucky and Pennsylvania did not meet BRFSS 2023
  data-collection requirements and are absent.

## Population frame (synthetic microdata)

- Source: Hugging Face dataset `MaxGhenis/hivesight-persona-data`, pinned
  revision `f27f20ae7d9dd255bd9d93b4ffaf3f057685c813`
  (https://huggingface.co/datasets/MaxGhenis/hivesight-persona-data/tree/f27f20ae7d9dd255bd9d93b4ffaf3f057685c813)
- Built from CPS microdata with survey-weight calibration and geographic
  assignment; the derived cell tables and sample pools this repository
  actually consumes are **committed** at `public/data/v1/` and are sufficient
  for every analysis in the paper.

## Environment variables

- `HS_SCRATCH` — directory holding the downloaded raw files (defaults to a
  session-specific temp path in the builders; set it explicitly).
- `GSS_DTA` — full path to `gss7224_r2.dta`.
