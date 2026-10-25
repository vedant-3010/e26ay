# WindDesk — API Contract (v1)

FastAPI serves everything under `/api`. The OpenAPI document is at `/api/openapi.json` and interactive docs at `/api/docs`. **Frontend types are generated from the OpenAPI document** (`npm run gen:api` → `frontend/src/api/schema.d.ts`) and are never hand-written (ADR-0005).

## Conventions

- JSON only; read-only `GET` endpoints.
- Timestamps: ISO-8601 UTC with `Z` (e.g. `2026-01-15T09:00:00Z`). Dates: `YYYY-MM-DD` (UK delivery/settlement day). Local times: `HH:MM` (UK).
- Power in **MW**, energy in **MWh**. Floats are rounded to 1 decimal at the boundary. Missing values are `null`; values are never omitted.
- Field names are `snake_case`, with units in the name (`forecast_mw`, `lead_h`).
- Validation errors return **422** with a body of the form `{"error": {"code": "invalid_params", "message": "...", "details": [...]}}`. A custom exception handler wraps FastAPI's default. Unknown errors return 500 with the same shape and no stack traces.
- Caching: every data response carries `Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800` and an `ETag` (`"{snapshot_id}-{hash(normalized query)}"`). Honour `If-None-Match` with 304.
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
    "target_from": "2026-01-01T00:00:00Z", "target_to": "2026-02-01T23:30:00Z",
    "delivery_from": "2026-01-02", "delivery_to": "2026-02-01"
  },
  "forecast_runs": {"count": 272, "run_times_utc": ["02:30","04:30","07:30","09:30","11:30","15:30","18:30","22:30"]},
  "rows": {"actuals": 1536, "forecasts": 14847},
  "auctions": [
    {"id": "epex", "label": "EPEX SPOT GB Day-Ahead", "cutoff_local": "09:20"},
    {"id": "n2ex", "label": "Nord Pool N2EX Day-Ahead", "cutoff_local": "09:50"}
  ],
  "confidences": [0.8, 0.9, 0.95],
  "horizon": {"min_h": 0, "max_h": 48, "step_h": 0.5, "default_h": 24},
  "defaults": {"delivery_date": "2026-01-15", "auction": "epex", "confidence": 0.9,
               "monitor_start": "2026-01-02T00:00:00Z", "monitor_end": "2026-01-09T00:00:00Z"},
  "quality": {"status": "ok", "checks": [{"id": "runs_per_day", "status": "ok", "message": "8 runs on every day"}]}
}
```
`forecast_runs.run_times_utc` is the **nominal** schedule. Runs published at other times (in the pilot, one: 2026-01-15 12:25 UTC) are listed by the `run_times` quality check (DATA §1.2). `rows` and `forecast_runs.count` above are the real Phase 1 snapshot figures.

## `GET /api/monitor`
Actual vs forecast at a fixed horizon (DATA §5.1).

| Param | Type | Rules |
|---|---|---|
| `start` | datetime (UTC) | ≥ `target_from` |
| `end` | datetime (UTC) | ≤ `target_to`, > start, span ≤ 35 days |
| `horizon_h` | float | 0–48, multiple of 0.5 |

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
| `delivery_date` | date | within `delivery_from`…`delivery_to` |
| `auction` | `epex` \| `n2ex` \| `custom` | default `epex` |
| `cutoff` | `HH:MM` | required only when `auction=custom`; 15-min steps |
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
  "buffers": {"method": "conditional_lodo", "confidence": 0.9,
              "bins": [{"forecast_from_mw": 0, "forecast_to_mw": 6000, "buffer_mw": 900.0, "n": 140}]},
  "vintages": [{"publish_time": "2026-01-13T22:30:00Z", "is_decision_run": false, "after_cutoff": false,
                "points": [{"t": "2026-01-15T00:00:00Z", "mw": 12500.0}]}],
  "summary": "At 09:20 on Wed 14 Jan, the latest forecast expected 412 GWh of wind for Thu 15 Jan. …"
}
```
`actual` is always returned. The UI decides whether to show it (Trader view vs Hindsight). `buffers.method` is `conditional_lodo` (implemented in Phase 2). `energy_error_pct = 100 × (forecast − actual) / forecast`, so positive means a shortfall (DATA §5.9).

## `GET /api/accuracy`
Accuracy Lab payload (DATA §5.5–5.12).

| Param | Type | Rules |
|---|---|---|
| `population` | `decision` \| `horizon` | default `decision` |
| `auction` | `epex` \| `n2ex` | used when population=decision; default `epex` |
| `horizon_h` | float 0–48 | used when population=horizon; default 24 |
| `start`, `end` | date | delivery-day range; default = full pilot window |
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
- `lead_curve` always uses all pairs (DATA §5.6), with 1 h bins. The `population` param does not affect it.
- `calibration`, `by_level[].achieved_pct` and `forecast_value` are only meaningful for `population=decision`. Return `null` otherwise.
- Sections marked "Should" in the PRD may return `null` until built. The frontend must handle `null` sections gracefully.

## (Could) `GET /api/live`
Behind `WINDDESK_ENABLE_LIVE=true`. Fetches the latest WINDFOR run from Elexon (in-process cache, 10 min TTL) and returns tomorrow's forecast in the `decision` payload shape, with `actual` and `kpis` limited to forecast-side fields. Returns 404 when disabled.

---

## Router layout
```
winddesk/api/
  routes_meta.py      # /health, /meta
  routes_monitor.py   # /monitor
  routes_decision.py  # /decision
  routes_accuracy.py  # /accuracy
  schemas.py          # Pydantic v2 response/param models (single file is fine at this size)
  deps.py             # get_store() dependency, param normalization
  caching.py          # ETag/Cache-Control helper
  errors.py           # error envelope + handlers
```
Routers are thin. They validate params, call `winddesk/services/*`, and map results to schemas. No pandas code lives in routers.
