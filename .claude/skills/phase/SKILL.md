---
name: phase
description: Execute one phase of docs/PLAN.md end to end, ending with its Definition of Done verified and PROGRESS.md updated
argument-hint: <phase-number>
disable-model-invocation: true
---

Execute **Phase $ARGUMENTS** of `docs/PLAN.md`.

1. **Orient.** Read `CLAUDE.md`, `docs/PROGRESS.md`, and the Phase $ARGUMENTS section of `docs/PLAN.md`. Then read every doc section that phase references; read them in full, not skimmed.
2. **Check prerequisites.** Confirm earlier phases are ✅ in `PROGRESS.md`, and run `make check` if the Makefile exists. If an earlier DoD is not met, stop and report what's missing instead of building on top of it.
3. **Plan.** Create a task list from the phase's checklist items. Mark 👤 items as waiting on the human, ask for them in one clear message, and carry on with the rest.
4. **Build in small loops.** For each item: implement, run the narrowest relevant check (a single test file, `tsc`, `ruff`), fix, then commit with a Conventional Commit message. Keep commits focused.
5. **Respect the invariants** in `CLAUDE.md` (no look-ahead, UTC/Europe/London, error sign, gaps stay gaps). If the docs are wrong about real behaviour (an API shape, a library API, a platform quirk), verify it, fix the code, update the doc, and note it.
6. **Verify the DoD.** Run every DoD check for the phase, plus `make check`. Everything must pass. Do not mark the phase done on partial passes.
7. **Update `docs/PROGRESS.md`:** status row (✅ and time used), a log entry (done items, check results with numbers, deviations and which docs changed, follow-ups), and anything waiting on the human.
8. **Report back** in under 15 lines: what was built, the check results, how the human can see it (a command or URL), any cuts or deviations, and the next phase.

If the phase overruns its time box, cut **Should** items before **Must** items, and list exactly what was cut.
