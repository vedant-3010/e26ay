# WindDesk — Progress log

Claude Code updates this file at the end of every phase (and whenever something important changes). Read it at the start of every session.

## Status

| Phase | Status | Time used | Notes |
|---|---|---|---|
| 0 Walking skeleton | 🟨 in progress | ~1.1 h | Local, Docker and CI green. Only remaining DoD item: 👤 Vercel import + production URL checks |
| 1 Data snapshot | ✅ done | ~1.0 h | Snapshot `ac22a4140bca`; 13 contract tests pass; started while Phase 0 waits on Vercel (human said continue) |
| 2 Analytics core | ✅ done | ~1.25 h | 99.5% analytics coverage; store loads in ~257 ms; calibration within ±5 pp |
| 3 Notebook + insights | ✅ done | ~0.75 h | Notebook executed with outputs; `INSIGHTS.md` written by it; alignment check changes nothing |
| 4 API | ✅ done | ~1.0 h | 5 endpoints; 54 API tests + 15 API contract tests; cold ≤ 36 ms, warm ≈ 1 ms |
| 5 Frontend + Monitor | ✅ done | ~1.5 h | All PRD F2 ACs pass; 366 KB gz JS total (129 KB shell); no overflow at 375 px |
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
1. **Approve Vercel team access for the connector** (one click, link in the chat; it expires after 10 minutes and a new one can be made any time). Then Claude Code creates the Vercel project from `vedant-3010/e26ay` and runs the Phase 0 production checks itself. The alternative is to import the repo at vercel.com/new.
2. Commits are approved by the human one batch at a time (standing instruction). Pushing is the human's call.

## Decisions taken by Claude Code (the human asked for this on 2026-10-26)
- **Pitch framing of the over-forecast:** "a structural gap between the two Elexon datasets that we quantify and buffer against, worth confirming with your data team", not "the forecast is bad".
- **Story-day order for Part 1:** open on **Tue 27 Jan** (the buffer did its job), then **Wed 28 Jan** as the honest limit, with Sat 17 Jan available as the typical day. Applied in Phase 8 when filling `DEMO_SCRIPT.md`.
- **Default buffer method:** conditional (level-based) LODO, per PRD F4 "Should". The flat-buffer trade-off (−633 MW held back, −1.6 pp coverage at 90%) is stated on the Methodology page.
- **Deployment:** use the human's connected Vercel account (Hobby, `vedant-3010`) to create the project, because the brief requires a Vercel/Heroku deployment and the repo is already public.

## Log
<!-- Newest first. One entry per phase or significant event. -->

