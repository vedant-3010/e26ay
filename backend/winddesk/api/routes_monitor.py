"""``/api/monitor``: actual vs forecast at a fixed horizon."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from ..services.monitor import monitor
from ..store import DataStore
from .caching import cached_json
from .deps import MonitorQuery, monitor_params, store_dep
from .schemas import ErrorResponse, MonitorResponse

router = APIRouter()


@router.get(
    "/monitor",
    response_model=MonitorResponse,
    summary="Actual vs the latest forecast published at least horizon_h before each hour",
    responses={304: {"description": "Not modified (ETag matched)"}, 422: {"model": ErrorResponse}},
)
def get_monitor(
    request: Request,
    q: Annotated[MonitorQuery, Depends(monitor_params)],
    store: Annotated[DataStore, Depends(store_dep)],
) -> Response:
    body = monitor(store, q.start, q.end, q.horizon_h)
    return cached_json(request, body, snapshot_id=store.snapshot_id, key=q.key)
