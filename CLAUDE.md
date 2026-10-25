# WindDesk — instructions for Claude Code

## What we're building
**WindDesk** is a pilot web app for a UK electricity supplier's day-ahead trading desk. For every purchase decision made in **January 2026** it answers:
1. **What did the latest national wind forecast say at the moment we had to commit?** (auction gate closure on D−1)
2. **How wrong do those forecasts tend to be at that lead time, and how much wind can we bank on?** (MAE, P90 buffers, firm wind)

Data: Elexon BMRS **FUELHH** (actual, `fuelType=WIND`) and **WINDFOR** (forecast runs), and nothing else.
Stack: React + TypeScript (Vite) · Python FastAPI · pandas · Docker · Vercel.
The audience is a client pitch plus a tech-lead review, so correctness, clarity and polish all matter.

## Source of truth: read before coding

| Doc | Read when |
|---|---|
| `docs/PROGRESS.md` | **Start of every session.** Where we are, what's blocked. |
| `docs/PLAN.md` | Always. Phases, tasks, Definition of Done. |
| `docs/PRD.md` | Any user-facing feature (scope, acceptance criteria, MoSCoW). |
| `docs/DATA_AND_ANALYTICS.md` | Ingest, analytics, metrics, analytics tests. |
| `docs/API.md` | Any endpoint or client code. |
| `docs/ARCHITECTURE.md` | Structure, tooling, deploy, Makefile. |
| `docs/UI_SPEC.md` | Any frontend work. |
| `docs/adr/` | Before changing an architectural decision. |

On conflicts: scope → PRD wins; technical details → DATA_AND_ANALYTICS > API > ARCHITECTURE > UI_SPEC. Log the conflict and its resolution in `PROGRESS.md`.

## Working rules
1. **One phase at a time** (`/phase N`). Don't start phase N+1 until N's DoD passes.
2. **Small loops:** implement, run the relevant checks, then commit. Use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
3. **Never claim something is done without running the checks.** Record the results in `PROGRESS.md`.
4. **Scope discipline:** Must before Should before Could. Anything not in the PRD goes to the "Ideas backlog" in `PROGRESS.md`, not into the code.
5. **Docs are living.** When a doc turns out to be wrong (API shape, library API, Vercel behaviour), verify the real behaviour, fix the code, update the doc, and log it.
6. **Ask the human only for** account actions (GitHub, Vercel, secrets) or scope-changing decisions. Otherwise make the reasonable call and log it.
7. **Readable over clever.** A reviewer must be able to follow every analytic step. Docstrings state units and invariants.
8. When unsure how a library or platform behaves now (FastAPI `app.frontend`, Vercel Python, Tailwind v4, shadcn CLI), check its current docs before guessing.

## Domain invariants (never break, all tested)
- **No look-ahead:** a forecast may be used for a decision only if `publish_time ≤ decision cutoff`.
- **Time:** store and compute in **UTC, tz-aware**. Delivery days, cutoffs and display use **Europe/London**. Never use naive datetimes.
- **Error sign:** `error_mw = forecast_mw − actual_mw`. Positive = over-forecast = **shortfall**.
- **Lead time:** `lead_h = (target_time − publish_time)` in hours. Rows with `lead_h < 0` are dropped.
- **Alignment:** hourly forecast at H is compared with the settlement period starting at H (ADR-0004).
- **Gaps stay gaps:** never interpolate, fill, or substitute another forecast run silently.
- **Units in names and labels:** `_mw`, `_mwh`, `_h`. Every number shown in the UI has a unit.
- **Pilot scope:** delivery days 2026-01-02 … 2026-02-01; targets from 2026-01-01.

## Commands (all via Makefile, created in Phase 0)
`make setup` · `make dev` · `make ingest` · `make test` · `make test-contract` · `make lint` · `make typecheck` · `make gen-api` · `make build` · `make notebook` · `make docker-up` · **`make check`** (the gate: lint + types + tests + build)

## Conventions
- **Python 3.12, uv.** `ruff` lint+format; `mypy --strict` on `analytics`, `services`, `api`. Pydantic v2 for all API I/O. **Relative imports inside `backend/winddesk`.** Analytics functions are pure (no I/O, no FastAPI imports).
- **TypeScript strict, no `any`.** API types are **generated** (`make gen-api`); never hand-write them. TanStack Query for server state; URL search params for view state. All formatting goes through `lib/format.ts` / `lib/time.ts`.
- **Tests:** every analytics function has tests with hand-computed expected values. Each endpoint has a happy-path test and a 422 test.
- **Styling:** semantic color tokens from UI_SPEC §1 only (actual = blue, forecast = green, shortfall = amber). No ad-hoc hex values in components.

## Don't
- Add a database, auth, extra datasets, analytics SDKs, or paid services.
- Call Elexon at request time (except the optional Phase 9 live mode behind a flag).
- Add a `requirements.txt` (one manifest: `pyproject.toml` + `uv.lock`).
- Commit secrets, `.env`, `node_modules`, `data/raw/`, or build output.
- Silence lint or type errors without a justification comment.
- Use LLM-generated text in the product. Narrative text comes from tested templates.
