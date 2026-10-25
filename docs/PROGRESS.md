# WindDesk — Progress log

Claude Code updates this file at the end of every phase (and whenever something important changes). Read it at the start of every session.

## Status

| Phase | Status | Time used | Notes |
|---|---|---|---|
| 0 Walking skeleton | 🟨 in progress | ~1.1 h | Local, Docker and CI green. Only remaining DoD item: 👤 Vercel import + production URL checks |
| 1 Data snapshot | ✅ done | ~1.0 h | Snapshot `ac22a4140bca`; 13 contract tests pass; started while Phase 0 waits on Vercel (human said continue) |
| 2 Analytics core | ✅ done | ~1.25 h | 99.5% analytics coverage; store loads in ~257 ms; calibration within ±5 pp |
| 3 Notebook + insights | ⬜ | | |
| 4 API | ⬜ | | |
| 5 Frontend + Monitor | ⬜ | | |
| 6 Decision Desk | ⬜ | | |
| 7 Accuracy Lab + Methodology | ⬜ | | |
| 8 Polish + release | ⬜ | | |
| 9 Stretch | ⬜ | | |

Legend: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked

## Links
- Repo: https://github.com/vedant-3010/e26ay (public)
- Production URL: _(pending: Vercel import)_
- Video: _(fill in)_

## Waiting on the human 👤
1. **Import the repo into Vercel** (Hobby, vercel.com/new → `vedant-3010/e26ay`). Leave the framework preset as detected; `vercel.json` sets the build command. Paste back the production URL (`<project>.vercel.app`), plus the build log if the build fails. As of 2026-10-26 no Vercel project for `e26ay` exists in the connected account.
2. Then Claude Code checks in a cold context: `curl -H 'Accept: text/html' <url>/` and `<url>/monitor` return the SPA, and `<url>/api/health` returns JSON with `snapshot_id` = `ac22a4140bca`, which proves the snapshot is inside the function bundle.
3. Commits are approved by the human one batch at a time (standing instruction).
4. **FYI, data finding to discuss before the pitch (Phase 3 will quantify it):** at the decision lead, WINDFOR **over-forecasts FUELHH wind by about 1.7 GW on average** (EPEX bias +1,746 MW, MAE 2,022 MW, WAPE 17.9%). The bias rises with forecast level, from +371 MW in the lowest quintile to +3,458 MW in the highest. That pattern is consistent with transmission constraints/curtailment (metered output below the unconstrained forecast in windy hours), or with a scope difference between the two datasets (PRD assumption 5). This is a **hypothesis, not yet confirmed**: Phase 3 checks it against Elexon's dataset descriptions and states it honestly on the Methodology page.

## Log
<!-- Newest first. One entry per phase or significant event. -->

### 2026-10-26 — Phase 2: Analytics core ✅
- **Built (all pure, mypy `--strict`):**
  - `analytics/selection.py`: `select_at_horizon` (merge_asof, backward, by target), `coverage`, `select_decision_run` (no look-ahead filter first; gaps never substituted), `make_pairs` (H ↔ the period starting at H), `decision_pool`, `vintages_for_day`.
  - `metrics.py`: `compute_metrics` → `Metrics` (n, MAE, RMSE, bias, WAPE, P50/P90/P99 |e|, P90 shortfall, max shortfall + time).
  - `buffers.py`: simple and conditional LODO buffers (quintile bins, n < 30 falls back), `firm_wind`, `calibrate`.
  - `accuracy.py`: lead curve (floor bins), distribution, by hour, by level (+ achieved %), daily, worst hours, auction comparison, value of the forecast.
  - `decision.py`: `decision_day` with KPIs, energy, buffers and vintages.
  - `narrative.py`: `decision_summary` (with a Trader-view variant) and `accuracy_takeaways`.
  - `store.py`: `DataStore` (snapshot, all pairs, both pools, 2 × 3 calibrations, 1 h/3 h lead curves, cached custom-cutoff pools), built in the FastAPI lifespan and lazily via `get_store()`.
  - `ingest.validate` now calls `select_decision_run` (the Phase 1 follow-up); `quality.json` is byte-identical.
