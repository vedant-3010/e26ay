---
name: verify
description: Run the full WindDesk quality gate and invariant checks, and report a pass/fail table
disable-model-invocation: true
---

Run the full quality gate and report honestly. Do not fix anything unless the human asks; just report.

1. `make check` (lint, format check, mypy, pytest without the snapshot marker, vitest, frontend build). Capture the pass/fail result, test counts and analytics coverage.
2. `make test-contract` (real-snapshot contract tests, including no look-ahead across every delivery day × auction preset).
3. Check the generated API types are fresh: `make gen-api` then `git diff --exit-code frontend/src/api/schema.d.ts`.
4. Docker: `docker build -t winddesk:verify .`, run it on a free port, and `curl` `/`, `/monitor` and `/api/health`. Stop the container afterwards.
5. If a production URL is recorded in `docs/PROGRESS.md`, `curl` the same three paths there and time `/api/decision?delivery_date=2026-01-15` (5 warm runs, `-w '%{time_total}'`).
6. JS bundle size: report the gzipped total from the build output (budget < 450 KB).
7. Check `git status` is clean; list any untracked files that look like they should be committed or ignored.

Report as a table: check | result | detail. End with a single line: **READY** or **NOT READY**, and why.
