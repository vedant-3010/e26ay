from datetime import date, time

import pandas as pd

from winddesk.analytics.pilot import AUCTIONS
from winddesk.ingest.normalize import normalize_actuals, normalize_forecasts
from winddesk.ingest.validate import Check, quality_report, validate

from .fakes import RUN_TIMES_UTC, fuelhh_day, windfor_day

FROM = pd.Timestamp("2026-01-01T00:00:00Z")
TO = pd.Timestamp("2026-02-02T00:00:00Z")
PUBLISH_DAYS = [date(2026, 1, 13), date(2026, 1, 14)]
SETTLEMENT_DAYS = [date(2026, 1, 14), date(2026, 1, 15)]
DELIVERY_DAYS = [date(2026, 1, 15)]


def run_checks(wf: list[dict[str, object]], fh: list[dict[str, object]]) -> dict[str, Check]:
    checks = validate(
        normalize_forecasts(wf, FROM, TO),
        normalize_actuals(fh, FROM, TO),
        publish_days=PUBLISH_DAYS,
        settlement_days=SETTLEMENT_DAYS,
        delivery_days=DELIVERY_DAYS,
        auctions=AUCTIONS,
    )
    return {c.id: c for c in checks}


def full_windfor() -> list[dict[str, object]]:
    return [r for d in PUBLISH_DAYS for r in windfor_day(d)]


def full_fuelhh() -> list[dict[str, object]]:
    return [r for d in SETTLEMENT_DAYS for r in fuelhh_day(d)]


def test_clean_data_passes_every_check() -> None:
    checks = run_checks(full_windfor(), full_fuelhh())
    assert {c.status for c in checks.values()} == {"ok"}
    assert set(checks) == {
        "runs_per_day",
        "rows_per_run",
        "run_times",
        "forecast_values",
        "lead_range",
        "periods_per_day",
        "actual_values",
        "decision_coverage_epex",
        "decision_coverage_n2ex",
    }
    assert checks["lead_range"].details["off_grid_rows"] == 0
    assert checks["run_times"].details["off_schedule"] == []
    report = quality_report(list(checks.values()), {"rows": 1})
    assert report["status"] == "ok"
    assert report["summary"] == {"rows": 1}


def test_missing_run_is_a_warning_and_named() -> None:
    wf = [r for r in full_windfor() if r["publishTime"] != "2026-01-13T11:30:00Z"]
    checks = run_checks(wf, full_fuelhh())
    assert checks["runs_per_day"].status == "warn"
    assert checks["runs_per_day"].details["unexpected"] == {"2026-01-13": 7}
    # The run times themselves are still the usual eight (other days have 11:30).
    assert checks["run_times"].status == "ok"


def test_short_run_and_off_schedule_run_are_flagged() -> None:
    odd = windfor_day(date(2026, 1, 14), run_times=(*RUN_TIMES_UTC, time(13, 30)))
    wf = [r for d in PUBLISH_DAYS[:1] for r in windfor_day(d)] + odd[:-1]  # drop 1 point
    checks = run_checks(wf, full_fuelhh())
    assert checks["run_times"].status == "warn"
    assert checks["run_times"].details["off_schedule"] == ["2026-01-14T13:30:00Z"]
    assert checks["rows_per_run"].details["unexpected"] == {"2026-01-14T13:30:00Z": 72}
    assert checks["runs_per_day"].details["unexpected"] == {"2026-01-14": 9}


def test_late_run_keeps_lead_invariant_but_reports_off_grid_leads() -> None:
    # Like 15 Jan 2026: the 11:30 run published at 12:25 (leads k + 35/60 h).
    late = tuple(time(12, 25) if t == time(11, 30) else t for t in RUN_TIMES_UTC)
    wf = [r for r in windfor_day(PUBLISH_DAYS[0])] + windfor_day(PUBLISH_DAYS[1], run_times=late)
    checks = run_checks(wf, full_fuelhh())
    assert checks["runs_per_day"].status == "ok"  # still 8 runs that day
    assert checks["run_times"].details["off_schedule"] == ["2026-01-14T12:25:00Z"]
    lead = checks["lead_range"]
    assert lead.status == "ok"  # lead ≥ 0 holds
    # 73 points from 13 Jan 21:00; 16 are at or before 12:00 (lead < 0), 57 kept.
    assert lead.details["off_grid_rows"] == 57
    assert "57 rows from off-schedule runs" in lead.message


def test_missing_settlement_period_is_listed() -> None:
    fh = [r for r in full_fuelhh() if r["startTime"] != "2026-01-15T17:30:00Z"]
    checks = run_checks(full_windfor(), fh)
    check = checks["periods_per_day"]
    assert check.status == "warn"
    assert check.details["missing_periods"] == ["2026-01-15T17:30:00Z"]
    assert check.details["unexpected"] == {"2026-01-15": {"expected": 48, "present": 47}}


def test_partial_decision_run_is_reported_per_auction() -> None:
    # EPEX (09:20) uses the 14 Jan 07:30 run. Remove its 23:00 point for 15 Jan.
    wf = [
        r
        for r in full_windfor()
        if not (
            r["publishTime"] == "2026-01-14T07:30:00Z" and r["startTime"] == "2026-01-15T23:00:00Z"
        )
    ]
    checks = run_checks(wf, full_fuelhh())
    epex = checks["decision_coverage_epex"]
    assert epex.status == "warn"
    assert epex.details["partial"] == {
        "2026-01-15": {"run": "2026-01-14T07:30:00Z", "hours": 23, "of": 24}
    }
    # N2EX (09:50) uses the 09:30 run, which is complete: no substitution, no warning.
    assert checks["decision_coverage_n2ex"].status == "ok"


def test_no_eligible_run_means_zero_coverage() -> None:
    wf = [r for r in windfor_day(date(2026, 1, 14)) if r["publishTime"] > "2026-01-14T09:50:00Z"]
    checks = run_checks(wf, full_fuelhh())
    assert checks["decision_coverage_epex"].details["partial"] == {
        "2026-01-15": {"run": None, "hours": 0, "of": 24}
    }