- **Tests:** a synthetic fixture in `tests/conftest.py` (3 days, runs at 07:30/09:30/11:30, h:30 periods offset on purpose to catch misalignment) with every expectation derived in comments. It covers all DATA §7 cases 1–13: exact horizon boundary, nulls and coverage, `lead ≥ H` at 97 horizons, the BST cutoff, a run 1 minute after the cutoff being ignored (and one exactly at it used), partial runs without substitution, metrics with n = 0, LODO invariance under a 5 GW change to the day's own actuals, bins with n < 30 falling back, 0 ≤ firm ≤ forecast, energy integration, lead-curve counts per bin, and every narrative branch.
- **Checks (2026-10-26):**
  - `make check` ✅: **242 pytest, analytics line coverage 99.48%** (gate 90% now enforced in `make test` and CI); mypy strict clean (26 files); 11 Vitest; build OK.
  - `make test-contract` ✅: **128 passed**, including:
    - `lead ≥ H` on the real snapshot at all 97 horizons;
    - coverage of 100% for H ≤ 43.5 h, with gaps exactly at 22:00 (44 h) and 22:00 + 23:00 (45 h);
    - no look-ahead for all 31 days × 5 cutoffs (EPEX, N2EX, 00:00, 09:00, 12:45);
    - calibration within ±5 pp for both auctions × 80/90/95%.
  - **Store startup: 256–259 ms** (5 cold processes; budget < 1 s). One `decision_day` takes about 7 ms.
- **Real-data results, for Phase 3 to confirm:**

  | | EPEX 09:20 | N2EX 09:50 |
  |---|---|---|
  | n, lead window | 744, 16.5–39.5 h | 744, 14.5–37.5 h |
  | MAE / WAPE | 2,022 MW / 17.9% | 1,996 MW / 17.7% |
  | Bias | +1,746 MW | +1,728 MW |
  | P90 shortfall | 4,154 MW | 4,184 MW |
  | Calibration 80/90/95% | 77.7 / 87.0 / 92.6% | 78.5 / 87.2 / 92.3% |

  - Moving from EPEX to N2EX cuts MAE by **only 1.3%**.
  - Value of the forecast at 90% (EPEX): without a forecast you could bank 5,380 MW; with it, 9,523 MW on average, **+4,143 MW**.
  - Lead-curve MAE: 1,669 MW at 0.5 h → 1,859 MW at 16.5 h → 2,173 MW at 40.5 h → 2,405 MW at 48 h.
- **Decisions / doc changes:**
  - DATA §5.1: exact gap thresholds, verified.
  - DATA §5.6: population is `0 ≤ lead < 48`.
  - DATA §5.7: edge rules (out-of-range edges dropped, value on an edge → upper bin, first bin from 0 MW).
  - DATA §5.9: **`energy_error_pct = 100 × (forecast − actual) / forecast`**, positive = shortfall. The docs disagreed (the API example implied ÷ actual; UI_SPEC "−8% vs fc" and the narrative example imply ÷ forecast); resolved in favour of the forecast, which is what the desk planned on. API example updated (8.4 → 7.8).
  - DATA §5.10: runs without points in D are omitted.
  - DATA §5.12: population is the decision hours.
  - DATA §5.13: `hindsight` flag.
  - API.md: `buffers.method` = `conditional_lodo`.
- **Follow-ups (Phase 4):**
  - Expose a Trader-view summary (e.g. `summary_trader`) so the Trader view doesn't show outcome text. This is an additive API change; update API.md.
  - `/api/meta.forecast_runs.run_times_utc` = the nominal schedule.
  - The Accuracy `start`/`end` filter applies to the evaluated hours; LODO training still uses the full pool (document it in Methodology).

