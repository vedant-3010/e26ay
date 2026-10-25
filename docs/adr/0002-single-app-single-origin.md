# ADR-0002: One FastAPI app serves API and SPA

- Status: Accepted
- Date: 2026-10-25

## Context
The brief requires React + Python, Docker, and a Vercel or Heroku deployment. Running two deployables (a static site plus a separate API) brings CORS, environment-specific base URLs and two places to break.

## Decision
A single FastAPI app serves `/api/*` and the built React SPA (`app.frontend("/", directory="frontend/dist", fallback="index.html")`). On Vercel the app becomes one Python Function and the SPA files are promoted to the CDN. In Docker, uvicorn serves both.

## Consequences
- ✅ Same origin everywhere: no CORS, no `VITE_API_URL` per environment, and deep links work.
- ✅ The Docker image and the Vercel deploy behave the same.
- ⚠️ Depends on Vercel's FastAPI static support. This is mitigated by deploying a walking skeleton in Phase 0, plus a documented fallback shim.
- ⚠️ Top-level FastAPI middleware disables CDN promotion on Vercel unless `[tool.vercel.fastapi.static] cdn = true`.
