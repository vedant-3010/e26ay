# WindDesk — single entry point for every task (ARCHITECTURE §7).
# `make check` is the quality gate: lint + types + tests + build.

SHELL := /bin/bash
.DEFAULT_GOAL := help

UV       ?= uv
NPM      ?= npm
FE       := frontend
PY_APP   := winddesk.main:app
OPENAPI  := .cache/openapi.json
NOTEBOOK := notebooks/01_wind_forecast_accuracy.ipynb
IMAGE    ?= winddesk

.PHONY: help setup dev dev-api dev-web ingest test test-contract lint format typecheck \
        gen-api gen-api-check build notebook docker-build docker-up check clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Install Python (uv) and frontend (npm ci) dependencies, and git hooks
	$(UV) sync --frozen
	$(NPM) --prefix $(FE) ci
	@if [ -d .git ]; then $(UV) run pre-commit install; fi

dev: ## API on :8000 and Vite on :5173 (open http://localhost:5173)
	@$(MAKE) -j2 dev-api dev-web

dev-api: ## FastAPI with hot reload on :8000
	$(UV) run uvicorn $(PY_APP) --app-dir backend --reload --reload-dir backend --port 8000

dev-web: ## Vite dev server on :5173 (proxies /api to :8000)
	$(NPM) --prefix $(FE) run dev

ingest: ## Rebuild data/snapshot from Elexon (add ARGS="--offline" to use the raw cache)
	$(UV) run python -m winddesk.ingest --start 2025-12-30 --end 2026-02-01 $(ARGS)

test: ## Fast tests: pytest (no snapshot marker, ≥ 90% analytics coverage) + Vitest
	$(UV) run pytest -m "not snapshot" --cov=winddesk.analytics --cov-report=term-missing:skip-covered --cov-fail-under=90
	$(NPM) --prefix $(FE) test

test-contract: ## Real-data contract tests against the committed snapshot
	$(UV) run pytest -m snapshot

lint: ## ruff, ruff format --check, ESLint, Prettier --check
	$(UV) run ruff check .
	$(UV) run ruff format --check .
	$(NPM) --prefix $(FE) run lint

format: ## Auto-format Python and TypeScript
	$(UV) run ruff check --fix .
	$(UV) run ruff format .
	$(NPM) --prefix $(FE) run format

typecheck: ## mypy (strict on analytics/services/api) + tsc
	$(UV) run mypy
	$(NPM) --prefix $(FE) run typecheck

gen-api: ## Export OpenAPI and regenerate frontend/src/api/schema.d.ts
	$(UV) run python -m winddesk.api.export_openapi $(OPENAPI)
	$(NPM) --prefix $(FE) run gen:api

gen-api-check: gen-api ## Fail if the committed API types are stale (CI)
	git diff --exit-code -- $(FE)/src/api/schema.d.ts

build: ## Production build of the SPA into frontend/dist
	$(NPM) --prefix $(FE) run build

notebook: ## Execute the analysis notebook in place (outputs are committed)
	$(UV) run jupyter nbconvert --to notebook --execute --inplace $(NOTEBOOK)

docker-build: ## Build the production image
	docker build --build-arg GIT_SHA=$$(git rev-parse --short HEAD 2>/dev/null || echo local) -t $(IMAGE) .

docker-up: ## Full app in Docker on http://localhost:8000
	GIT_SHA=$$(git rev-parse --short HEAD 2>/dev/null || echo local) docker compose up --build

check: lint typecheck test build ## The gate: lint + types + tests + build

clean: ## Remove caches and build output (keeps data/ and node_modules)
	rm -rf .cache .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov $(FE)/dist $(FE)/coverage
	find backend -name __pycache__ -type d -prune -exec rm -rf {} +
