"""Pilot scope (DATA §2): fixed windows and auction presets. Pure constants, no I/O."""

from dataclasses import dataclass
from datetime import date, time
from typing import Literal

import pandas as pd

#: Target times kept in the snapshot: ``[TARGET_FROM_UTC, TARGET_TO_UTC)``. 1 Jan is included
#: for Monitor context only; decisions start with delivery day 2 Jan.
TARGET_FROM_UTC = pd.Timestamp("2026-01-01T00:00:00Z")
TARGET_TO_UTC = pd.Timestamp("2026-02-02T00:00:00Z")

#: In-scope delivery days (UK settlement days), both inclusive: decisions made 1–31 Jan 2026.
DELIVERY_FROM = date(2026, 1, 2)
DELIVERY_TO = date(2026, 2, 1)

#: Elexon's nominal WINDFOR publish schedule (DATA §1.2). Off-schedule runs are kept as published.
NOMINAL_RUN_TIMES_UTC = ("02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30")

#: Default fetch window for WINDFOR publish days (inclusive). Runs from 30 Dec reach 48 h
#: leads into 1 Jan.
PUBLISH_FROM = date(2025, 12, 30)
PUBLISH_TO = date(2026, 2, 1)


AuctionId = Literal["epex", "n2ex"]


@dataclass(frozen=True)
class AuctionPreset:
    """A day-ahead auction whose gate closure on D−1 (UK local time) is the decision cutoff."""

    id: AuctionId
    label: str
    cutoff_local: time


AUCTIONS: tuple[AuctionPreset, ...] = (
    AuctionPreset("epex", "EPEX SPOT GB Day-Ahead", time(9, 20)),
    AuctionPreset("n2ex", "Nord Pool N2EX Day-Ahead", time(9, 50)),
)

#: Confidence levels offered for buffers and firm wind. P99 is deliberately not offered (PRD §7.6).
CONFIDENCES: tuple[float, ...] = (0.8, 0.9, 0.95)

#: Horizon slider (PRD F2): 0–48 h in 0.5 h steps.
HORIZON_MIN_H, HORIZON_MAX_H, HORIZON_STEP_H, HORIZON_DEFAULT_H = 0.0, 48.0, 0.5, 24.0
MONITOR_MAX_SPAN_DAYS = 35

#: UI defaults served by /api/meta.
DEFAULT_DELIVERY_DATE = date(2026, 1, 15)
DEFAULT_AUCTION: AuctionId = "epex"
DEFAULT_CONFIDENCE = 0.9
DEFAULT_MONITOR_START_UTC = pd.Timestamp("2026-01-02T00:00:00Z")
DEFAULT_MONITOR_END_UTC = pd.Timestamp("2026-01-09T00:00:00Z")
