# ADR-0003: Pure pandas analytics core shared by API and notebook

- Status: Accepted
- Date: 2026-10-25

## Context
The value of the product is the correctness of its numbers. The same calculations feed the web app, the analysis notebook and the pitch.

## Decision
All domain logic lives in `winddesk/analytics/` as pure functions (DataFrames in, DataFrames or dataclasses out, no I/O, no FastAPI). Services orchestrate and cache. Routers only translate HTTP. The notebook imports the same functions.

## Consequences
- ✅ One source of truth; unit tests with hand-computed fixtures; easy review.
- ✅ The analytics can be reused in a batch job or another UI.
- ⚠️ Slightly more files than putting logic in routes. That's worth it for reviewability.
