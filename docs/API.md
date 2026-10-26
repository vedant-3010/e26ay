# WindDesk — API Contract (v1)

FastAPI serves everything under `/api`. The OpenAPI document is at `/api/openapi.json` and interactive docs at `/api/docs`. **Frontend types are generated from the OpenAPI document** (`npm run gen:api` → `frontend/src/api/schema.d.ts`) and are never hand-written (ADR-0005).

## Conventions

- JSON only; read-only `GET` endpoints.
- Timestamps: ISO-8601 UTC with `Z` (e.g. `2026-01-15T09:00:00Z`). Dates: `YYYY-MM-DD` (UK delivery/settlement day). Local times: `HH:MM` (UK).
- Power in **MW**, energy in **MWh**. Floats are rounded to 1 decimal at the boundary. Missing values are `null`; values are never omitted.
- Field names are `snake_case`, with units in the name (`forecast_mw`, `lead_h`).
- Validation errors return **422** with a body of the form `{"error": {"code": "invalid_params", "message": "...", "details": [...]}}`. A custom exception handler wraps FastAPI's default. Unknown errors return 500 with the same shape and no stack traces.
- Caching: every data response carries `Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800` and an `ETag` (`"{snapshot_id}-{first 16 hex of sha256(normalized query)}"`). `If-None-Match` is honoured with 304 (comma lists, `W/` and `*` are accepted). This is done per response, not in middleware (ADR-0002).
- Parameters are normalized before caching: defaults spelled out and omitted give the same ETag, and parameters that don't apply (e.g. `horizon_h` for `population=decision`) are reset to their defaults.
- Unknown `/api/*` paths return 404 and wrong methods 405, both in the envelope; unexpected errors return 500 with `code: "internal_error"`.
- Every response includes the `X-Snapshot-Id` header.

Shared schema `Metrics`:
```json
{
  "n": 744, "mae_mw": 1234.5, "rmse_mw": 1650.2, "bias_mw": 210.3, "wape_pct": 9.8,
  "p50_abs_mw": 950.0, "p90_abs_mw": 2600.0, "p99_abs_mw": 4300.0,
  "p90_shortfall_mw": 2100.0, "max_shortfall_mw": 5200.0, "max_shortfall_at": "2026-01-21T18:00:00Z"
}
```
(The numbers are illustrative.) All fields are nullable when `n = 0`.

---

## `GET /api/health`
`200 {"status": "ok", "snapshot_id": "a1b2c3d4e5f6", "git_sha": "abc1234" | null, "version": "1.0.0"}`
`git_sha` comes from `VERCEL_GIT_COMMIT_SHA` or the `GIT_SHA` env variable. Not cached.

## `GET /api/meta`
Everything the UI needs to bootstrap: bounds, presets, defaults and the data-quality summary.
```json
{
  "product": "WindDesk",
  "snapshot": {"id": "a1b2c3d4e5f6", "created_at": "2026-10-25T12:00:00Z"},
  "bounds": {
    "target_from": "2026-01-01T00:00:00Z", "target_to": "2026-02-02T00:00:00Z",
    "delivery_from": "2026-01-02", "delivery_to": "2026-02-01"
  },
  "forecast_runs": {"count": 272, "run_times_utc": ["02:30","04:30","07:30","09:30","11:30","15:30","18:30","22:30"],
                    "off_schedule": ["2026-01-15T12:25:00Z"]},
  "rows": {"actuals": 1536, "forecasts": 14847},
  "auctions": [
    {"id": "epex", "label": "EPEX SPOT GB Day-Ahead", "cutoff_local": "09:20"},
    {"id": "n2ex", "label": "Nord Pool N2EX Day-Ahead", "cutoff_local": "09:50"}
  ],
  "confidences": [0.8, 0.9, 0.95],
  "horizon": {"min_h": 0, "max_h": 48, "step_h": 0.5, "default_h": 24},
  "defaults": {"delivery_date": "2026-01-15", "auction": "epex", "confidence": 0.9,
               "monitor_start": "2026-01-02T00:00:00Z", "monitor_end": "2026-01-09T00:00:00Z"},
  "quality": {"status": "warn",
              "summary": {"forecast_runs": 272, "forecast_rows": 14847, "forecast_duplicates_removed": 0,
                          "actual_rows": 1536, "actual_duplicates_removed": 0, "missing_periods": 0},
              "checks": [{"id": "runs_per_day", "status": "ok", "message": "8 runs on every one of 34 publish days"}]},
  "live_enabled": false
}
```
`live_enabled` (added in Phase 9) tells the UI whether to show the Live tab; it is part of the meta ETag key.
`bounds.target_to` is **exclusive** (the end of the data; the last half-hour starts 2026-02-01T23:30Z). `forecast_runs.run_times_utc` is the **nominal** schedule. Runs published at other times (in the pilot, one: 2026-01-15 12:25 UTC) are listed by the `run_times` quality check (DATA §1.2). `rows` and `forecast_runs.count` above are the real Phase 1 snapshot figures.

