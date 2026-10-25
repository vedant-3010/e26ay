"""Snapshot manifest access (the full ``DataStore`` arrives in Phase 2)."""

import json
from pathlib import Path


def read_snapshot_id(data_path: Path) -> str | None:
    """Return ``snapshot_id`` from ``manifest.json``, or ``None`` if no snapshot exists yet."""
    manifest = data_path / "manifest.json"
    if not manifest.is_file():
        return None
    value = json.loads(manifest.read_text(encoding="utf-8")).get("snapshot_id")
    return value if isinstance(value, str) else None
