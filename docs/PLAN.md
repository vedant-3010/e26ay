# WindDesk — Build Plan

Execute phases **in order**, one per `/phase N` run. Each phase ends with its **Definition of Done (DoD)** passing and `docs/PROGRESS.md` updated. 👤 marks steps that need the human (accounts, approvals); ask for them clearly and continue with whatever else you can do meanwhile.

**Time budget: about 14.5 h of build plus about 1 h for the video, under the 16 h cap.** Time boxes are ceilings. If a phase overruns, cut **Should** items (PRD §5) before **Must** items, and log the cut.

| Phase | Outcome | Box |
|---|---|---|
| 0 | Walking skeleton deployed (Docker + Vercel), tooling and CI | 1.25 h |
| 1 | Validated data snapshot committed | 1.5 h |
| 2 | Analytics core, fully tested | 2 h |
| 3 | Analysis notebook + `INSIGHTS.md` | 1 h |
| 4 | API per contract, tested; TS types generated | 1.25 h |
| 5 | Frontend foundation + Forecast Monitor | 2 h |
| 6 | Decision Desk | 2 h |
| 7 | Accuracy Lab + Methodology | 2 h |
| 8 | Polish, README, release | 1.5 h |
| 9 | Stretch (only if time remains) | — |

---

## Phase 0 — Walking skeleton (deploy first, de-risk early)

**Goal:** a trivial version of the final topology works locally, in Docker and on Vercel *before* any feature work.

- [x] 0.1 Read `CLAUDE.md` and every file in `docs/`. Start the `PROGRESS.md` log.
- [x] 0.2 Python project at the repo root (`pyproject.toml`, name `winddesk`, `requires-python = ">=3.12,<3.13"`, hatchling packages `backend/winddesk`).
  - Runtime deps: `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `pandas`, `numpy`, `pyarrow`, `httpx`.
  - `[dependency-groups] dev`: `pytest`, `pytest-cov`, `ruff`, `mypy`, `pandas-stubs`, `jupyter`, `nbconvert`, `matplotlib`, `pre-commit`.
  - Run `uv lock` and commit `uv.lock`. Do **not** create `requirements.txt`.
- [x] 0.3 `backend/winddesk/main.py`: `create_app()` with `GET /api/health`. Serve the SPA via `app.frontend("/", directory="frontend/dist", fallback="index.html")`, falling back to StaticFiles + catch-all if unavailable (ARCHITECTURE §4). If `frontend/dist` is missing in dev, log and skip. Use **relative imports** inside `winddesk`.
- [x] 0.4 Frontend in `frontend/`: Vite `react-ts`, Tailwind v4, shadcn/ui (use non-interactive flags), IBM Plex fonts, tokens from UI_SPEC §1, React Router with 4 placeholder pages, the AppShell, and a footer that shows `/api/health` (version + snapshot). Vite proxy `/api` → `http://localhost:8000`.
- [x] 0.5 Tooling: ruff/mypy/pytest config in `pyproject.toml`; ESLint (flat) + Prettier; Vitest; `.pre-commit-config.yaml`; `.editorconfig`. Create the `Makefile` with every target in ARCHITECTURE §7.
- [x] 0.6 `Dockerfile` (multi-stage), `.dockerignore`, `docker-compose.yml` (`app` + `dev` profile). Verify `docker compose up --build` serves the SPA and `/api/health` on :8000.
- [x] 0.7 `.github/workflows/ci.yml`: backend, frontend and docker-build jobs.
- [x] 0.8 Vercel config per ARCHITECTURE §6.1 (`[tool.vercel]` in pyproject, `vercel.json`).
- [ ] 0.9 👤 Ask the human to:
  - (a) create a **public GitHub repo with the random name** from `setup.sh` and push;
  - (b) import it into Vercel (Hobby);
  - (c) share the production URL and, if the build fails, the build log.
  
  Then verify **in a cold/incognito context** (`curl` is fine, with `-H 'Accept: text/html'` for the SPA paths, see ARCHITECTURE §4): `/` returns the SPA, `/monitor` returns the SPA (deep link), and `/api/health` returns JSON. Iterate with the fallback shim if needed. Record exactly what worked in `PROGRESS.md` and fix ARCHITECTURE §6.1 to match.

**DoD:** `make check` is green · `docker compose up` works · the production URL passes the 3 checks · CI is green.

---

## Phase 1 — Data ingestion and snapshot