## `GET /api/monitor`
Actual vs forecast at a fixed horizon (DATA §5.1).

| Param | Type | Rules |
|---|---|---|
| `start` | datetime (UTC) | ≥ `target_from`; must carry an offset (`Z`). Default `2026-01-02T00:00:00Z` |
| `end` | datetime (UTC) | ≤ `target_to`, > start, span ≤ 35 days (the data spans 32, so the whole month fits). Default `2026-01-09T00:00:00Z` |
| `horizon_h` | float | 0–48, multiple of 0.5. Default 24 |

The window is `[start, end)` for both the hourly forecasts and the half-hourly actuals.

```json
{
  "params": {"start": "...", "end": "...", "horizon_h": 24},
  "actual": [{"t": "2026-01-02T00:00:00Z", "mw": 10450.0}],
  "forecast": [{"t": "2026-01-02T00:00:00Z", "mw": 11020.0, "publish_time": "2025-12-31T22:30:00Z", "lead_h": 25.5}],
  "metrics": { "...Metrics" },
  "coverage": {"target_hours": 168, "with_forecast": 168, "pct": 100.0}
}
```
`forecast` contains one entry per hourly target. When no run qualifies, `mw`, `publish_time` and `lead_h` are `null`.

## `GET /api/decision`
The Decision Desk payload for one delivery day (DATA §5.2–5.10, §5.13).

| Param | Type | Rules |
|---|---|---|
| `delivery_date` | date | within `delivery_from`…`delivery_to`; default 2026-01-15 |
| `auction` | `epex` \| `n2ex` \| `custom` | default `epex` |
| `cutoff` | `HH:MM` | required only when `auction=custom`; 15-min steps; ignored for presets |
| `confidence` | 0.8 \| 0.9 \| 0.95 | default 0.9 |

