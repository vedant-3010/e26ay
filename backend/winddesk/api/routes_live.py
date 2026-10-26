"""``/api/live`` (Could, PRD F8): tomorrow's wind as of now, behind ``WINDDESK_ENABLE_LIVE``."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..services.live import LiveCache, LiveUnavailableError, live
from ..store import DataStore
from .caching import LIVE_CACHE_CONTROL
from .deps import live_cache_dep, live_params, require_live, store_dep
from .errors import error_response
from .schemas import ErrorResponse, LiveResponse

router = APIRouter()


@router.get(
    "/live",
    response_model=LiveResponse,
    summary="Could-have: tomorrow's forecast and firm wind as of now, live from Elexon",
    description=(
        "Off unless WINDDESK_ENABLE_LIVE=true (404). Fetches the latest WINDFOR runs (kept for "
        "10 minutes) and answers in the /decision shape with the fetch time on D−1 as the "
        "cutoff; actuals are empty and outcome fields null. 502 if Elexon is unavailable."
    ),
    dependencies=[Depends(require_live)],
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
def get_live(
    confidence: Annotated[float, Depends(live_params)],
    store: Annotated[DataStore, Depends(store_dep)],
    cache: Annotated[LiveCache, Depends(live_cache_dep)],
) -> Response:
    try:
        body = live(store, confidence, cache)
    except LiveUnavailableError as exc:
        return error_response(502, f"Live forecast unavailable: {exc}", "upstream_unavailable")
    return Response(
        body.model_dump_json(),
        media_type="application/json",
        headers={"Cache-Control": LIVE_CACHE_CONTROL},
    )
