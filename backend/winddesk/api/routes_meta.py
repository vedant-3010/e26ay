"""``/api/health`` and ``/api/meta``."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from .. import __version__
from ..config import get_settings
from ..services.meta import meta
from ..snapshot import read_snapshot_id
from ..store import DataStore
from .caching import cached_json
from .deps import store_dep
from .schemas import ErrorResponse, HealthResponse, MetaResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, summary="Liveness and deployed version")
def health(response: Response) -> HealthResponse:
    settings = get_settings()
    snapshot_id = read_snapshot_id(settings.data_path)
    response.headers["Cache-Control"] = "no-store"
    if snapshot_id:
        response.headers["X-Snapshot-Id"] = snapshot_id
    return HealthResponse(
        status="ok", snapshot_id=snapshot_id, git_sha=settings.git_sha, version=__version__
    )


@router.get(
    "/meta",
    response_model=MetaResponse,
    summary="Bounds, presets, defaults and data quality (UI bootstrap)",
    responses={304: {"description": "Not modified (ETag matched)"}, 500: {"model": ErrorResponse}},
)
def get_meta(request: Request, store: Annotated[DataStore, Depends(store_dep)]) -> Response:
    live_enabled = get_settings().enable_live
    body = meta(store, live_enabled)
    return cached_json(
        request, body, snapshot_id=store.snapshot_id, key=f"meta|live={live_enabled}"
    )