- [x] 1.1 `ingest/client.py`: httpx client, daily chunks, retries/backoff, concurrency 4, raw cache (DATA §3).
- [x] 1.2 `ingest/normalize.py`: canonical tables (DATA §4), tz-aware UTC, dedupe rules, lead filter.
- [x] 1.3 `ingest/validate.py`: every check in DATA §3 step 6, written to `quality.json`.
- [x] 1.4 `ingest/__main__.py`: CLI `--start --end --offline --refresh`; writes parquet + `manifest.json`. Add `make ingest`.
- [x] 1.5 Run the full ingest (DATA §2 windows). Read `quality.json` carefully. Any `warn` gets a note in `PROGRESS.md`.
- [x] 1.6 Contract tests (`tests/contract/`, marker `snapshot`) per DATA §7 item 14.
- [x] 1.7 Update DATA §1.2 with **verified** facts for the whole window (runs/day, run times, rows/run, lead range). Correct anything that differed from the sampled days.
- [x] 1.8 Commit `data/snapshot/*` (check `data/raw/` is gitignored).

**DoD:** `make ingest` is reproducible (`--offline` rebuild gives an identical `snapshot_id`) · contract tests pass · snapshot committed.

---

## Phase 2 — Analytics core

- [x] 2.1 `analytics/timeutil.py`: `LONDON`, `decision_cutoff_utc`, `delivery_day_targets`, `to_uk_label`.
- [x] 2.2 `analytics/selection.py`: `select_at_horizon`, `select_decision_run`, `vintages_for_day`.
- [x] 2.3 `analytics/metrics.py`: `compute_metrics(pairs) -> Metrics` dataclass.
- [x] 2.4 `analytics/buffers.py`: simple + conditional LODO buffers, `firm_wind`, `calibration`.
- [x] 2.5 `analytics/accuracy.py`: lead curve, distribution, by hour, by level, daily, worst, auction comparison, forecast value.
- [x] 2.6 `analytics/decision.py`: assemble one day's result (run, points, firm, KPIs, energy).
- [x] 2.7 `analytics/narrative.py`: `decision_summary`, `accuracy_takeaways`.
- [x] 2.8 `store.py`: load the snapshot, build `pairs`, decision pools (epex/n2ex), calibration grid, lead curves. Log the startup time.
- [x] 2.9 Tests for every case in DATA §7 (synthetic fixture with hand-computed values in comments).

**DoD:** `pytest -m "not snapshot"` passes with ≥ 90% line coverage on `winddesk/analytics` · mypy strict is clean · store startup < 1 s locally.

---

## Phase 3 — Analysis notebook and insights

- [x] 3.1 `notebooks/01_wind_forecast_accuracy.ipynb` following DATA §8. Import `winddesk.analytics` and do not reimplement logic. Each section opens with a markdown "question" cell and closes with a one-line "answer" cell.
- [x] 3.2 Execute in place (`make notebook`) and commit with outputs.
- [x] 3.3 Write `docs/INSIGHTS.md` using the template below. Use real numbers from the notebook only.
- [x] 3.4 Pick 3 **story days** for the demo: the worst miss, a typical day, and a high-wind day where the buffer did its job.
- [x] 3.5 If the alignment sensitivity changes any headline conclusion, log it and tell the human.

`docs/INSIGHTS.md` template:
```markdown
# Pilot insights — decisions made in January 2026
| Metric (decision forecasts) | EPEX 09:20 | N2EX 09:50 |
|---|---|---|
| MAE (MW) / WAPE (%) | | |
| Bias (MW, + = over-forecast) | | |
| P90 buffer (MW) | | |
| P90 firm-wind achieved coverage (%) | | |
Lead curve MAE (MW): 1.5 h … · 12.5 h … · 24.5 h … · 36.5 h … · 47.5 h …
Value of the forecast @90%: no-forecast firm … MW → forecast firm … MW (+… MW)
Story days: 1) … 2) … 3) …
Three pitch sentences: …
```

**DoD:** the notebook renders on GitHub with outputs · `INSIGHTS.md` is complete.

---

## Phase 4 — API

- [x] 4.1 `api/schemas.py`: every model in API.md (Pydantic v2, field descriptions, examples).
- [x] 4.2 `services/*`: one function per endpoint, `lru_cache` on normalized primitive params.
- [x] 4.3 Routers, `deps.py` (param validation and normalization), `errors.py` (error envelope), `caching.py` (ETag, Cache-Control, 304, `X-Snapshot-Id`).
- [x] 4.4 Tests: happy path + 422 per endpoint; 304 on a matching `If-None-Match`; **no look-ahead through the API** (decision `run.publish_time ≤ cutoff.utc` for every in-scope day × preset, marker `snapshot`).
- [x] 4.5 `make gen-api`: export `app.openapi()` and run `openapi-typescript` to produce `frontend/src/api/schema.d.ts`. Add the CI freshness check.
- [x] 4.6 Time each endpoint locally (warm). Each must be < 100 ms.

