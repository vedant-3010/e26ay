"""``/api/accuracy``: the Accuracy Lab payload."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from ..services.accuracy import accuracy
from ..store import DataStore
from .caching import cached_json
from .deps import AccuracyQuery, accuracy_params, store_dep
from .schemas import AccuracyResponse, ErrorResponse

router = APIRouter()


@router.get(
    "/accuracy",
    response_model=AccuracyResponse,
    summary="Forecast error statistics, buffers, calibration and the value of the forecast",
    responses={304: {"description": "Not modified (ETag matched)"}, 422: {"model": ErrorResponse}},
)
def get_accuracy(
    request: Request,
    q: Annotated[AccuracyQuery, Depends(accuracy_params)],
    store: Annotated[DataStore, Depends(store_dep)],
) -> Response:
    body = accuracy(store, q.population, q.auction, q.horizon_h, q.start, q.end, q.confidence)
    return cached_json(request, body, snapshot_id=store.snapshot_id, key=q.key)
