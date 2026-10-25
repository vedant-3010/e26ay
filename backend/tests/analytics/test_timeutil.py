from datetime import UTC, date, datetime, time

import pandas as pd
import pytest

from winddesk.analytics.timeutil import (
    UTC_DTYPE,
    as_utc,
    decision_cutoff_utc,
    delivery_day_targets,
    delivery_days,
    to_uk_label,
    uk_date,
    uk_hour,
    utc_iso,
)


class TestDecisionCutoff:
    def test_gmt_date_is_unchanged(self) -> None:
        # January is GMT: 09:20 UK on 14 Jan = 09:20 UTC.
        assert decision_cutoff_utc(date(2026, 1, 15), time(9, 20)) == pd.Timestamp(
            "2026-01-14T09:20:00Z"
        )

    def test_bst_date_is_one_hour_earlier_in_utc(self) -> None:
        # DATA §7.4: 2026-06-15 09:20 BST → 08:20 UTC (delivery day 16 Jun).
        assert decision_cutoff_utc(date(2026, 6, 16), time(9, 20)) == pd.Timestamp(
            "2026-06-15T08:20:00Z"
        )

    def test_is_on_the_day_before_delivery(self) -> None:
        cutoff = decision_cutoff_utc(date(2026, 2, 1), time(9, 50))
        assert cutoff == pd.Timestamp("2026-01-31T09:50:00Z")

    def test_unit_is_ns(self) -> None:
        assert decision_cutoff_utc(date(2026, 1, 15), time(9, 20)).unit == "ns"


class TestDeliveryDayTargets:
    def test_gmt_day_has_24_hours_from_midnight_utc(self) -> None:
        t = delivery_day_targets(date(2026, 1, 15))
        assert len(t) == 24
        assert t[0] == pd.Timestamp("2026-01-15T00:00:00Z")
        assert t[-1] == pd.Timestamp("2026-01-15T23:00:00Z")
        assert str(t.dtype) == UTC_DTYPE

    def test_half_hourly_gives_48_settlement_periods(self) -> None:
        t = delivery_day_targets(date(2026, 1, 15), freq="30min")
        assert len(t) == 48
        assert t[-1] == pd.Timestamp("2026-01-15T23:30:00Z")

    def test_bst_day_starts_at_2300_utc_the_day_before(self) -> None:
        t = delivery_day_targets(date(2026, 6, 16))
        assert len(t) == 24
        assert t[0] == pd.Timestamp("2026-06-15T23:00:00Z")

    def test_clock_change_days(self) -> None:
        # 2026-03-29: clocks go forward (23 h); 2026-10-25: clocks go back (25 h).
        assert len(delivery_day_targets(date(2026, 3, 29))) == 23
        assert len(delivery_day_targets(date(2026, 10, 25))) == 25
        assert len(delivery_day_targets(date(2026, 3, 29), freq="30min")) == 46
        assert len(delivery_day_targets(date(2026, 10, 25), freq="30min")) == 50


class TestAsUtc:
    def test_parses_z_strings_to_ns_utc(self) -> None:
        s = as_utc(["2026-01-05T02:30:00Z", "2026-01-05T04:30:00Z"])
        assert str(s.dtype) == UTC_DTYPE
        assert s.iloc[0] == pd.Timestamp("2026-01-05T02:30:00Z")

    def test_converts_offsets_to_utc(self) -> None:
        assert as_utc(["2026-06-15T09:20:00+01:00"]).iloc[0] == pd.Timestamp("2026-06-15T08:20:00Z")

    def test_normalises_microsecond_unit(self) -> None:
        us = pd.Series(pd.to_datetime(["2026-01-05T02:30:00Z"], utc=True)).astype(
            "datetime64[us, UTC]"
        )
        assert str(as_utc(us).dtype) == UTC_DTYPE

    def test_rejects_naive_datetimes(self) -> None:
        naive = pd.Series(pd.to_datetime(["2026-01-05 02:30"]))
        with pytest.raises(ValueError, match="naive"):
            as_utc(naive)


def test_delivery_days_inclusive() -> None:
    days = delivery_days(date(2026, 1, 30), date(2026, 2, 1))
    assert days == [date(2026, 1, 30), date(2026, 1, 31), date(2026, 2, 1)]


def test_uk_date_and_hour_follow_london_time() -> None:
    # 23:30 UTC on 15 Jun is 00:30 BST on 16 Jun.
    s = as_utc(["2026-06-15T23:30:00Z", "2026-01-15T23:30:00Z"])
    assert list(uk_date(s)) == [date(2026, 6, 16), date(2026, 1, 15)]
    assert list(uk_hour(s)) == [0, 23]


def test_labels() -> None:
    ts = pd.Timestamp("2026-01-15T18:00:00Z")
    assert to_uk_label(ts) == "Thu 15 Jan 18:00"
    assert to_uk_label(ts, with_time=False) == "Thu 15 Jan"
    assert to_uk_label(datetime(2026, 6, 15, 8, 20, tzinfo=UTC)) == "Mon 15 Jun 09:20"
    assert utc_iso(pd.Timestamp("2026-01-15T09:00:00+00:00")) == "2026-01-15T09:00:00Z"
