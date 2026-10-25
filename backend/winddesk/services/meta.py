"""``/api/meta``: everything the UI needs to bootstrap (API.md)."""

from functools import lru_cache

import pandas as pd

from ..analytics import pilot
from ..api import schemas
from ..store import DataStore
from .convert import when


@lru_cache(maxsize=4)
def meta(store: DataStore) -> schemas.MetaResponse:
    quality = store.quality
    checks = {c["id"]: c for c in quality["checks"]}
    summary = quality["summary"]
    missing = checks.get("periods_per_day", {}).get("details", {}).get("missing_periods", [])
    off_schedule = checks.get("run_times", {}).get("details", {}).get("off_schedule", [])
    return schemas.MetaResponse(
        product="WindDesk",
        snapshot=schemas.SnapshotInfo(
            id=store.snapshot_id, created_at=pd.Timestamp(store.manifest["created_at"])
        ),
        bounds=schemas.Bounds(
            target_from=pilot.TARGET_FROM_UTC,
            target_to=pilot.TARGET_TO_UTC,
            delivery_from=pilot.DELIVERY_FROM,
            delivery_to=pilot.DELIVERY_TO,
        ),
        forecast_runs=schemas.ForecastRuns(
            count=int(store.forecasts["publish_time"].nunique()),
            run_times_utc=list(pilot.NOMINAL_RUN_TIMES_UTC),
            off_schedule=[t for t in (when(pd.Timestamp(x)) for x in off_schedule) if t],
        ),
        rows=schemas.RowCounts(actuals=len(store.actuals), forecasts=len(store.forecasts)),
        auctions=[
            schemas.Auction(id=a.id, label=a.label, cutoff_local=f"{a.cutoff_local:%H:%M}")
            for a in pilot.AUCTIONS
        ],
        confidences=list(pilot.CONFIDENCES),
        horizon=schemas.Horizon(
            min_h=pilot.HORIZON_MIN_H,
            max_h=pilot.HORIZON_MAX_H,
            step_h=pilot.HORIZON_STEP_H,
            default_h=pilot.HORIZON_DEFAULT_H,
        ),
        defaults=schemas.Defaults(
            delivery_date=pilot.DEFAULT_DELIVERY_DATE,
            auction=pilot.DEFAULT_AUCTION,
            confidence=pilot.DEFAULT_CONFIDENCE,
            monitor_start=pilot.DEFAULT_MONITOR_START_UTC,
            monitor_end=pilot.DEFAULT_MONITOR_END_UTC,
        ),
        quality=schemas.Quality(
            status=quality["status"],
            summary=schemas.QualitySummary(
                forecast_runs=summary["forecast_runs"],
                forecast_rows=summary["forecast_rows"],
                forecast_duplicates_removed=summary["forecast_duplicates_removed"],
                actual_rows=summary["actual_rows"],
                actual_duplicates_removed=summary["actual_duplicates_removed"],
                missing_periods=len(missing),
            ),
            checks=[
                schemas.QualityCheck(id=c["id"], status=c["status"], message=c["message"])
                for c in quality["checks"]
            ],
        ),
    )