### 2026-10-26 — Phase 5: Frontend foundation and Forecast Monitor ✅
- **Built:**
  - API layer: `api/client.ts` exports typed payloads and `ApiError`, which carries the envelope message. `api/queries.ts` has `useMeta`/`useMonitor`/`useDecision`/`useAccuracy` with `staleTime: Infinity` and `keepPreviousData`, and never retries a 422.
  - `lib/format.ts`: MW/GW/GWh/%/h formatting, with a real minus sign and `—` for missing values.
  - `lib/time.ts`: UK formatting through `Intl` in Europe/London, and UK wall-clock ↔ UTC conversion that is correct across BST and clock changes.
  - `lib/urlState.ts`: typed URL state; defaults are left out of links.
  - `lib/csv.ts` (RFC 4180) and `lib/glossary.ts` (InfoTip copy from the PRD).
  - Charts:
    - `charts/echarts.ts`: modular registration; ECharts' `use` is aliased so the hooks lint rule doesn't mistake it for React's.
    - `EChart.tsx`: init/dispose, ResizeObserver, `aria-label`.
    - `theme.ts`: CSS tokens read at runtime; follows the theme switch.
    - `monitorOption.ts`: a pure option builder.
  - Components: `InfoTip` (a popover, so it works by tap and keyboard), `ErrorState`/`EmptyState`/`LoadingBar`, `KpiCard`, `MetricsStrip`, `SegmentedControl` (a real radiogroup), `HorizonSlider` (0–48 h in 0.5 h steps, tick labels, the "15–40 h" hint, a 150 ms timer debounce, and the thumb's aria label and value text), and `DateTimeRange` (native `datetime-local` in UK time, presets, inline validation).
  - **Monitor page:** URL state (`start`, `end`, `horizon`), with defaults and bounds taken from `/api/meta` so they are not duplicated in the frontend. Metrics strip, coverage indicator with explanation, CSV download, chart, skeleton and error states; while refetching, the previous render stays visible at 60% opacity with a top progress bar. Pages are lazy-loaded.
- **Dataviz pass** (the dataviz skill's method was applied):
  - Palette validated with its script. Light passes as specified. **Dark-mode tokens changed** to `#3B82F6 / #16A34A / #D97706 / #64748B`, because the UI_SPEC pastels failed the dark lightness band (UI_SPEC §1 updated with the evidence).
  - No dual axes: the Monitor is two grids on a shared time axis. Phase 7's "buffer by level" is redesigned in UI_SPEC §4 to avoid the second axis.
  - Charts have a legend for two or more series, 2 px lines, a solid hairline grid and crosshair, one tooltip with every value at that time (values lead, labels follow, line keys), and text in text tokens.
- **PRD F2 acceptance criteria:**
  - [x] 1. Start/end pickers are bounded by `/api/meta`, default 2–9 Jan, max span 35 days (the data spans 32), validated before any request.
  - [x] 2. Horizon slider 0–48 h, 0.5 h steps, default 24 h; latest forecast ≥ H before each hour (API, contract-tested in Phase 4).
  - [x] 3. Actual (blue, half-hourly) and forecast (green, hourly) with zoom/pan, plus a synchronised error panel (shortfall amber, surplus slate).
  - [x] 4. Tooltip: UK time, actual, forecast, signed error with shortfall/surplus, the run's publish time, and the exact lead.
  - [x] 5. Metrics strip: n, MAE, RMSE, bias, P90 |error|, P90 shortfall, WAPE.
  - [x] 6. Coverage indicator ("Forecast available for 87.5% of hours" at 46 h), with an explanation below 100%.
  - F6 (Should): URL state for the whole view and CSV download.
- **Checks:**
  - `make check` ✅: 293 pytest (99.66% analytics coverage), **49 Vitest** (format, time incl. BST, URL state, CSV, option builder, CSV export and range rules, slider debounce, Monitor page flows, app shell), lint and types clean.
  - **JS 366 KB gzipped in total** (budget 450): shell 129 KB, Monitor + ECharts 236 KB.
  - Real browser (Chrome via DevTools protocol, served by FastAPI from `frontend/dist`): checked at 1280 px light/dark and at a true 375 px; `scrollWidth` equals the viewport (no horizontal scroll); no console errors; screenshots reviewed. Five fixes followed: axis names vs legend overlap, tick wrapping, half-hour tooltip context, solid crosshair, label ids.
- **Notes:**
  - Native date-time inputs follow the browser locale (UK users see `02/01/2026, 00:00`).
  - ECharts ticks use UTC boundaries with UK labels (equal in January); `lib/time` handles BST everywhere else.
  - The Vercel deploy is still pending team-access approval.

### 2026-10-26 — Phase 4: API ✅
- **Built:**
  - `api/schemas.py`: every API.md model, with field descriptions and examples; floats rounded to 1 decimal by an annotated validator; UTC serialised with `Z`.
  - `services/{meta,monitor,decision,accuracy}.py`: one function per endpoint, `lru_cache`d on (store, normalised primitive params). Each builds the response model; routers contain no pandas.
  - `api/deps.py`: validated, normalised query objects and `store_dep`, which tests override with the synthetic store.
  - `api/caching.py`: ETag = `"{snapshot_id}-{sha256(query)[:16]}"`, `Cache-Control`, `X-Snapshot-Id`, 304 handling `W/`, lists and `*`. No middleware, so the CDN promotion of the SPA is kept.
  - `api/errors.py`: one envelope for 404, 405, 422 (FastAPI's and ours) and 500 (`internal_error`, no internals).
  - Routers: `/api/meta`, `/api/monitor`, `/api/decision`, `/api/accuracy` (plus the existing `/api/health`). The nominal run schedule now lives in `analytics.pilot`, shared by ingest and meta.
- **Tests:**
  - 54 API tests on a synthetic store with hand-derived values: a happy path and a 422 set per endpoint, ETag stability and normalisation, 304, the envelope shape, a 500 that hides internals, and OpenAPI listing every path.
  - 15 API contract tests on the real snapshot:
    - **no look-ahead through the API for 31 days × 5 cutoffs** (EPEX, N2EX, 00:00, 10:45, 23:45): run ≤ cutoff, the decision vintage equals the forecast shown, `after_cutoff` flags are exact;
    - the expected decision runs and lead windows for every day;
    - the real `/meta` figures;
    - warm < 100 ms for 8 URLs.
- **Checks:**
  - `make check` ✅: **293 pytest**, analytics coverage 99.66%, mypy strict clean (36 files), 11 Vitest, build OK.
  - `make test-contract` ✅: **143**.
  - `make gen-api` regenerated `frontend/src/api/schema.d.ts` (1,071 lines, 5 paths).
  - Timing over HTTP (uvicorn, 5 warm runs each): cold 1.7–36 ms, warm 0.5–1.3 ms. Table in API.md.
- **Doc changes:**
  - API.md:
    - `bounds.target_to` is **exclusive** (2026-02-02T00:00Z; Monitor `end` ≤ it; window `[start, end)`);
    - `/meta` adds `forecast_runs.off_schedule` and `quality.summary` (for the Methodology data-quality table);
    - `/decision` adds `summary_trader` (so the Trader view never shows outcome text) plus `buffers.simple_buffer_mw` and `bins[].fallback`; the cutoff is ignored for presets;
    - `/accuracy` filters the lead curve by date range, and the range selects the evaluated days while LODO still trains on all pilot days;
    - parameters are normalised for cache and ETag; the 35-day Monitor limit exceeds the 32-day data range;
    - a measured-performance table.
  - ARCHITECTURE layer table: services build the `api.schemas` DTOs.
- **Vercel:** the connected Vercel account is the human's own (`vedant-3010`, Hobby; GitHub integration covers `vedant-3010`). Project access needs a one-time team-scope approval, which is pending (see "Waiting on the human").

### 2026-10-26 — Phase 3: Analysis notebook and insights ✅
- **Built:** `notebooks/01_wind_forecast_accuracy.ipynb`, with 11 sections following DATA §8. Each opens with a **Question** and closes with an **Answer** cell generated from the computed values, so the prose can't drift from the numbers. It imports `winddesk.analytics` and `winddesk.store` only; no logic is re-implemented. Static matplotlib figures (11) use the app's semantic colours. It is committed executed (875 KB; no errors or stderr in outputs; nbformat-valid; no local paths). Section 11 writes `docs/INSIGHTS.md`.
  - Added `analytics.selection.hourly_mean_actuals` (+2 tests) for the alignment sensitivity check.
  - Notebooks are ruff-formatted; `E501` is ignored for notebooks only (long prose f-strings), with a justification comment in pyproject.
- **Checks:**
  - `make notebook` ✅ (about 16 s).
  - `make check` ✅: 244 pytest, 99.48% analytics coverage, 11 Vitest.
  - `make test-contract` ✅: 128.
- **Headline numbers:** see `docs/INSIGHTS.md`.
  - EPEX: MAE 2,022 MW, WAPE 17.9%, bias +1,746 MW, P90 shortfall 4,154 MW, P90 achieved 87.0%.
  - N2EX lowers MAE by only 1.3%.
  - Lead-curve MAE: 1,667 / 1,740 / 1,949 / 2,078 / 2,405 MW at 1.5 / 12.5 / 24.5 / 36.5 / 47.5 h.
  - Value of the forecast @90%: 5,380 → 9,523 MW (+4,143 MW).
  - Coverage is 100% up to 43.5 h ahead, and 79.2% at 48 h.
- **Story days** (rules written in the notebook, §9):
  1. Worst miss: **Wed 28 Jan** (MAE 5,329 MW; 267 → 138 GWh; firm held 0/24; later runs saw it coming).
  2. Typical: **Sat 17 Jan** (MAE 1,659 MW; firm held 21/24).
  3. Buffer did its job: **Tue 27 Jan** (windy, 17% shortfall, firm held 23/24).
- **3.5 alignment sensitivity:** using the hourly mean instead of the period starting at H changes EPEX MAE by +16 MW (+0.8%), and bias and calibration barely move. **No headline conclusion changes**: the notebook re-evaluates "bias > +1 GW", "N2EX not materially better", and "bands within ±5 pp" under both alignments.
- **Findings recorded:**
  - **Structural over-forecast:** +1,455 MW bias even 0.5 h ahead; wind below forecast in 85% of decision hours; actual ≈ 737 + 0.81 × forecast (r = 0.93); bias +371 → +3,458 MW from the lowest to the highest forecast quintile. Elexon's OpenAPI descriptions (checked 2026-10-26) only say "generation outturn … average MW over 30 minutes" (FUELHH) and "wind generation forecast data" (WINDFOR); nothing about constraints or embedded wind. So it is stated as a **hypothesis** (curtailment or a scope difference), consistent with PRD assumption 5 still being open.
  - **Buffer method trade-off at 90% (EPEX):** conditional LODO holds back 3,509 MW on average for 87.0% coverage; a flat LODO buffer holds back 4,142 MW for 88.6%. Both are within ±5 pp. The app keeps conditional (PRD F4 "Should"); the trade-off goes on the Methodology page.
- **Follow-ups:** Methodology page (Phase 7) states the over-forecast finding, the buffer trade-off and the off-schedule run; DEMO script numbers come from `INSIGHTS.md` (Phase 8).

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
- **Bias-corrected forecast view:** a LODO linear recalibration (actual ≈ a + b·forecast) would remove most of the +1.7 GW level offset. Show it as an optional "corrected" line, clearly labelled. It needs PRD scope approval.
- **Buffer method toggle** (flat vs conditional) in the Accuracy Lab, given the coverage/MW trade-off found in Phase 3.
