"""FastAPI application: ``/api/*`` plus the built React SPA, on one origin (ADR-0002).

Run locally with ``uv run uvicorn winddesk.main:app --app-dir backend``. Vercel loads the same
module as ``backend.winddesk.main:app`` (pyproject ``[tool.vercel]``), which is why every import
inside the package is relative.
"""

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException

from . import __version__
from .api import routes_meta
from .api.errors import install_error_handlers
from .config import get_settings
from .logs import configure_logging
from .snapshot import read_snapshot_id
from .store import SnapshotMissingError, get_store

log = logging.getLogger("winddesk")

#: Relative to the working directory (repo root locally, ``/app`` in Docker, the bundle root on
#: Vercel). Kept as a literal so Vercel's build step can find it and promote it to the CDN.
FRONTEND_DIST = "frontend/dist"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    t0 = time.perf_counter()
    settings = get_settings()
    try:
        get_store()  # load + precompute now, so the first request is fast
    except SnapshotMissingError as exc:
        log.warning("no data snapshot; data endpoints will fail", extra={"error": str(exc)})
    log.info(
        "startup complete",
        extra={
            "snapshot_id": read_snapshot_id(settings.data_path),
            "data_dir": str(settings.data_path),
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
        },
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="WindDesk API",
        version=__version__,
        summary="Day-ahead wind forecast intelligence (pilot: January 2026 decisions).",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    install_error_handlers(app)
    app.include_router(routes_meta.router, prefix="/api", tags=["meta"])

    # Unknown /api paths must 404 as JSON rather than fall through to the SPA's index.html.
    @app.api_route("/api/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def api_not_found(path: str) -> None:
        raise HTTPException(status_code=404, detail=f"Unknown API path: /api/{path}")

    if Path(FRONTEND_DIST).is_dir():
        app.frontend("/", directory="frontend/dist", fallback="index.html")
    else:
        log.warning(
            "frontend build not found; serving the API only",
            extra={"expected": str(Path(FRONTEND_DIST).resolve())},
        )
    return app


app = create_app()
