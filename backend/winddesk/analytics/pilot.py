"""Pilot scope (DATA §2): fixed windows and auction presets. Pure constants, no I/O."""

from dataclasses import dataclass
from datetime import date, time

import pandas as pd

#: Target times kept in the snapshot: ``[TARGET_FROM_UTC, TARGET_TO_UTC)``. 1 Jan is included
#: for Monitor context only; decisions start with delivery day 2 Jan.
TARGET_FROM_UTC = pd.Timestamp("2026-01-01T00:00:00Z")
TARGET_TO_UTC = pd.Timestamp("2026-02-02T00:00:00Z")

#: In-scope delivery days (UK settlement days), both inclusive: decisions made 1–31 Jan 2026.
DELIVERY_FROM = date(2026, 1, 2)
DELIVERY_TO = date(2026, 2, 1)

#: Default fetch window for WINDFOR publish days (inclusive). Runs from 30 Dec reach 48 h
#: leads into 1 Jan.
PUBLISH_FROM = date(2025, 12, 30)
PUBLISH_TO = date(2026, 2, 1)


@dataclass(frozen=True)
class AuctionPreset:
    """A day-ahead auction whose gate closure on D−1 (UK local time) is the decision cutoff."""

    id: str
    label: str
    cutoff_local: time


AUCTIONS: tuple[AuctionPreset, ...] = (
    AuctionPreset("epex", "EPEX SPOT GB Day-Ahead", time(9, 20)),
    AuctionPreset("n2ex", "Nord Pool N2EX Day-Ahead", time(9, 50)),
)

#: Confidence levels offered for buffers and firm wind. P99 is deliberately not offered (PRD §7.6).
CONFIDENCES: tuple[float, ...] = (0.8, 0.9, 0.95)
