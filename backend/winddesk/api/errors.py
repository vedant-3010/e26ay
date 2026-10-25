"""Error envelope ``{"error": {"code", "message", "details"}}`` for every failure (API.md).

422 covers both FastAPI's own parameter validation and WindDesk's rules (``InvalidParamsError``).
Unexpected errors return 500 with the same shape and no stack trace (it is logged instead).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..config import get_settings
from ..snapshot import read_snapshot_id
from .deps import InvalidParamsError
from .schemas import ErrorBody, ErrorResponse

log = logging.getLogger("winddesk")

_CODES = {404: "not_found", 405: "method_not_allowed", 422: "invalid_params"}


def error_response(
    status: int,
    message: str,
    code: str | None = None,
    details: list[dict[str, object]] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(
            code=code or _CODES.get(status, "error"), message=message, details=details or []
        )
    )
    headers = {}
    snapshot_id = read_snapshot_id(get_settings().data_path)
    if snapshot_id:
        headers["X-Snapshot-Id"] = snapshot_id
    return JSONResponse(body.model_dump(mode="json"), status_code=status, headers=headers)


async def _http_exception(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # registered for this type only
    return error_response(exc.status_code, str(exc.detail))


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details = [
        {
            "param": ".".join(str(p) for p in err.get("loc", ())[1:]) or None,
            "message": err.get("msg"),
            "input": jsonable_encoder(err.get("input")),
        }
        for err in exc.errors()
    ]
    first = details[0] if details else {}
    message = f"{first.get('param')}: {first.get('message')}" if first else "invalid parameters"
    return error_response(422, message, "invalid_params", details)


async def _invalid_params(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, InvalidParamsError)
    return error_response(422, exc.message, "invalid_params", jsonable_encoder(exc.details))


async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error", extra={"path": request.url.path})
    return error_response(500, "Internal server error", "internal_error")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(InvalidParamsError, _invalid_params)
    app.add_exception_handler(Exception, _unexpected)
