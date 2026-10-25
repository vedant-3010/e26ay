# WindDesk — Data & Analytics Specification

This is the source of truth for ingestion, data contracts, selection logic, metrics and analytics tests. If code and this doc disagree, fix one of them and log it in `PROGRESS.md`.

---

## 1. Sources (probed live on 2026-10-25)

Base URL: `https://data.elexon.co.uk/bmrs/api/v1` (public, no API key).

### 1.1 Actuals — `FUELHH` (fuelType = WIND)

```
GET /datasets/FUELHH/stream?settlementDateFrom=2026-01-05&settlementDateTo=2026-01-05&fuelType=WIND
```

Observed response: a **JSON array** of records (no `data` wrapper), newest first.

| Field | Example | Notes |
|---|---|---|
| `dataset` | `"FUELHH"` | |
| `publishTime` | `"2026-01-06T00:00:00Z"` | = startTime + 30 min |
| `startTime` | `"2026-01-05T23:30:00Z"` | **target time**, half-hourly |
| `settlementDate` | `"2026-01-05"` | UK settlement day |
| `settlementPeriod` | `48` | 1–48 (46/50 on clock-change days) |
| `fuelType` | `"WIND"` | |
| `generation` | `6100` | MW, average over the half-hour |

48 records per settlement day.

### 1.2 Forecasts — `WINDFOR`

```
GET /datasets/WINDFOR/stream?publishDateTimeFrom=2026-01-05T09:00:00Z&publishDateTimeTo=2026-01-05T10:00:00Z
```

Observed response: JSON array. Sample record:
`{"dataset":"WINDFOR","publishTime":"2026-01-05T09:30:00Z","startTime":"2026-01-07T21:00:00Z","generation":8009}`

Observed behaviour (on 5 Jan and 14 Jan 2026):

- **Resolution:** hourly (`startTime` on the hour).
- **Cadence:** 8 runs per day, published at **02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC**.
- **Window:** every run published on calendar day P contains **73 hourly points from (P−1) 21:00 to (P+2) 21:00 UTC**. This window includes hours already in the past at publish time, which are dropped (lead < 0).
- Consequences:
  - Max lead time of a run = (P+2) 21:00 − publish time: 66.5 h for the 02:30 run, 46.5 h for the 22:30 run.
  - Lead times are always **k + 0.5 h**, because runs publish at :30 and targets are on the hour.
  - A run published on D−1 covers the whole of delivery day D.

> ⚠️ These are observations from two sample days. **Phase 1 must assert them across the whole pilot window** (data-contract tests) and update this section if anything differs, for example a missing run or a different count.

### 1.3 Coverage note
Both datasets are national-level wind as published by Elexon. FUELHH reports transmission-metered generation, so embedded (distribution-connected) wind is not visible. Confirm against Elexon's dataset descriptions and state it on the Methodology page.

---

## 2. Pilot window (exact)

| Item | Value |
|---|---|
| Decision days | 2026-01-01 … 2026-01-31 (UK) |
| **Delivery days (in scope)** | **2026-01-02 … 2026-02-01** (UK settlement days) |
| Target-time range kept | `[2026-01-01T00:00Z, 2026-02-02T00:00Z)`; 1 Jan is included for Monitor context only |
| FUELHH fetch | settlementDate 2026-01-01 … 2026-02-01 |
| WINDFOR fetch | publishTime `[2025-12-30T00:00Z, 2026-02-02T00:00Z)` (Dec 30 runs give 48 h leads into 1 Jan) |
| Timezone | January is GMT, so UK local = UTC. **Code must still convert properly** (tested with a BST date). |

Decision cutoff presets (gate closure on D−1, UK local time):

| id | Label | Cutoff | Run used (expected) | Lead range for day D |
|---|---|---|---|---|
| `epex` (default) | EPEX SPOT GB Day-Ahead | 09:20 | D−1 07:30 | 16.5 – 39.5 h |
| `n2ex` | Nord Pool N2EX Day-Ahead | 09:50 | D−1 09:30 | 14.5 – 37.5 h |
| `custom` | Custom | HH:MM (15-min steps) | latest run ≤ cutoff | varies |