### 2026-10-26 — Phase 1: Data ingestion and snapshot ✅
- **Built:** `winddesk.ingest` with four parts.
  - `client.py`: async httpx; WINDFOR in daily publish chunks and FUELHH in 7-day settlement chunks; retries on 429/5xx/transport errors with 1/2/4/8 s backoff; at most 4 concurrent requests; User-Agent `WindDesk-pilot/1.0`; verbatim raw cache in `data/raw/` (gitignored); `--offline` and `--refresh`.
  - `normalize.py`: canonical tables, all timestamps `datetime64[ns, UTC]`, the DATA §3 dedupe rules, lead and window filters, nulls dropped and counted, nothing filled.
  - `validate.py`: 9 checks into `quality.json`.
  - `__main__.py`: CLI, deterministic parquet, `manifest.json` (snapshot id, per-file sha256, fetch params, row counts, sources). `created_at` is kept when the snapshot is unchanged.
  - Pulled forward from Phase 2: `analytics/pilot.py` (windows and auction presets) and `analytics/timeutil.py` (PLAN 2.1, which ingest's coverage check needs; the layering allows it).
- **Snapshot `ac22a4140bca`:** 272 runs / 14,847 forecast rows, 1,536 actuals (32 × 48), 115 KB of parquet. Fetching takes about 3 s.
- **Checks:**
  - `make check` ✅: **58 pytest** (ingest 95–100% lines, `timeutil` 97%, overall 95%), 11 Vitest, ruff, mypy and ESLint clean, build OK.
  - `make test-contract` ✅: **13 passed**.
  - `make ingest ARGS=--offline` reproduces `ac22a4140bca`, and the parquet, `manifest.json` and `quality.json` are byte-identical across rebuilds.
  - CI on GitHub: all 3 jobs green (run 40231780199) after pinning `setup-uv@v10.3.2`.
- **quality.json: one `warn`, documented and accepted.**
  - `run_times`: **on 15 Jan 2026 the 11:30 WINDFOR run was published at 12:25 UTC**. That day still has 8 runs, and the run has the normal 73-point window. It is kept as published; it is not a decision run for either auction.
  - Its 57 kept rows have leads of k + 35/60 h, so `lead_range` reports them as information. The invariant `lead_h ≥ 0` holds.
  - Every other check is `ok`: 8 runs on every publish day, 73 points in every run, no nulls, negatives or duplicates, all 1,536 settlement periods present, and **full 24 h decision coverage for EPEX and N2EX on all 31 delivery days**.
- **Verified facts written to DATA §1.2:**
  - The EPEX decision run is always D−1 07:30 (16.5–39.5 h); N2EX is always D−1 09:30 (14.5–37.5 h).
  - Every run spans (P−1) 21:00 to (P+2) 21:00, so kept leads run 0.5–66.5 h.
  - `publishDateTimeTo` is inclusive.
  - FUELHH has no revisions: 4 periods were published late, each appearing once.
- **Doc changes:**
  - DATA §1.2: verified facts.
  - DATA §4: pandas 3 parses to `us`, so convert through `as_utc` to `ns`.
  - **DATA §5.6: lead-curve bins use `floor(lead_h/bin_h)` labelled by midpoint, not exact lead values**, because of the late run.
  - DATA §6: real row counts.
  - API.md `/meta` example: real row counts, and `run_times_utc` = the nominal schedule.
  - pyproject: ruff allows `–`/`−` in strings (typographic copy).
- **Follow-ups for Phase 2:** have `ingest.validate`'s coverage check call `analytics.selection.select_decision_run` once it exists (today it carries a 5-line equivalent with a no-look-ahead filter); lead-curve binning per the new §5.6; `/api/meta` should report the nominal run times plus the off-schedule list.

### 2026-10-26 — Phase 0: Walking skeleton (local + Docker done; deploy pending)
- **Bootstrap:** ran `setup.sh` with `GIT_CONFIG_GLOBAL=/dev/null` so it **staged but did not commit** (the human wants to approve every commit). Repo folder: `e26ay/`.
- **Backend:** `pyproject.toml` (Python 3.12, hatchling `backend/winddesk`, runtime and dev deps, ruff/mypy/pytest/coverage config, `[tool.vercel]`), plus `uv.lock`. `winddesk/main.py` `create_app()` has `GET /api/health` (status, snapshot_id from `manifest.json` or `null`, git_sha, version; `Cache-Control: no-store`), `/api/docs` and `/api/openapi.json`, a JSON error envelope for HTTP errors, a JSON 404 for unknown `/api/*`, and `app.frontend("/", directory="frontend/dist", fallback="index.html")`, skipped with a warning when `dist` is missing. Settings use pydantic-settings (`WINDDESK_*`, `GIT_SHA`/`VERCEL_GIT_COMMIT_SHA`), with paths resolved against the repo root. Logging is one-line JSON. Imports inside the package are relative.
- **Frontend:** Vite 8 `react-ts` (ESLint variant), Tailwind 4.3, shadcn/ui (`radix` base, `nova` preset), IBM Plex Sans/Mono from Google Fonts, and the UI_SPEC §1 tokens in `src/styles/globals.css` (the only file with colour literals; light/dark; 14px base; tabular numbers; reduced motion). React Router 8 has 4 placeholder pages plus a 404. The AppShell has a tab nav (scrolls horizontally on mobile), theme toggle (localStorage in try/catch, OS preference on first visit, applied before paint), a data badge linking to Methodology, and a footer showing `/api/health` (version, short SHA, "API unavailable" on error). The typed `openapi-fetch` client and TanStack Query use `staleTime: Infinity`. `src/api/schema.d.ts` is generated by `make gen-api`.
- **Tooling:** Makefile with every ARCHITECTURE §7 target (plus `gen-api-check` and `help`), ESLint flat + Prettier (bans `any` and ad-hoc `toLocaleString`), Vitest + Testing Library, `.pre-commit-config.yaml`, multi-stage `Dockerfile` (non-root, `HEALTHCHECK`, `$PORT`), `.dockerignore`, `docker-compose.yml` (`app` + `dev` profile), `.github/workflows/ci.yml` (backend · frontend + API-types freshness · docker build + smoke test), and `vercel.json`.
- **Checks (2026-10-26, local, macOS arm64):**
  - `make check` ✅: ruff + ruff format + ESLint + Prettier clean; mypy clean (12 files); **pytest 6 passed** (overall coverage 86%; analytics is still empty, so its ≥ 90% gate starts in Phase 2); **Vitest 11 passed**; build OK.
  - JS bundle **127.5 KB gzipped** (budget < 450 KB); CSS 5.1 KB gzipped.
  - `docker compose up --build` ✅: container `healthy`. `/`, `/monitor` and `/methodology` return 200 HTML (`Accept: text/html`), `/api/health` returns 200 JSON with `git_sha` from the build arg, and `/api/nope` returns a 404 JSON envelope. `docker compose --profile dev config` is valid (dev containers not yet run).
  - Vercel import path simulated: `backend.winddesk.main` imported in a clean env (no installed package). `/api/health` and the deep-link fallback work, and no absolute `winddesk` imports appear.
  - Layout at a true 375 px viewport (Chrome DevTools emulation): page `scrollWidth` = 375 (no horizontal scroll); the tab bar scrolls internally. Light and dark themes checked visually.
- **Decisions / deviations (docs updated):**
  - FastAPI 0.162 has `app.frontend`, so the StaticFiles fallback was not needed. Its `index.html` fallback serves **navigation requests only** (`Accept: text/html`, extension-less path), and Vercel's CDN does the same, so curl checks need `-H 'Accept: text/html'`. Updated ARCHITECTURE §4 and PLAN 0.9.
  - `[tool.vercel.fastapi.static] exclude = true` was dropped: the SPA (~0.5 MB) stays in the function too, so the function answers exactly like Docker. Updated ARCHITECTURE §6.1.
  - Added an `openapi-typescript` → TS 6 peer `overrides` entry (it declares `typescript@^5`; generation verified). Added `httpx2` as a dev dependency because the Starlette 1.x TestClient requires it. The compose dev image uses the `trixie-slim` uv tag because no bookworm tag exists. Updated ARCHITECTURE §4, §5 and §6.2.
  - ruff excludes `docs/` (ruff now formats code blocks inside Markdown).
  - Small additions beyond the plan, each to make the skeleton correct: an error envelope and a JSON 404 for unknown `/api/*` (otherwise they'd return SPA HTML), and a test that the package version matches `pyproject.toml`.
- **Follow-ups:** verify the Vercel deploy (bundle size in the build log, snapshot present via `/api/health` once Phase 1 commits one); confirm CI is green on the first push; exercise the `dev` compose profile once.

## Decisions not covered by an ADR
- Version lives in both `pyproject.toml` and `winddesk/__init__.py` (a test keeps them equal), so `/api/health` doesn't depend on the package being installed (Vercel imports from source).
- `.cache/` (gitignored) holds the exported `openapi.json` used by `make gen-api`.

## Ideas backlog (not in scope; do not build without approval)
- _(none yet)_
