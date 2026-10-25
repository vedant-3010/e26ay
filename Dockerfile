# syntax=docker/dockerfile:1
# WindDesk: build the SPA with Node, then run FastAPI (API + SPA, one origin) on slim Python.

# ---------------------------------------------------------------- 1. frontend build
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------- 2. runtime
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Runtime dependencies only (no dev group), from the committed lockfile.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/winddesk/ backend/winddesk/
COPY data/snapshot/ data/snapshot/
COPY --from=web /app/frontend/dist/ frontend/dist/

ARG GIT_SHA=local
ENV GIT_SHA=${GIT_SHA}

RUN useradd --create-home --uid 10001 winddesk
USER winddesk

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=2)"

# Shell form so $PORT (set by Heroku and friends) is honoured; exec keeps uvicorn as PID 1.
CMD ["sh", "-c", "exec uvicorn winddesk.main:app --app-dir backend --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