Note that the 09:30 run lands between the two gate closures. N2EX bidders get a forecast two hours fresher, and the app can quantify that difference (PRD F3.10).

---

## 3. Ingestion

Module `winddesk.ingest`, run via CLI: `uv run python -m winddesk.ingest --start 2025-12-30 --end 2026-02-01` (wrapped by `make ingest`). Add `--offline` to rebuild from the raw cache without network access.

1. **Fetch** in daily chunks: WINDFOR by publish window `[day 00:00Z, day+1 00:00Z)`; FUELHH by settlement date, 7 days per request. Use `httpx` with a 30 s timeout. Retry on 429/5xx/timeouts with backoff of 1, 2, 4 and 8 s. At most 4 concurrent requests. User-Agent `WindDesk-pilot/1.0`.
2. **Raw cache:** write each response verbatim to `data/raw/{dataset}/{chunk}.json` (gitignored). Re-runs reuse the cache unless `--refresh` is passed.
3. **Parse** both an array response and a `{"data": [...]}` response defensively.
4. **Normalize** into the canonical tables (§4). Parse every timestamp as tz-aware UTC.
5. **Clean:**
   - Forecasts: drop exact duplicates on (`publish_time`, `target_time`), keeping the last. Drop `lead_h < 0`. Keep target times inside the window.
   - Actuals: for duplicate `target_time`, keep the row with the latest `publishTime`. Keep the window.
   - Never fill or interpolate missing values. Gaps stay gaps and are reported.
6. **Validate** and write `data/snapshot/quality.json`:
   - Forecasts: runs per publish day (expect 8), rows per run before the lead filter (expect 73), the set of run times, duplicates removed, null/negative values, min/max lead.
   - Actuals: periods per settlement day (expect 48), a list of missing periods, duplicates removed, null/negative values.
   - Coverage: for every delivery day and each preset, whether the decision run covers all 24 hours.
   - Status `ok` / `warn` per check. Ingest fails only on structural errors (schema mismatch, empty dataset).
7. **Write** `data/snapshot/actuals.parquet`, `data/snapshot/forecasts.parquet`, and `data/snapshot/manifest.json`. The manifest contains `snapshot_id` (first 12 hex chars of the sha256 over both parquet files), `created_at`, fetch parameters, row counts, and the source URLs.

The snapshot (well under 1 MB) **is committed to git**. This keeps the demo deterministic, makes it work offline, and avoids calling Elexon at request time. See ADR-0001.

---

## 4. Canonical tables

All timestamps are `datetime64[ns, UTC]`. Ensure every timestamp column uses the **same unit and timezone** before any `merge_asof` (pandas raises otherwise).

**actuals**
| column | dtype | note |
|---|---|---|
| `target_time` | datetime UTC | half-hour start |
| `actual_mw` | float64 | |
| `settlement_date` | date (string `YYYY-MM-DD` in parquet is fine) | |
| `settlement_period` | int16 | |

**forecasts**
| column | dtype | note |
|---|---|---|
| `publish_time` | datetime UTC | run id |
| `target_time` | datetime UTC | on the hour |
| `forecast_mw` | float64 | |
| `lead_h` | float64 | `(target_time − publish_time)` in hours, ≥ 0 |

**pairs** (derived when the data loads, in memory)
`forecasts ⋈ actuals` on `target_time` (inner), plus:
`error_mw = forecast_mw − actual_mw`, `abs_error_mw`, `delivery_date` (UK local date of target_time), `hour_uk`.

**Alignment policy (ADR-0004):** forecast hour H is compared with the settlement period **starting** at H, which is a direct `startTime` join, as the brief implies. The notebook reports a sensitivity check that compares against the mean of the two periods in hour H instead. If the conclusions change materially, raise it in `PROGRESS.md`.

---

## 5. Algorithms

Everything here lives in `winddesk/analytics/` as **pure functions** (DataFrames in, DataFrames or dataclasses out, no I/O). Each has unit tests (§7).

### 5.1 Selection at a fixed horizon (Monitor and the "fixed horizon" population)

For each target hour `t`, use the **latest forecast with `publish_time ≤ t − H`**.

```python
def select_at_horizon(forecasts: pd.DataFrame, targets: pd.Series, horizon_h: float) -> pd.DataFrame:
    left = pd.DataFrame({"target_time": targets})
    left["cutoff"] = left["target_time"] - pd.to_timedelta(horizon_h, unit="h")
    left = left.sort_values("cutoff")
    right = forecasts.sort_values("publish_time")[["target_time", "publish_time", "forecast_mw"]]
    out = pd.merge_asof(
        left, right,
        left_on="cutoff", right_on="publish_time",
        by="target_time", direction="backward", allow_exact_matches=True,
    )
    out["lead_h"] = (out["target_time"] - out["publish_time"]).dt.total_seconds() / 3600
    return out.sort_values("target_time").reset_index(drop=True)
```

- Targets are the hourly target times in the requested range (`minute == 0`).
- Invariant: when a forecast exists, `lead_h ≥ horizon_h`. The effective lead can exceed H by up to the gap between runs (≤ 4 h).
- **Coverage gaps are expected at long horizons.** A run published on day P only reaches (P+2) 21:00. The earliest run that covers a 22:00 target is therefore the 02:30 run of the previous day, which is 43.5 h ahead; for 23:00 it is 44.5 h ahead. So for H > 43.5 h the 22:00 and 23:00 UTC targets have no qualifying run. Return `null` for those hours. The API reports coverage, and the UI explains it.

### 5.2 Decision cutoff (timezone-correct)

```python
LONDON = ZoneInfo("Europe/London")

def decision_cutoff_utc(delivery_date: date, cutoff_local: time) -> pd.Timestamp:
    local = datetime.combine(delivery_date - timedelta(days=1), cutoff_local, tzinfo=LONDON)
    return pd.Timestamp(local).tz_convert("UTC")

def delivery_day_targets(delivery_date: date, freq: str = "1h") -> pd.DatetimeIndex:
    start = pd.Timestamp(datetime.combine(delivery_date, time(0), tzinfo=LONDON))
    end = pd.Timestamp(datetime.combine(delivery_date + timedelta(days=1), time(0), tzinfo=LONDON))
    return pd.date_range(start, end, freq=freq, inclusive="left").tz_convert("UTC")
```

### 5.3 Decision run for a delivery day

1. `run = max(publish_time)` over runs with `publish_time ≤ cutoff_utc`.
2. Points = that run's rows for the delivery day's hourly targets.
3. If some hours are missing from that run, return them as `null` and set `partial = true`. **Never substitute another run.**
4. The result includes `run_publish_time`, `lead_min_h`, `lead_max_h`, `partial`, and `missing_hours`.

**No look-ahead invariant:** nothing with `publish_time > cutoff_utc` may influence the forecast, firm wind or buffers for that day. Buffers use other days' errors (§5.7), which is allowed because those errors are historical relative to the pilot evaluation. This is documented as a backtest convention (§9).

### 5.4 Decision population

For each preset (`epex`, `n2ex`) and each delivery day in scope, take the decision run's points ⋈ actuals → **decision pairs** (about 31 × 24 = 744 rows per preset). Precompute both presets at startup.

### 5.5 Metrics (on any set of pairs)

| Metric | Formula |
|---|---|
| `n` | count of pairs with both values |
| `mae_mw` | mean(\|e\|) |
| `rmse_mw` | sqrt(mean(e²)) |
| `bias_mw` | mean(e). Positive means over-forecast. |
| `wape_pct` | 100 × Σ\|e\| / Σ actual |
| `p50_abs_mw`, `p90_abs_mw`, `p99_abs_mw` | quantiles of \|e\| |
| `p90_shortfall_mw` | max(quantile₀.₉(e), 0) |
| `max_shortfall_mw` | max(max(e), 0), plus `max_shortfall_at` |

where `e = forecast_mw − actual_mw`. Use `numpy.quantile(..., method="linear")`. Return `null` metrics when `n == 0`. Round to 1 decimal only at the API boundary.

### 5.6 Error vs lead time (lead curve)

- Population: **all pairs** (every run × every target it covers) with target in the delivery window and `0 ≤ lead_h ≤ 48`.
- Group by lead bin. With `bin_h = 1` each bin is one exact lead value (0.5, 1.5, …, 47.5). With `bin_h = 3`, bins are [0,3), [3,6), …
- Per bin: `n, mae, rmse, bias, p50_abs, p90_abs, p99_abs`.
- This is a different population from §5.1 (exact lead rather than "at least H"). Label the chart "error by actual lead time".

### 5.7 Buffers and firm wind (leave-one-day-out)

Given a decision population `pool`, a confidence `c ∈ {0.80, 0.90, 0.95}`, and a delivery day `D`:

1. `train = pool[pool.delivery_date != D]` (leave-one-day-out).
2. **Simple (Must):** `buffer = max(quantile_c(train.error_mw), 0)`, the same for every hour.
3. **Conditional (Should):** split `train` into 5 bins by `forecast_mw` quintiles (edges computed on `train`, rounded to 100 MW, de-duplicated). `buffer_bin = max(quantile_c(error in bin), 0)`. If a bin has `n < 30`, use the simple buffer for it.
4. For each hour of D: `firm_mw = max(forecast_mw − buffer(bin(forecast_mw)), 0)`.
5. Clamp the buffer at ≥ 0, so firm wind never exceeds the forecast (a conservative choice for a buyer).

### 5.8 Calibration

- For every day D in scope, compute firm wind via §5.7 (LODO), then `kept = actual_mw ≥ firm_mw`.
- `achieved_pct = 100 × mean(kept)`, overall and per forecast-level bin. Target: within ±5 pp of c.
- Precompute at startup for each preset × c: 2 × 3 combinations, each covering 31 days. This is cheap.

### 5.9 Energy for a day

- `forecast_mwh = Σ forecast_mw × 1 h` over the day's hourly points (null if any hour is missing; report `partial`).
- `actual_mwh = Σ actual_mw × 0.5 h` over the day's half-hours.
- Show GWh in the UI. Note in the methodology that hourly points are treated as hourly averages.

### 5.10 Vintages (forecast evolution) for day D

Runs with `publish_time ∈ [D_start − 48 h, D_start)` (UK day start). For each run, return its points within D, `is_decision_run`, and `after_cutoff = publish_time > cutoff_utc`.

### 5.11 Distribution, slices, worst events

- **Histogram** of signed `error_mw`: fixed 250 MW bins from floor(min/250)·250 to ceil(max/250)·250, plus P10/P50/P90 of the signed error.
- **By hour of day** (UK): `n, mae, bias, p90_shortfall`.
- **By forecast level:** the same quintile bins as §5.7 but computed on the full pool (descriptive): `n, mae, bias, p80/p90/p95 shortfall`.
- **Daily:** per delivery day: `mae, bias, max_shortfall`.
- **Worst N:** top N by `abs_error_mw`, including `delivery_date` so the UI can deep-link.
- **Auction comparison:** metrics for the `epex` and `n2ex` pools, plus the relative MAE change.

### 5.12 Value of the forecast (Should — strong pitch point)

- **Unconditional firm wind:** `quantile_{1−c}(actual_mw)` across the pilot hours, i.e. what you could bank with no forecast at all.
- **Forecast-based firm wind:** mean `firm_mw` across the pilot (LODO).
- Value = the difference in MW. Pitch line: *"With the forecast you can bank X MW more wind on an average hour than without it."*

### 5.13 Narrative text (templated, tested)

- `decision_summary(day_result) -> str`. Example: "At 09:20 on Wed 14 Jan, the latest forecast expected 412 GWh of wind for Thu 15 Jan. At 90% confidence you could count on an average of 13.1 GW. Wind delivered 380 GWh (8% below forecast), with the largest shortfall of 2.9 GW at 18:00."
- `accuracy_takeaways(stats) -> list[str]` returns three sentences: typical error at the decision lead; bias; buffer guidance (including the high-wind bin).
- Choose wording by thresholds: |bias| < 100 MW reads as "no material bias". Unit-test each branch.

---

## 6. Performance model

- About 17k forecast rows, about 1.5k actuals, about 15k pairs. Load at startup in under 1 s.
- Precompute at startup: `pairs_all`, the decision pools for both presets, calibration for each preset × c, and the lead curves (bin 1 h and 3 h).
- Per-request computation (`select_at_horizon` over ≤ 840 hourly targets, plus metrics) takes under 30 ms. Wrap service calls in `functools.lru_cache(maxsize=256)` keyed by normalized primitive params.
- Responses are deterministic for a given snapshot. The API sets `Cache-Control: public, max-age=300, s-maxage=86400` and an `ETag` of `snapshot_id` plus the normalized query (see API.md).

---

## 7. Tests (analytics)

Fixture: a tiny synthetic dataset built in `tests/conftest.py`: 3 delivery days, runs at 07:30 / 09:30 / 11:30 UTC daily with known values, and actuals with known values. Hand-compute every expected number in comments.

Required cases:
1. `select_at_horizon` picks the latest eligible run; an exact boundary (`publish == t − H`) is included.
2. It returns null when no run qualifies; coverage is computed correctly.
3. Property: `lead_h ≥ horizon_h` for every non-null row (also run on the real snapshot, marked `snapshot`).
4. `decision_cutoff_utc` is correct for a GMT date **and** a BST date (2026-06-15 09:20 BST → 08:20 UTC).
5. No look-ahead: a run published 1 minute after the cutoff is ignored.
6. Partial coverage: missing hours come back null and `partial = true`. There is no substitution.
7. Metrics match hand-computed values; n = 0 returns nulls.
8. LODO: changing day D's actuals never changes D's buffer.
9. A bin with n < 30 falls back to the simple buffer.
10. Firm wind is ≥ 0 and ≤ forecast.
11. Energy integration (24 × 1 h, 48 × 0.5 h).
12. Lead-curve counts per bin.
13. Narrative templates: each branch (positive/negative/no bias; partial day).
14. **Data-contract tests** on the real snapshot (marker `snapshot`): 8 runs/day, 73 rows/run before filtering, 48 periods/day, no duplicates, and full decision coverage for both presets on every in-scope day. The 73-rows check uses `quality.json` because filtering happens at ingest.

Coverage target: ≥ 90% lines on `winddesk/analytics`.

---

## 8. Analysis notebook (`notebooks/01_wind_forecast_accuracy.ipynb`)

It imports `winddesk.analytics` (one source of truth) and is committed **executed, with outputs**, so GitHub renders it. Use matplotlib for static plots.

1. Data overview and quality (from `quality.json`).
2. Publish cadence and lead-time coverage; verify the §1.2 facts.
3. Error vs lead time (all pairs).
4. Decision-mode error: EPEX vs N2EX.
5. Distribution: skew and tails; is over-forecast or under-forecast more extreme?
6. Error by wind level and by hour of day.
7. Buffer calibration (LODO): does P90 hold?
8. Alignment sensitivity: start period vs hourly mean.
9. Biggest misses: which days, and what the forecast evolution looked like.
10. Reliability and the value of the forecast (§5.12).
11. Conclusions. Write the headline numbers to `docs/INSIGHTS.md` (template in PLAN Phase 3). The pitch and the in-app takeaways use them.

---

## 9. Known limitations (state them honestly in the app and the video)

- One month of data: P95 is a small-sample estimate and P99 is not used as a buffer. Seasonality is not captured.
- National wind is a proxy for the client's exposure.
- The backtest uses errors from other days in the same month (LODO), not strictly earlier days. That is fine for a pilot. A production version would use an expanding or rolling window.
- Hourly forecast vs half-hourly actual alignment (§4), with a sensitivity check provided.
- Embedded wind is not visible (§1.3).
- Symmetric statistics: a cost-weighted buffer needs the client's imbalance cost data (an open question in the PRD).
