import math

import numpy as np
import pandas as pd
import pytest

from winddesk.analytics.metrics import EMPTY_METRICS, compute_metrics

from ..conftest import D1, utc


def pairs(errors: list[float], actuals: list[float]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "target_time": [utc(D1, h) for h in range(len(errors))],
            "error_mw": errors,
            "actual_mw": actuals,
        }
    )


def test_hand_computed_metrics() -> None:
    # e = [300, −100, 200, −400], actual = [1000, 2000, 1500, 500] (Σ = 5000)
    m = compute_metrics(pairs([300, -100, 200, -400], [1000, 2000, 1500, 500]))
    assert m.n == 4
    assert m.mae_mw == 250  # (300 + 100 + 200 + 400) / 4
    assert m.rmse_mw == pytest.approx(math.sqrt(75_000))  # (9e4 + 1e4 + 4e4 + 16e4) / 4
    assert m.bias_mw == 0  # (300 − 100 + 200 − 400) / 4
    assert m.wape_pct == 20  # 100 × 1000 / 5000
    # |e| sorted = [100, 200, 300, 400]; linear quantile position = q × (n − 1)
    assert m.p50_abs_mw == 250  # position 1.5 → 200 + 0.5 × 100
    assert m.p90_abs_mw == pytest.approx(370)  # position 2.7 → 300 + 0.7 × 100
    assert m.p99_abs_mw == pytest.approx(397)  # position 2.97 → 300 + 0.97 × 100
    # e sorted = [−400, −100, 200, 300]; position 2.7 → 200 + 0.7 × 100
    assert m.p90_shortfall_mw == pytest.approx(270)
    assert m.max_shortfall_mw == 300
    assert m.max_shortfall_at == utc(D1, 0)


def test_no_pairs_gives_all_nulls() -> None:
    assert compute_metrics(pairs([], [])) == EMPTY_METRICS
    assert EMPTY_METRICS.n == 0 and EMPTY_METRICS.mae_mw is None


def test_only_surpluses_means_no_shortfall() -> None:
    m = compute_metrics(pairs([-50, -150], [1000, 1000]))
    assert m.p90_shortfall_mw == 0  # max(quantile, 0)
    assert m.max_shortfall_mw == 0
    assert m.max_shortfall_at is None
    assert m.bias_mw == -100


def test_rows_missing_either_value_are_ignored() -> None:
    m = compute_metrics(pairs([100, np.nan, 300], [1000, 1000, np.nan]))
    assert m.n == 1
    assert m.mae_mw == 100


def test_tied_largest_shortfall_reports_the_earliest_hour() -> None:
    df = pairs([500, 100, 500], [1000, 1000, 1000]).iloc[::-1]  # input order must not matter
    assert compute_metrics(df).max_shortfall_at == utc(D1, 0)


def test_wape_is_null_without_actual_energy() -> None:
    assert compute_metrics(pairs([10], [0])).wape_pct is None