```json
{
  "delivery_date": "2026-01-15",
  "cutoff": {"local": "09:20", "utc": "2026-01-14T09:20:00Z", "auction": "epex"},
  "run": {"publish_time": "2026-01-14T07:30:00Z", "lead_min_h": 16.5, "lead_max_h": 39.5,
          "partial": false, "missing_hours": []},
  "forecast": [{"t": "2026-01-15T00:00:00Z", "mw": 12000.0, "firm_mw": 10100.0, "lead_h": 16.5}],
  "actual": [{"t": "2026-01-15T00:00:00Z", "mw": 11800.0}],
  "kpis": {
    "forecast_mwh": 412000.0, "actual_mwh": 380000.0, "energy_error_pct": 7.8,
    "avg_firm_mw": 13100.0, "avg_buffer_mw": 1900.0,
    "mae_mw": 1500.0, "bias_mw": 1300.0,
    "max_shortfall_mw": 2900.0, "max_shortfall_at": "2026-01-15T18:00:00Z",
    "firm_hours_kept": 22, "firm_hours_total": 24
  },
  "buffers": {"method": "conditional_lodo", "confidence": 0.9, "simple_buffer_mw": 4142.0,
              "bins": [{"forecast_from_mw": 0, "forecast_to_mw": 8200, "buffer_mw": 1888.0, "n": 146, "fallback": false}]},
  "vintages": [{"publish_time": "2026-01-13T22:30:00Z", "is_decision_run": false, "after_cutoff": false,
                "points": [{"t": "2026-01-15T00:00:00Z", "mw": 12500.0}]}],
  "summary": "At 09:20 on Wed 14 Jan, the latest forecast expected 412 GWh of wind for Thu 15 Jan. …",
  "summary_trader": "At 09:20 on Wed 14 Jan, the latest forecast expected 412 GWh of wind for Thu 15 Jan. At 90% confidence …"
}
```
`actual` is always returned. The UI decides whether to show it (Trader view vs Hindsight). `summary_trader` is the same text without any outcome sentence, for the Trader view (added in Phase 4). `buffers.method` is `conditional_lodo` (implemented in Phase 2). `energy_error_pct = 100 × (forecast − actual) / forecast`, so positive means a shortfall (DATA §5.9).

## `GET /api/accuracy`
Accuracy Lab payload (DATA §5.5–5.12).

| Param | Type | Rules |
|---|---|---|
| `population` | `decision` \| `horizon` | default `decision` |
| `auction` | `epex` \| `n2ex` | used when population=decision; default `epex` |
| `horizon_h` | float 0–48 | used when population=horizon; default 24 |
| `start`, `end` | date | delivery-day range (inclusive); default = full pilot window; `end ≥ start` |
| `confidence` | 0.8 \| 0.9 \| 0.95 | default 0.9 |

```json
{
  "params": {"...": "..."},
  "headline": { "...Metrics" },
  "takeaways": ["At the day-ahead decision point (16.5–39.5 h ahead) …", "…", "…"],
  "lead_curve": [{"lead_h": 0.5, "n": 248, "mae_mw": 300.0, "rmse_mw": 420.0, "bias_mw": 10.0,
                  "p50_abs_mw": 220.0, "p90_abs_mw": 700.0, "p99_abs_mw": 1300.0}],
  "decision_lead_window_h": [16.5, 39.5],
  "distribution": {"bin_edges_mw": [-5000, -4750], "counts": [1], "p10_mw": -1800.0, "p50_mw": 150.0, "p90_mw": 2100.0},
  "by_hour": [{"hour_uk": 0, "n": 31, "mae_mw": 1100.0, "bias_mw": 90.0, "p90_shortfall_mw": 1800.0}],
  "by_level": [{"forecast_from_mw": 0, "forecast_to_mw": 6000, "n": 148, "mae_mw": 600.0, "bias_mw": 50.0,
                "p80_shortfall_mw": 500.0, "p90_shortfall_mw": 900.0, "p95_shortfall_mw": 1200.0,
                "achieved_pct": 89.2}],
  "calibration": {"target_pct": 90.0, "achieved_pct": 88.7, "method": "conditional_lodo"},
  "daily": [{"delivery_date": "2026-01-02", "mae_mw": 900.0, "bias_mw": -100.0, "max_shortfall_mw": 2100.0}],
  "worst": [{"t": "2026-01-21T18:00:00Z", "delivery_date": "2026-01-21", "forecast_mw": 15000.0,
             "actual_mw": 9800.0, "error_mw": 5200.0, "publish_time": "2026-01-20T07:30:00Z", "lead_h": 34.5}],
  "auction_comparison": {"epex": { "...Metrics" }, "n2ex": { "...Metrics" }, "mae_change_pct": -6.2},
  "forecast_value": {"confidence": 0.9, "unconditional_firm_mw": 4200.0, "avg_forecast_firm_mw": 9800.0, "gain_mw": 5600.0}
}
```
- `lead_curve` always uses all pairs (DATA §5.6), with 1 h bins, over the selected date range. The `population` param does not affect it.
- `decision_lead_window_h` is the [min, max] lead of the selected population (e.g. [16.5, 39.5] for EPEX; for `horizon` it is the effective lead range at that H).
- The date range selects the *evaluated* days. LODO buffers for `calibration`, `by_level[].achieved_pct` and `forecast_value` are still fitted on every other pilot day.
- `calibration`, `by_level[].achieved_pct` and `forecast_value` are only meaningful for `population=decision`. Return `null` otherwise.
- Sections marked "Should" in the PRD may return `null` until built. The frontend must handle `null` sections gracefully.

