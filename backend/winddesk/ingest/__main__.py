"""Build the data snapshot: ``python -m winddesk.ingest --start 2025-12-30 --end 2026-02-01``.

fetch (raw cache) → normalize → validate → write ``data/snapshot/``:
``actuals.parquet``, ``forecasts.parquet``, ``quality.json`` and ``manifest.json``.

Re-running with ``--offline`` rebuilds from ``data/raw`` and must reproduce the same
``snapshot_id`` (it is the hash of the two parquet files, which are written deterministically).
"""

import argparse
import hashlib
import json
import logging
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pandas as pd

from ..analytics.pilot import (
    AUCTIONS,
    DELIVERY_FROM,
    DELIVERY_TO,
    PUBLISH_FROM,
    PUBLISH_TO,
    TARGET_FROM_UTC,
    TARGET_TO_UTC,
)
from ..analytics.timeutil import delivery_days, utc_iso
from ..config import REPO_ROOT, get_settings
from ..logs import configure_logging
from .client import BASE_URL, IngestError, fetch_chunks, fuelhh_chunks, windfor_chunks
from .normalize import (
    NormalizedActuals,
    NormalizedForecasts,
    normalize_actuals,
    normalize_forecasts,
)
from .validate import quality_report, validate

log = logging.getLogger("winddesk.ingest")

DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"
SOURCES = {
    "FUELHH": {
        "description": "Actual generation by fuel type, half-hourly (fuelType=WIND)",
        "docs": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
    },
    "WINDFOR": {
        "description": "National wind generation forecast runs, hourly",
        "docs": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
    },
}


@dataclass(frozen=True)
class IngestResult:
    snapshot_id: str
    status: str
    out_dir: Path


