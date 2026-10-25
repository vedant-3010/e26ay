"""DataStore: load the snapshot once and precompute what requests share (ARCHITECTURE §4, DATA §6).

Built at startup by the FastAPI lifespan, and lazily on first use (the serverless path). Target:
under 1 s. Everything here is derived from the committed snapshot, so it is immutable for the
life of the process.
"""

import json
import logging
import time as clock
from datetime import date, time
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from .analytics.accuracy import in_days, lead_curve
from .analytics.buffers import Calibration, calibrate
from .analytics.pilot import AUCTIONS, CONFIDENCES, DELIVERY_FROM, DELIVERY_TO, AuctionPreset
from .analytics.selection import decision_pool, make_pairs
from .analytics.timeutil import delivery_days
from .config import get_settings

log = logging.getLogger("winddesk")

LEAD_CURVE_BINS_H = (1.0, 3.0)


class SnapshotMissingError(FileNotFoundError):
    """The data directory has no snapshot (run `make ingest`)."""


class DataStore:
    def __init__(self, data_path: Path) -> None:
        t0 = clock.perf_counter()
        required = ["manifest.json", "quality.json", "actuals.parquet", "forecasts.parquet"]
        missing = [name for name in required if not (data_path / name).is_file()]
        if missing:
            raise SnapshotMissingError(f"{data_path} is missing {missing}; run `make ingest`")

        self.data_path = data_path
        self.manifest: dict[str, Any] = json.loads((data_path / "manifest.json").read_text())
        self.quality: dict[str, Any] = json.loads((data_path / "quality.json").read_text())
        self.snapshot_id: str = self.manifest["snapshot_id"]
        self.forecasts = pd.read_parquet(data_path / "forecasts.parquet")
        self.actuals = pd.read_parquet(data_path / "actuals.parquet")

        self.auctions: dict[str, AuctionPreset] = {a.id: a for a in AUCTIONS}
        self.delivery_days: list[date] = delivery_days(DELIVERY_FROM, DELIVERY_TO)

        #: Every run × target pair inside the delivery window (lead curves, DATA §5.6).
        self.pairs_all = in_days(
            make_pairs(self.forecasts, self.actuals), DELIVERY_FROM, DELIVERY_TO
        )
        self._pools: dict[time, pd.DataFrame] = {}
        #: Decision pairs per auction preset (DATA §5.4).
        self.pools = {a.id: self.pool_for_cutoff(a.cutoff_local) for a in AUCTIONS}
        #: LODO calibration per preset × confidence (DATA §5.8).
        self.calibrations: dict[tuple[str, float], Calibration] = {
            (a, c): calibrate(self.pools[a], c) for a in self.pools for c in CONFIDENCES
        }
        self.lead_curves = {b: lead_curve(self.pairs_all, bin_h=b) for b in LEAD_CURVE_BINS_H}

        self.load_ms = (clock.perf_counter() - t0) * 1000
        log.info(
            "data store ready",
            extra={
                "snapshot_id": self.snapshot_id,
                "duration_ms": round(self.load_ms, 1),
                "forecast_rows": len(self.forecasts),
                "actual_rows": len(self.actuals),
                "pairs": len(self.pairs_all),
            },
        )

    def pool_for_cutoff(self, cutoff_local: time) -> pd.DataFrame:
        """Decision pairs for any cutoff (presets are precomputed; custom ones are cached)."""
        if cutoff_local not in self._pools:
            self._pools[cutoff_local] = decision_pool(
                self.forecasts, self.actuals, self.delivery_days, cutoff_local
            )
        return self._pools[cutoff_local]


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return DataStore(get_settings().data_path)