## (Could) `GET /api/live`
Behind `WINDDESK_ENABLE_LIVE=true`; returns a 404 (`not_found`) when the flag is off. Built in Phase 9 as specified, with these details settled:

- **Params:** `confidence` (0.8 | 0.9 | 0.95, default 0.9). An invalid value returns 422.
- **Fetch:** the runs published on the UTC days D−2 and D−1 come straight from Elexon (10 s timeout, one retry, nothing written to disk). They are kept in memory for **10 minutes** and shared by all requests and confidences; a failure is not cached.
- **As of:** the delivery day D is tomorrow in UK time. The cutoff is the fetch time on D−1 in UK time, **floored to 15 minutes**, and feeds the unchanged `/decision` pipeline. So only runs published by then are used (no look-ahead), and buffers are fitted on the pilot snapshot's decision pairs for that cutoff time. A nominal hh:30 run is never hidden by the flooring; an off-schedule run can appear up to 15 minutes late.
- **Body:** the `/decision` shape with `cutoff.auction = "custom"`, `actual: []`, every outcome KPI `null`, and `firm_hours_kept = firm_hours_total = 0`. `summary` and `summary_trader` are therefore the same. It also has
  `"live": {"fetched_at": "2026-10-26T14:54:12Z", "ttl_s": 600, "calibration_snapshot_id": "ac22a4140bca"}`.
- **Headers:** `Cache-Control: public, max-age=60, s-maxage=300`, with no ETag (this is not snapshot data).
- **Errors:** Elexon unreachable, or no run covering D yet → **502** `upstream_unavailable`.
- **Checked against the real API on 2026-10-26:** the first call took 0.8 s and a cached call 15 ms. As of 14:45 it used the 11:30 UTC run, 12.5–35.5 h ahead of Tue 27 Oct.

---

## Router layout
```
winddesk/api/
  routes_meta.py      # /health, /meta
  routes_monitor.py   # /monitor
  routes_decision.py  # /decision
  routes_accuracy.py  # /accuracy
  routes_live.py      # /live (Could, behind WINDDESK_ENABLE_LIVE)
  schemas.py          # Pydantic v2 response/param models (single file is fine at this size)
  deps.py             # get_store() dependency, param normalization
  caching.py          # ETag/Cache-Control helper
  errors.py           # error envelope + handlers
```
Routers are thin. They validate params, call `winddesk/services/*`, and map results to schemas. No pandas code lives in routers.

## Measured performance (Phase 4, local, uvicorn, 2026-10-26)
| Endpoint | Cold (first call) | Warm (cached) | Size |
|---|---|---|---|
| `/api/meta` | 1.7 ms | ≈ 0.5 ms | 2 KB |
| `/api/monitor` (default week) | 7 ms | ≈ 1.1 ms | 30 KB |
| `/api/decision` (preset) | 10 ms | ≈ 1.1 ms | 22 KB |
| `/api/decision` (custom cutoff, first use) | 36 ms | ≈ 1.1 ms | 22 KB |
| `/api/accuracy` | 22–25 ms | ≈ 0.7 ms | 15 KB |
