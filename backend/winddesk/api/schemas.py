"""Pydantic v2 response and parameter models (API.md). Grows in Phase 4."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = Field(description="Always `ok` when the app is serving.")
    snapshot_id: str | None = Field(
        description="First 12 hex chars of the snapshot hash; `null` before the first ingest.",
        examples=["a1b2c3d4e5f6"],
    )
    git_sha: str | None = Field(
        description="Deployed commit (`VERCEL_GIT_COMMIT_SHA` or `GIT_SHA`).", examples=["abc1234"]
    )
    version: str = Field(description="WindDesk version.", examples=["1.0.0"])


class ErrorBody(BaseModel):
    code: str = Field(examples=["invalid_params"])
    message: str
    details: list[dict[str, object]] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody
