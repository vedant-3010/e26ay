"""Pydantic v2 response models: the API contract (API.md). The TypeScript client is generated from
these via OpenAPI (`make gen-api`), so field names, units and descriptions here are the contract.

Conventions: snake_case with the unit in the name; timestamps are UTC ISO-8601 with ``Z``; dates are
UK delivery/settlement days; floats are rounded to 1 decimal here, at the boundary; missing values
are ``null`` and never omitted.
"""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _round1(value: float) -> float:
    return round(value, 1)


#: A float rounded to 1 decimal at the API boundary.
R1 = Annotated[float, AfterValidator(_round1)]

AuctionId = Literal["epex", "n2ex"]
CheckStatus = Literal["ok", "warn"]


class Schema(BaseModel):
    model_config = ConfigDict(frozen=True)


# ---------------------------------------------------------------- shared


class Metrics(Schema):
    """Error metrics over a set of forecast/actual pairs. ``error = forecast − actual``. All fields
    except ``n`` are null when ``n = 0``."""

    n: int = Field(description="Pairs with both a forecast and an actual.", examples=[744])
    mae_mw: R1 | None = Field(description="Mean absolute error (MW).", examples=[2021.9])
    rmse_mw: R1 | None = Field(description="Root mean squared error (MW).")
    bias_mw: R1 | None = Field(description="Mean error (MW); positive = over-forecast.")
    wape_pct: R1 | None = Field(description="100 × Σ|error| / Σ actual (%).")
    p50_abs_mw: R1 | None = Field(description="Median absolute error (MW).")
    p90_abs_mw: R1 | None = Field(description="90th percentile of absolute error (MW).")
    p99_abs_mw: R1 | None = Field(description="99th percentile of absolute error (MW).")
    p90_shortfall_mw: R1 | None = Field(
        description="max(90th percentile of error, 0): the shortfall covered in 90% of hours (MW)."
    )
    max_shortfall_mw: R1 | None = Field(description="Largest over-forecast, floored at 0 (MW).")
    max_shortfall_at: datetime | None = Field(description="Target time of the largest shortfall.")


class TimeValue(Schema):
    t: datetime = Field(description="Target time (UTC).")
    mw: R1 | None = Field(description="Power (MW); null = no value.")


class ErrorBody(Schema):
    code: str = Field(examples=["invalid_params"])
    message: str
    details: list[dict[str, object]] = Field(default_factory=list)


class ErrorResponse(Schema):
    error: ErrorBody


# ---------------------------------------------------------------- /health


class HealthResponse(Schema):
    status: Literal["ok"] = Field(description="Always `ok` when the app is serving.")
    snapshot_id: str | None = Field(
        description="First 12 hex chars of the snapshot hash; `null` before the first ingest.",
        examples=["ac22a4140bca"],
    )
    git_sha: str | None = Field(
        description="Deployed commit (`VERCEL_GIT_COMMIT_SHA` or `GIT_SHA`).", examples=["abc1234"]
    )
    version: str = Field(description="WindDesk version.", examples=["1.0.0"])


# ---------------------------------------------------------------- /meta


class SnapshotInfo(Schema):
    id: str
    created_at: datetime


class Bounds(Schema):
    target_from: datetime = Field(description="First target time in the data (inclusive).")
    target_to: datetime = Field(
        description="End of the data (exclusive): Monitor `end` may be at most this."
    )
    delivery_from: date = Field(description="First in-scope delivery day.")
    delivery_to: date = Field(description="Last in-scope delivery day (inclusive).")


class ForecastRuns(Schema):
    count: int
    run_times_utc: list[str] = Field(
        description="Nominal publish schedule (HH:MM UTC).", examples=[["02:30", "04:30"]]
    )
    off_schedule: list[datetime] = Field(
        description="Runs published outside the nominal schedule (kept as published)."
    )


class RowCounts(Schema):
    actuals: int
    forecasts: int


class Auction(Schema):
    id: AuctionId
    label: str = Field(examples=["EPEX SPOT GB Day-Ahead"])
    cutoff_local: str = Field(
        description="Gate closure on D−1, UK time (HH:MM).", examples=["09:20"]
    )


class Horizon(Schema):
    min_h: float
    max_h: float
    step_h: float
    default_h: float


class Defaults(Schema):
    delivery_date: date
    auction: AuctionId
    confidence: float
    monitor_start: datetime
    monitor_end: datetime


class QualityCheck(Schema):
    id: str
    status: CheckStatus
    message: str


class QualitySummary(Schema):
    forecast_runs: int
    forecast_rows: int
    forecast_duplicates_removed: int
    actual_rows: int
    actual_duplicates_removed: int
    missing_periods: int


class Quality(Schema):
    status: CheckStatus
    summary: QualitySummary
    checks: list[QualityCheck]


class MetaResponse(Schema):
    product: Literal["WindDesk"]
    snapshot: SnapshotInfo
    bounds: Bounds
    forecast_runs: ForecastRuns
    rows: RowCounts
    auctions: list[Auction]
    confidences: list[float] = Field(examples=[[0.8, 0.9, 0.95]])
    horizon: Horizon
    defaults: Defaults
    quality: Quality
    live_enabled: bool = Field(
        description="True when GET /api/live is switched on (WINDDESK_ENABLE_LIVE)."
    )


# ---------------------------------------------------------------- /monitor


class MonitorParams(Schema):
    start: datetime
    end: datetime
    horizon_h: float


class MonitorForecastPoint(Schema):
    t: datetime = Field(description="Hourly target time (UTC).")
    mw: R1 | None = Field(description="Forecast (MW); null when no run qualifies at this horizon.")
    publish_time: datetime | None = Field(description="Publish time of the run used.")
    lead_h: float | None = Field(description="Exact lead time of the value used (h), ≥ horizon_h.")


class Coverage(Schema):
    target_hours: int
    with_forecast: int
    pct: R1 | None


class MonitorResponse(Schema):
    params: MonitorParams
    actual: list[TimeValue] = Field(description="Half-hourly actuals in [start, end).")
    forecast: list[MonitorForecastPoint] = Field(description="One entry per hourly target.")
    metrics: Metrics
    coverage: Coverage


# ---------------------------------------------------------------- /decision


class Cutoff(Schema):
    local: str = Field(description="Gate closure, UK time (HH:MM) on D−1.", examples=["09:20"])
    utc: datetime
    auction: Literal["epex", "n2ex", "custom"]


class DecisionRunInfo(Schema):
    publish_time: datetime | None = Field(
        description="The run used: the latest published at or before the cutoff."
    )
    lead_min_h: float | None
    lead_max_h: float | None
    partial: bool = Field(description="True when the run leaves some hours of the day uncovered.")
    missing_hours: list[datetime] = Field(description="Hours shown as gaps (never substituted).")


class DecisionForecastPoint(Schema):
    t: datetime
    mw: R1 | None = Field(description="Decision-run forecast (MW).")
    firm_mw: R1 | None = Field(description="Firm wind at the chosen confidence (MW).")
    lead_h: float | None


class DecisionKpis(Schema):
    forecast_mwh: R1 | None = Field(description="Forecast energy for the day; null if partial.")
    actual_mwh: R1 | None = Field(description="Actual energy for the day (MWh).")
    energy_error_pct: R1 | None = Field(
        description="100 × (forecast − actual) / forecast energy; positive = shortfall."
    )
    avg_firm_mw: R1 | None
    avg_buffer_mw: R1 | None
    mae_mw: R1 | None
    bias_mw: R1 | None
    max_shortfall_mw: R1 | None
    max_shortfall_at: datetime | None
    firm_hours_kept: int = Field(description="Hours where actual ≥ firm wind.")
    firm_hours_total: int


class BufferBin(Schema):
    forecast_from_mw: R1
    forecast_to_mw: R1 | None = Field(description="null = open-ended (highest bin).")
    buffer_mw: R1
    n: int = Field(description="Training hours (other days) in the bin.")
    fallback: bool = Field(description="True when n < 30 and the flat buffer is used instead.")


class Buffers(Schema):
    method: Literal["simple_lodo", "conditional_lodo"]
    confidence: float
    simple_buffer_mw: R1 = Field(description="The flat leave-one-day-out buffer (MW).")
    bins: list[BufferBin]


class VintagePoint(Schema):
    t: datetime
    mw: R1


class Vintage(Schema):
    publish_time: datetime
    is_decision_run: bool
    after_cutoff: bool = Field(description="Published after the cutoff: not available at decision.")
    points: list[VintagePoint]


