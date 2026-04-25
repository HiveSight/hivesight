# Fresh session prompt

Use this prompt to continue the HiveSight work in a new Codex session.

```text
We are working in /Users/maxghenis/HiveSight/hivesight.

Context:
- HiveSight is a Next.js/Vercel app for AI audience research grounded in calibrated US synthetic population microdata.
- The current positioning should be: "Ask AI audiences anything you would ask humans, grounded in calibrated population microdata."
- Geography is the entry point, not the whole product. The deeper asset is rich long-wise geography-assigned microdata from policyengine-us-data-like records.
- The latest important commit is 580b14d: "Improve HiveSight research UX and benchmarks".
- CI passed for that commit.
- Production https://hivesight.ai was manually deployed and verified.
- Supabase project hivesight had been inactive, was restored, and migrations 00001-00004 are recorded.
- A live anonymous survey smoke test succeeded with personaSource=microdata.

Read first:
- docs/clean-sheet-strategy.md
- src/app/page.tsx
- src/app/(public)/benchmarks/page.tsx
- src/app/(public)/thesis/page.tsx
- src/app/api/survey/stream/route.ts
- src/lib/data/demographics.ts
- src/lib/data/location-resolver.ts
- src/lib/simulation/prompts.ts
- src/lib/benchmarks/data/foundation-v1.json
- src/lib/benchmarks/data/execution-spec-v1.json

The next best implementation priorities are:
1. Add production health checks and monitoring for Supabase, OpenAI config, and microdata load.
2. Add richer audience targeting filters from microdata: income, age, family structure, housing tenure, benefits, insurance, occupation, disability, student status, race/ethnicity, sex, and geography.
3. Replace keyword-only question-aware context selection with a typed field registry and deterministic rules.
4. Publish the first benchmark result, not just the benchmark plan.
5. Improve results pages with provenance, selected fields, sample details, stability/uncertainty, rerun, and compare audiences.

Important constraints:
- Do not over-position HiveSight as civic-only or geography-only.
- Do not describe it as a toy or merely a poll pretest; the product should claim real decision support while being explicit about validation and task dependence.
- Do not dump every microdata field into prompts. Field selection should be auditable and benchmarked.
- Use apply_patch for edits.
- Run npm test, npm run typecheck, and npm run benchmarks:check after relevant changes.
- If deploying, verify live pages and the anonymous survey path.
```