**DoD:** OpenAPI docs render at `/api/docs` · all API tests pass · types generated and committed.

---

## Phase 5 — Frontend foundation and Forecast Monitor

- [ ] 5.1 `api/client.ts` (openapi-fetch) and `api/queries.ts` (TanStack hooks; `staleTime: Infinity`, `keepPreviousData`).
- [ ] 5.2 `lib/format.ts`, `lib/time.ts`, `lib/urlState.ts`, `lib/csv.ts`, with Vitest tests.
- [ ] 5.3 `components/charts/EChart.tsx` wrapper + `theme.ts` (light/dark, tokens). Use modular ECharts imports.
- [ ] 5.4 Shared components: KpiCard, MetricsStrip, InfoTip, Skeleton, ErrorState, EmptyState, ThemeToggle.
- [ ] 5.5 Controls: DateRangePicker (bounded by meta), HorizonSlider (debounced).
- [ ] 5.6 **Monitor page** per UI_SPEC §3.2 and PRD F2 (all ACs), including coverage and CSV.

**DoD:** PRD F2 ACs all pass (check them off in `PROGRESS.md`) · `npm run build` < 450 KB gzipped JS · works at 375px width.

---

## Phase 6 — Decision Desk

- [ ] 6.1 Controls: DeliveryDatePicker (◀ ▶ + keyboard), AuctionSelector (with custom time), ConfidenceSelect, View toggle.
- [ ] 6.2 Context strip, KPI cards (Trader view vs Hindsight), summary paragraph.
- [ ] 6.3 Main chart: forecast, firm band, actual, shortfall highlight.
- [ ] 6.4 Vintages chart with decision/after-cutoff styling.
- [ ] 6.5 Partial-coverage banner; deep-link support (`/?date=2026-01-21&auction=n2ex&conf=0.9&view=hindsight`).

**DoD:** PRD F1 ACs 1–9 pass · a story day from `INSIGHTS.md` looks right in both views.

---

## Phase 7 — Accuracy Lab and Methodology

- [ ] 7.1 Controls (population, range, confidence) + takeaways + headline strip.
- [ ] 7.2 Must charts: A (lead curve) and B (distribution).
- [ ] 7.3 Should, in pitch-value order: G value of forecast → F auction timing → C buffer by level (+ calibration) → E daily (click → Desk) → H worst table (click → Desk) → D by hour.
- [ ] 7.4 Methodology page per UI_SPEC §3.4, including the SVG timeline and the data-quality table.

**DoD:** PRD F3 Must ACs pass and every built Should AC passes · F5 is complete.

---

## Phase 8 — Polish, README, release

- [ ] 8.1 UX pass against UI_SPEC §5–7: copy, units, states, keyboard, reduced motion, 375px.
- [ ] 8.2 Performance: bundle size and API timings on the production URL (`curl -w '%{time_total}'`, warm, 5 runs each). Record in `PROGRESS.md`.
- [ ] 8.3 **README.md** containing:
  - name, one-liner, **live link**, video link placeholder
  - screenshot(s)
  - what it does (3 bullets)
  - **how to start** (Docker one-liner; local dev via `make setup && make dev`; `make ingest` to rebuild data)
  - **files and directories** (a table covering every top-level path and the key subfolders)
  - architecture summary with the Mermaid diagram and links to `docs/`
  - methodology summary and key definitions
  - testing and quality gates
  - deployment
  - **AI tools used**: state explicitly that Claude Code (Anthropic) was used for planning documents and implementation under human direction and review, and say what was reviewed or verified by hand
  - limitations and next steps
- [ ] 8.4 Fill the numbers in `docs/DEMO_SCRIPT.md` from `INSIGHTS.md`.
- [ ] 8.5 Final deploy. 👤 Human verifies in incognito: the app URL, the repo URL (public), and the README renders.
- [ ] 8.6 Tag `v1.0.0`, and make sure CI is green on the tag.

**DoD:** the release checklist in PRD §9 is complete, apart from the human-only video and form steps.

---

## Phase 9 — Stretch (only with time left; in this order)
1. F7 procurement what-if (client-side only).
2. Playwright smoke test (load each page, change one control, assert the chart renders).
3. F8 live mode behind a flag.
4. Heroku deploy via `heroku.yml`.

---

## Human-only steps (after Phase 8)
1. Record the video following `docs/DEMO_SCRIPT.md` (≤ 10 min). Upload to YouTube as **Unlisted**.
2. Add the video link to the README and push.
3. Open every URL in incognito: app, repo, video.
4. Submit the form.