class DecisionResponse(Schema):
    delivery_date: date
    cutoff: Cutoff
    run: DecisionRunInfo
    forecast: list[DecisionForecastPoint]
    actual: list[TimeValue] = Field(description="Half-hourly actuals (shown in Hindsight only).")
    kpis: DecisionKpis
    buffers: Buffers
    vintages: list[Vintage]
    summary: str = Field(description="Templated summary including the outcome (Hindsight view).")
    summary_trader: str = Field(description="The same summary without any outcome (Trader view).")


# ---------------------------------------------------------------- /live (Could, PRD F8)


class LiveInfo(Schema):
    fetched_at: datetime = Field(description="When the runs were fetched from Elexon (UTC).")
    ttl_s: int = Field(description="Fetched runs are reused for this long (seconds).")
    calibration_snapshot_id: str = Field(
        description="The pilot snapshot whose decision pairs the buffers are fitted on."
    )


class LiveResponse(DecisionResponse):
    """Tomorrow (UK) as of the fetch time, in the decision shape: ``cutoff`` is the fetch time on
    D−1 floored to 15 minutes, ``actual`` is empty and every outcome field is null."""

    live: LiveInfo


# ---------------------------------------------------------------- /accuracy


class AccuracyParams(Schema):
    population: Literal["decision", "horizon"]
    auction: AuctionId
    horizon_h: float
    start: date
    end: date
    confidence: float


class LeadBin(Schema):
    lead_h: float = Field(description="Bin midpoint (h); bins are [lead_h − 0.5, lead_h + 0.5).")
    n: int
    mae_mw: R1 | None
    rmse_mw: R1 | None
    bias_mw: R1 | None
    p50_abs_mw: R1 | None
    p90_abs_mw: R1 | None
    p99_abs_mw: R1 | None


class Distribution(Schema):
    bin_edges_mw: list[float]
    counts: list[int]
    p10_mw: R1 | None
    p50_mw: R1 | None
    p90_mw: R1 | None


class HourStats(Schema):
    hour_uk: int
    n: int
    mae_mw: R1 | None
    bias_mw: R1 | None
    p90_shortfall_mw: R1 | None


class LevelStats(Schema):
    forecast_from_mw: R1
    forecast_to_mw: R1 | None
    n: int
    mae_mw: R1 | None
    bias_mw: R1 | None
    p80_shortfall_mw: R1 | None
    p90_shortfall_mw: R1 | None
    p95_shortfall_mw: R1 | None
    achieved_pct: R1 | None = Field(
        description="LODO firm-wind coverage in the bin (decision only)."
    )


class Calibration(Schema):
    target_pct: R1
    achieved_pct: R1 | None
    method: Literal["simple_lodo", "conditional_lodo"]


class DailyStats(Schema):
    delivery_date: date
    mae_mw: R1 | None
    bias_mw: R1 | None
    max_shortfall_mw: R1 | None


class WorstHour(Schema):
    t: datetime
    delivery_date: date
    forecast_mw: R1
    actual_mw: R1
    error_mw: R1
    publish_time: datetime
    lead_h: float


class AuctionComparison(Schema):
    epex: Metrics
    n2ex: Metrics
    mae_change_pct: R1 | None = Field(description="100 × (MAE_n2ex − MAE_epex) / MAE_epex.")


class ForecastValue(Schema):
    confidence: float
    unconditional_firm_mw: R1 | None = Field(
        description="P(1 − c) of actual: firm with no forecast."
    )
    avg_forecast_firm_mw: R1 | None = Field(description="Mean LODO firm wind with the forecast.")
    gain_mw: R1 | None


class AccuracyResponse(Schema):
    params: AccuracyParams
    headline: Metrics
    takeaways: list[str]
    lead_curve: list[LeadBin] = Field(
        description="Error by actual lead time over all pairs (1 h bins)."
    )
    decision_lead_window_h: list[float] | None = Field(
        description="[min, max] lead of the selected population, e.g. [16.5, 39.5]."
    )
    distribution: Distribution
    by_hour: list[HourStats]
    by_level: list[LevelStats]
    calibration: Calibration | None = Field(description="Decision population only.")
    daily: list[DailyStats]
    worst: list[WorstHour]
    auction_comparison: AuctionComparison
    forecast_value: ForecastValue | None = Field(description="Decision population only.")
