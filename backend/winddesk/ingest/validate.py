"""Data-quality checks written to ``quality.json`` (DATA §3 step 6).

Every check is ``ok`` or ``warn``; a warning never stops the ingest (structural problems raise
``IngestError`` earlier). Expected values come from the observed Elexon behaviour in DATA §1.2.
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Literal

from ..analytics.pilot import NOMINAL_RUN_TIMES_UTC, AuctionPreset
from ..analytics.selection import select_decision_run
from ..analytics.timeutil import decision_cutoff_utc, delivery_day_targets, utc_iso
from .normalize import NormalizedActuals, NormalizedForecasts

Status = Literal["ok", "warn"]

EXPECTED_RUNS_PER_DAY = 8
EXPECTED_ROWS_PER_RUN = 73
EXPECTED_RUN_TIMES_UTC = NOMINAL_RUN_TIMES_UTC


@dataclass(frozen=True)
class Check:
    id: str
    status: Status
    message: str
    details: dict[str, Any] = field(default_factory=dict)


def _status(ok: bool) -> Status:
    return "ok" if ok else "warn"


def check_runs_per_day(fc: NormalizedForecasts, publish_days: Sequence[date]) -> Check:
    per_day = Counter(t.date() for t in fc.rows_per_run)
    bad = {d.isoformat(): per_day.get(d, 0) for d in publish_days}
    bad = {d: n for d, n in bad.items() if n != EXPECTED_RUNS_PER_DAY}
    if not bad:
        msg = f"{EXPECTED_RUNS_PER_DAY} runs on every one of {len(publish_days)} publish days"
    else:
        msg = f"{len(bad)} publish day(s) without {EXPECTED_RUNS_PER_DAY} runs"
    return Check("runs_per_day", _status(not bad), msg, {"unexpected": bad})


def check_rows_per_run(fc: NormalizedForecasts) -> Check:
    counts = Counter(fc.rows_per_run.values())
    bad = {utc_iso(t): n for t, n in fc.rows_per_run.items() if n != EXPECTED_ROWS_PER_RUN}
    msg = (
        f"{EXPECTED_ROWS_PER_RUN} hourly points in every one of {len(fc.rows_per_run)} runs"
        if not bad
        else f"{len(bad)} run(s) without {EXPECTED_ROWS_PER_RUN} points"
    )
    return Check(
        "rows_per_run",
        _status(not bad),
        msg,
        {"histogram": {str(k): v for k, v in sorted(counts.items())}, "unexpected": bad},
    )


def check_run_times(fc: NormalizedForecasts) -> Check:
    """Runs should publish at the 8 nominal UTC times. A run at any other time is reported by
    name (e.g. the 15 Jan 2026 11:30 run, published at 12:25). It is kept as published."""
    off_schedule = [
        utc_iso(t) for t in fc.rows_per_run if f"{t:%H:%M}" not in EXPECTED_RUN_TIMES_UTC
    ]
    nominal = ", ".join(EXPECTED_RUN_TIMES_UTC)
    msg = f"All runs at the nominal times ({nominal} UTC)"
    if off_schedule:
        msg = f"{len(off_schedule)} run(s) off the nominal schedule: " + ", ".join(off_schedule)
    return Check(
        "run_times",
        _status(not off_schedule),
        msg,
        {
            "nominal_utc": list(EXPECTED_RUN_TIMES_UTC),
            "observed_utc": sorted({f"{t:%H:%M}" for t in fc.rows_per_run}),
            "off_schedule": off_schedule,
        },
    )


def check_forecast_values(fc: NormalizedForecasts) -> Check:
    ok = fc.null_values == 0 and fc.negative_values == 0
    msg = (
        "No null or negative forecast values"
        if ok
        else f"{fc.null_values} null and {fc.negative_values} negative forecast values"
    )
    return Check(
        "forecast_values",
        _status(ok),
        msg,
        {
            "raw_rows": fc.raw_rows,
            "duplicates_removed": fc.duplicates_removed,
            "null_values": fc.null_values,
            "negative_values": fc.negative_values,
            "dropped_negative_lead": fc.dropped_negative_lead,
            "dropped_outside_window": fc.dropped_outside_window,
        },
    )


def check_lead_range(fc: NormalizedForecasts) -> Check:
    """Invariant: every kept row has ``lead_h ≥ 0``. Leads are usually k + 0.5 h (runs at
    hh:30, targets on the hour); off-schedule runs produce other values, reported as info."""
    lead = fc.frame["lead_h"]
    off_grid = int(((lead - 0.5) % 1 != 0).sum())
    msg = f"Lead times {lead.min():g}–{lead.max():g} h"
    msg += (
        ", always k + 0.5 h"
        if off_grid == 0
        else f"; {off_grid} rows from off-schedule runs are not on the k + 0.5 h grid"
    )
    return Check(
        "lead_range",
        _status(bool(lead.min() >= 0)),
        msg,
        {"min_h": float(lead.min()), "max_h": float(lead.max()), "off_grid_rows": off_grid},
    )


def check_periods_per_day(ac: NormalizedActuals, settlement_days: Sequence[date]) -> Check:
    present = set(ac.frame["target_time"])
    unexpected: dict[str, dict[str, int]] = {}
    missing: list[str] = []
    for day in settlement_days:
        expected = delivery_day_targets(day, freq="30min")
        absent = [t for t in expected if t not in present]
        if absent:
            unexpected[day.isoformat()] = {
                "expected": len(expected),
                "present": len(expected) - len(absent),
            }
            missing.extend(utc_iso(t) for t in absent)
    msg = (
        f"All half-hourly periods present on {len(settlement_days)} settlement days"
        if not missing
        else f"{len(missing)} missing settlement period(s) on {len(unexpected)} day(s)"
    )
    return Check(
        "periods_per_day",
        _status(not missing),
        msg,
        {"unexpected": unexpected, "missing_periods": missing},
    )


def check_actual_values(ac: NormalizedActuals) -> Check:
    ok = ac.null_values == 0 and ac.negative_values == 0
    msg = (
        "No null or negative actual values"
        if ok
        else f"{ac.null_values} null and {ac.negative_values} negative actual values"
    )
    return Check(
        "actual_values",
        _status(ok),
        msg,
        {
            "raw_rows": ac.raw_rows,
            "duplicates_removed": ac.duplicates_removed,
            "null_values": ac.null_values,
            "negative_values": ac.negative_values,
            "dropped_outside_window": ac.dropped_outside_window,
        },
    )


def check_decision_coverage(
    fc: NormalizedForecasts, delivery_days: Sequence[date], preset: AuctionPreset
) -> Check:
    """For each delivery day: does the decision run (the latest published at or before the
    cutoff, exactly as the app selects it) cover every hour of the day?"""
    partial: dict[str, dict[str, Any]] = {}
    for day in delivery_days:
        run = select_decision_run(fc.frame, day, decision_cutoff_utc(day, preset.cutoff_local))
        hours = len(run.points)
        if run.partial:
            partial[day.isoformat()] = {
                "run": utc_iso(run.publish_time) if run.publish_time is not None else None,
                "hours": hours - len(run.missing_hours),
                "of": hours,
            }
    label = f"{preset.label} ({preset.cutoff_local:%H:%M})"
    msg = (
        f"{label}: the decision run covers all hours on every one of {len(delivery_days)} days"
        if not partial
        else f"{label}: {len(partial)} day(s) with partial decision coverage"
    )
    return Check(f"decision_coverage_{preset.id}", _status(not partial), msg, {"partial": partial})


def validate(
    forecasts: NormalizedForecasts,
    actuals: NormalizedActuals,
    *,
    publish_days: Sequence[date],
    settlement_days: Sequence[date],
    delivery_days: Sequence[date],
    auctions: Sequence[AuctionPreset],
) -> list[Check]:
    return [
        check_runs_per_day(forecasts, publish_days),
        check_rows_per_run(forecasts),
        check_run_times(forecasts),
        check_forecast_values(forecasts),
        check_lead_range(forecasts),
        check_periods_per_day(actuals, settlement_days),
        check_actual_values(actuals),
        *(check_decision_coverage(forecasts, delivery_days, p) for p in auctions),
    ]


def quality_report(checks: Sequence[Check], summary: dict[str, Any]) -> dict[str, Any]:
    """The ``quality.json`` document: overall status, every check, and a summary for the UI."""
    overall: Status = "ok" if all(c.status == "ok" for c in checks) else "warn"
    return {"status": overall, "summary": summary, "checks": [asdict(c) for c in checks]}