def _write_parquet(df: pd.DataFrame, path: Path) -> None:
    # Fixed row order, no index and a fixed compression codec keep the bytes reproducible.
    df.to_parquet(path, engine="pyarrow", index=False, compression="snappy")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, doc: dict[str, Any]) -> None:
    path.write_text(json.dumps(doc, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8")


def _summary(fc: NormalizedForecasts, ac: NormalizedActuals) -> dict[str, Any]:
    """Figures for the Methodology data-quality table (PRD F5)."""
    return {
        "forecast_runs": len(fc.rows_per_run),
        "forecast_rows": len(fc.frame),
        "forecast_duplicates_removed": fc.duplicates_removed,
        "actual_rows": len(ac.frame),
        "actual_duplicates_removed": ac.duplicates_removed,
        "target_from": utc_iso(TARGET_FROM_UTC),
        "target_to_exclusive": utc_iso(TARGET_TO_UTC),
        "delivery_from": DELIVERY_FROM.isoformat(),
        "delivery_to": DELIVERY_TO.isoformat(),
    }


def run_ingest(
    start: date,
    end: date,
    *,
    out_dir: Path,
    raw_dir: Path = DEFAULT_RAW_DIR,
    offline: bool = False,
    refresh: bool = False,
    transport: httpx.AsyncBaseTransport | None = None,
) -> IngestResult:
    """Fetch, normalise, validate and write the snapshot. Returns its id and quality status.

    ``start``/``end`` are WINDFOR publish days (inclusive). FUELHH is fetched for the
    settlement days that fall inside the pilot target window, up to ``end``.
    """
    settlement_first = max(start, TARGET_FROM_UTC.date())
    settlement_last = min(end, (TARGET_TO_UTC - timedelta(days=1)).date())
    wf_chunks = windfor_chunks(start, end)
    fh_chunks = fuelhh_chunks(settlement_first, settlement_last)
    results = fetch_chunks(
        [*wf_chunks, *fh_chunks],
        raw_dir,
        offline=offline,
        refresh=refresh,
        transport=transport,
    )
    wf_records = [r for chunk in results[: len(wf_chunks)] for r in chunk]
    fh_records = [r for chunk in results[len(wf_chunks) :] for r in chunk]

    forecasts = normalize_forecasts(wf_records, TARGET_FROM_UTC, TARGET_TO_UTC)
    actuals = normalize_actuals(fh_records, TARGET_FROM_UTC, TARGET_TO_UTC)

    # A delivery day D is checkable only if its decision day D−1 was fetched.
    in_scope = [
        d
        for d in delivery_days(DELIVERY_FROM, DELIVERY_TO)
        if start <= d - timedelta(days=1) <= end
    ]
    checks = validate(
        forecasts,
        actuals,
        publish_days=delivery_days(start, end),
        settlement_days=delivery_days(settlement_first, settlement_last),
        delivery_days=in_scope,
        auctions=AUCTIONS,
    )
    quality = quality_report(checks, _summary(forecasts, actuals))

    out_dir.mkdir(parents=True, exist_ok=True)
    actuals_path, forecasts_path = out_dir / "actuals.parquet", out_dir / "forecasts.parquet"
    _write_parquet(actuals.frame, actuals_path)
    _write_parquet(forecasts.frame, forecasts_path)
    digest = hashlib.sha256()
    for path in (actuals_path, forecasts_path):
        digest.update(path.read_bytes())
    snapshot_id = digest.hexdigest()[:12]

    manifest_path = out_dir / "manifest.json"
    created_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    if manifest_path.is_file():  # an unchanged snapshot keeps its creation time
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
        if previous.get("snapshot_id") == snapshot_id:
            created_at = previous.get("created_at", created_at)

    manifest = {
        "snapshot_id": snapshot_id,
        "created_at": created_at,
        "fetch": {
            "base_url": BASE_URL,
            "windfor_publish_days": [start.isoformat(), end.isoformat()],
            "fuelhh_settlement_days": [settlement_first.isoformat(), settlement_last.isoformat()],
            "chunks": {"WINDFOR": len(wf_chunks), "FUELHH": len(fh_chunks)},
            "example_urls": {"WINDFOR": wf_chunks[0].url, "FUELHH": fh_chunks[0].url},
        },
        "window": {
            "target_from": utc_iso(TARGET_FROM_UTC),
            "target_to_exclusive": utc_iso(TARGET_TO_UTC),
        },
        "rows": {"actuals": len(actuals.frame), "forecasts": len(forecasts.frame)},
        "files": {
            "actuals.parquet": _sha256(actuals_path),
            "forecasts.parquet": _sha256(forecasts_path),
        },
        "sources": SOURCES,
        "quality_status": quality["status"],
    }
    _write_json(out_dir / "quality.json", quality)
    _write_json(manifest_path, manifest)
    return IngestResult(snapshot_id=snapshot_id, status=quality["status"], out_dir=out_dir)


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m winddesk.ingest", description=__doc__)
    parser.add_argument("--start", type=date.fromisoformat, default=PUBLISH_FROM)
    parser.add_argument("--end", type=date.fromisoformat, default=PUBLISH_TO)
    parser.add_argument("--offline", action="store_true", help="use data/raw only, no network")
    parser.add_argument("--refresh", action="store_true", help="re-fetch even if cached")
    parser.add_argument("--out", type=Path, default=None, help="default: WINDDESK_DATA_DIR")
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW_DIR)
    args = parser.parse_args(argv)
    if args.offline and args.refresh:
        parser.error("--offline and --refresh are mutually exclusive")
    if args.end < args.start:
        parser.error("--end must not be before --start")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    configure_logging(get_settings().log_level)
    out_dir = args.out or get_settings().data_path
    try:
        result = run_ingest(
            args.start,
            args.end,
            out_dir=out_dir,
            raw_dir=args.raw,
            offline=args.offline,
            refresh=args.refresh,
        )
    except IngestError as exc:
        log.error("ingest failed", extra={"error": str(exc)})
        return 1
    quality = json.loads((result.out_dir / "quality.json").read_text(encoding="utf-8"))
    for check in quality["checks"]:
        print(f"  [{check['status']:>4}] {check['id']}: {check['message']}")
    print(f"snapshot {result.snapshot_id} → {result.out_dir} (quality: {result.status})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
