"""``/api/decision``: the Decision Desk payload for one delivery day."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from ..services.decision import decision
from ..store import DataStore
from .caching import cached_json
from .deps import DecisionQuery, decision_params, store_dep
from .schemas import DecisionResponse, ErrorResponse

router = APIRouter()


@router.get(
    "/decision",
    response_model=DecisionResponse,
    summary="The forecast available at the auction cutoff, firm wind, and (for hindsight) actuals",
    responses={304: {"description": "Not modified (ETag matched)"}, 422: {"model": ErrorResponse}},
)
def get_decision(
    request: Request,
    q: Annotated[DecisionQuery, Depends(decision_params)],
    store: Annotated[DataStore, Depends(store_dep)],
) -> Response:
    body = decision(store, q.delivery_date, q.auction, q.cutoff_local, q.confidence)
    return cached_json(request, body, snapshot_id=store.snapshot_id, key=q.key)
