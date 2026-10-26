"""HTTP caching for data responses (API.md, Conventions).

Responses are deterministic for a given snapshot, so the ETag is ``"{snapshot_id}-{hash(query)}"``
and the CDN may keep them for a day. This is done per response rather than in middleware, so
each endpoint picks its own key. Live responses (PRD F8) are not snapshot data: they get
``LIVE_CACHE_CONTROL`` and no ETag.
"""

import hashlib

from fastapi import Request, Response
from pydantic import BaseModel

CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
#: Live answers change when a new run is published; the server re-fetches every 10 minutes.
LIVE_CACHE_CONTROL = "public, max-age=60, s-maxage=300"


def etag_for(snapshot_id: str, key: str) -> str:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    return f'"{snapshot_id}-{digest}"'


def _matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    candidates = {tag.strip().removeprefix("W/") for tag in if_none_match.split(",")}
    return "*" in candidates or etag in candidates


def cached_json(request: Request, body: BaseModel, *, snapshot_id: str, key: str) -> Response:
    """200 with the JSON body, or 304 when the client already holds this version."""
    etag = etag_for(snapshot_id, key)
    headers = {"ETag": etag, "Cache-Control": CACHE_CONTROL, "X-Snapshot-Id": snapshot_id}
    if _matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return Response(body.model_dump_json(), media_type="application/json", headers=headers)
