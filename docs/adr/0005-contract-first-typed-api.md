# ADR-0005: Contract-first API with generated TypeScript types

- Status: Accepted
- Date: 2026-10-25

## Context
Frontend and backend are written in different languages. Hand-written client types drift silently.

## Decision
Pydantic v2 models define every request and response. `make gen-api` exports `app.openapi()` and runs `openapi-typescript` to produce `frontend/src/api/schema.d.ts`. The client uses `openapi-fetch`. CI fails if the generated file is stale.

## Consequences
- ✅ Compile-time safety across the stack; the API docs at `/api/docs` are always accurate.
- ⚠️ One extra step after changing schemas. It's covered by the Makefile and CI.
