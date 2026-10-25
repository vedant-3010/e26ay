"""Error envelope ``{"error": {"code", "message", "details"}}`` (API.md, Conventions)."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .schemas import ErrorBody, ErrorResponse

_CODES = {404: "not_found", 405: "method_not_allowed", 422: "invalid_params"}


def error_response(status: int, message: str, code: str | None = None) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code or _CODES.get(status, "error"), message=message))
    return JSONResponse(body.model_dump(), status_code=status)


async def _http_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # registered for this type only
    return error_response(exc.status_code, str(exc.detail))


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
