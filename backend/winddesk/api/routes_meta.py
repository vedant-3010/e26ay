"""``/api/health`` (and ``/api/meta`` from Phase 4)."""

from fastapi import APIRouter, Response

from .. import __version__
from ..config import get_settings
from ..snapshot import read_snapshot_id
from .schemas import HealthResponse

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
