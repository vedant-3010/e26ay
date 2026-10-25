from datetime import date

import pandas as pd
import pytest

from winddesk.analytics.timeutil import UTC_DTYPE
from winddesk.ingest.client import IngestError
from winddesk.ingest.normalize import normalize_actuals, normalize_forecasts

from .fakes import fuelhh_day, windfor_day

FROM = pd.Timestamp("2026-01-01T00:00:00Z")
TO = pd.Timestamp("2026-02-02T00:00:00Z")


def wf(publish: str, target: str, mw: float | None) -> dict[str, object]:
    return {"publishTime": publish, "startTime": target, "generation": mw}


class TestForecasts:
    def test_full_day_counts_73_rows_per_run_before_filtering(self) -> None:
        out = normalize_forecasts(windfor_day(date(2026, 1, 5)), FROM, TO)
        assert len(out.rows_per_run) == 8
        assert set(out.rows_per_run.values()) == {73}
        # Each run starts at 4 Jan 21:00: the 02:30 run has 6 past hours (21:00…02:00),
        # the 22:30 run has 26 (21:00 on 4 Jan … 22:00 on 5 Jan).
        assert out.dropped_negative_lead == 6 + 8 + 11 + 13 + 15 + 19 + 22 + 26
        assert len(out.frame) == 8 * 73 - out.dropped_negative_lead

    def test_columns_dtypes_and_lead(self) -> None:
        out = normalize_forecasts(
            [wf("2026-01-05T07:30:00Z", "2026-01-06T00:00:00Z", 12000)], FROM, TO
        )
        df = out.frame
        assert list(df.columns) == ["publish_time", "target_time", "forecast_mw", "lead_h"]
        assert str(df["publish_time"].dtype) == UTC_DTYPE
        assert str(df["target_time"].dtype) == UTC_DTYPE
        assert df["forecast_mw"].dtype == "float64"
        assert df["lead_h"].iloc[0] == 16.5  # 00:00 next day − 07:30 = 16.5 h

    def test_exact_duplicates_keep_the_last_record(self) -> None:
        records = [
            wf("2026-01-05T07:30:00Z", "2026-01-06T00:00:00Z", 100),
            wf("2026-01-05T07:30:00Z", "2026-01-06T00:00:00Z", 200),
        ]
        out = normalize_forecasts(records, FROM, TO)
        assert out.duplicates_removed == 1
        assert out.frame["forecast_mw"].tolist() == [200.0]

    def test_negative_lead_and_out_of_window_rows_are_dropped(self) -> None:
        records = [
            wf("2026-01-05T07:30:00Z", "2026-01-05T07:00:00Z", 1),  # lead −0.5 h
            wf("2025-12-30T22:30:00Z", "2025-12-31T23:00:00Z", 2),  # before the window
            wf("2026-02-01T22:30:00Z", "2026-02-02T00:00:00Z", 3),  # window end is exclusive
            wf("2026-01-05T07:30:00Z", "2026-01-05T08:00:00Z", 4),  # kept, lead 0.5 h
        ]
        out = normalize_forecasts(records, FROM, TO)
        assert out.dropped_negative_lead == 1
        assert out.dropped_outside_window == 2
        assert out.frame["forecast_mw"].tolist() == [4.0]

    def test_nulls_are_dropped_and_counted_never_filled(self) -> None:
        records = [
            wf("2026-01-05T07:30:00Z", "2026-01-06T00:00:00Z", None),
            wf("2026-01-05T07:30:00Z", "2026-01-06T01:00:00Z", -5),
        ]
        out = normalize_forecasts(records, FROM, TO)
        assert out.null_values == 1
        assert out.negative_values == 1  # reported, not altered
        assert out.frame["forecast_mw"].tolist() == [-5.0]

    def test_output_is_sorted_by_run_then_target(self) -> None:
        records = list(reversed(windfor_day(date(2026, 1, 5))))
        df = normalize_forecasts(records, FROM, TO).frame
        assert df.equals(df.sort_values(["publish_time", "target_time"]).reset_index(drop=True))

    def test_schema_mismatch_and_empty_input_are_structural_errors(self) -> None:
        with pytest.raises(IngestError, match="missing fields"):
            normalize_forecasts([{"publishTime": "x"}], FROM, TO)
        with pytest.raises(IngestError, match="no records"):
            normalize_forecasts([], FROM, TO)


class TestActuals:
    def test_one_row_per_half_hour_with_typed_columns(self) -> None:
        out = normalize_actuals(fuelhh_day(date(2026, 1, 5)), FROM, TO)
        df = out.frame
        assert list(df.columns) == [
            "target_time",
            "actual_mw",
            "settlement_date",
            "settlement_period",
        ]
        assert len(df) == 48
        assert str(df["target_time"].dtype) == UTC_DTYPE
        assert df["settlement_period"].dtype == "int16"
        assert df["target_time"].is_monotonic_increasing
        assert df["actual_mw"].iloc[0] == 9001.0  # period 1

    def test_duplicate_period_keeps_latest_publication(self) -> None:
        base = {
            "startTime": "2026-01-05T00:00:00Z",
            "settlementDate": "2026-01-05",
            "settlementPeriod": 1,
        }
        records = [
            {**base, "publishTime": "2026-01-05T01:00:00Z", "generation": 2},  # revision
            {**base, "publishTime": "2026-01-05T00:30:00Z", "generation": 1},
        ]
        out = normalize_actuals(records, FROM, TO)
        assert out.duplicates_removed == 1
        assert out.frame["actual_mw"].tolist() == [2.0]

    def test_window_and_nulls(self) -> None:
        records = [
            *fuelhh_day(date(2025, 12, 31)),
            *fuelhh_day(date(2026, 1, 1)),
        ]
        records[0] = {**records[0], "generation": None}  # a 31 Dec period, then out of window
        records[-1] = {**records[-1], "generation": None}  # 1 Jan period 1
        out = normalize_actuals(records, FROM, TO)
        assert out.null_values == 2
        assert out.dropped_outside_window == 47
        assert len(out.frame) == 47
