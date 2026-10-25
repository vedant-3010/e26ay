/** Typed API payloads for tests. The generated types keep them honest against the contract. */
import type { Health, Meta, Metrics, MonitorData } from '@/api/client'

export const HEALTH: Health = {
  status: 'ok',
  snapshot_id: 'a1b2c3d4e5f6',
  git_sha: 'abc1234def5678',
  version: '1.0.0',
}

export const META: Meta = {
  product: 'WindDesk',
  snapshot: { id: 'a1b2c3d4e5f6', created_at: '2026-10-26T00:00:00Z' },
  bounds: {
    target_from: '2026-01-01T00:00:00Z',
    target_to: '2026-02-02T00:00:00Z',
    delivery_from: '2026-01-02',
    delivery_to: '2026-02-01',
  },
  forecast_runs: {
    count: 272,
    run_times_utc: ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30'],
    off_schedule: ['2026-01-15T12:25:00Z'],
  },
  rows: { actuals: 1536, forecasts: 14847 },
  auctions: [
    { id: 'epex', label: 'EPEX SPOT GB Day-Ahead', cutoff_local: '09:20' },
    { id: 'n2ex', label: 'Nord Pool N2EX Day-Ahead', cutoff_local: '09:50' },
  ],
  confidences: [0.8, 0.9, 0.95],
  horizon: { min_h: 0, max_h: 48, step_h: 0.5, default_h: 24 },
  defaults: {
    delivery_date: '2026-01-15',
    auction: 'epex',
    confidence: 0.9,
    monitor_start: '2026-01-02T00:00:00Z',
    monitor_end: '2026-01-09T00:00:00Z',
  },
  quality: {
    status: 'warn',
    summary: {
      forecast_runs: 272,
      forecast_rows: 14847,
      forecast_duplicates_removed: 0,
      actual_rows: 1536,
      actual_duplicates_removed: 0,
      missing_periods: 0,
    },
    checks: [
      { id: 'runs_per_day', status: 'ok', message: '8 runs on every one of 34 publish days' },
    ],
  },
}

export const METRICS: Metrics = {
  n: 2,
  mae_mw: 1500,
  rmse_mw: 1581.1,
  bias_mw: 500,
  wape_pct: 15,
  p50_abs_mw: 1500,
  p90_abs_mw: 1900,
  p99_abs_mw: 1990,
  p90_shortfall_mw: 1800,
  max_shortfall_mw: 2000,
  max_shortfall_at: '2026-01-02T00:00:00Z',
}

/** Two hours: at 00:00 forecast 12,000 vs actual 10,000 (+2,000 shortfall); at 01:00
 * forecast 9,000 vs actual 10,000 (−1,000 surplus); at 02:00 no qualifying run. */
export function monitorData(overrides: Partial<MonitorData> = {}): MonitorData {
  return {
    params: { start: '2026-01-02T00:00:00Z', end: '2026-01-02T03:00:00Z', horizon_h: 24 },
    actual: [
      { t: '2026-01-02T00:00:00Z', mw: 10000 },
      { t: '2026-01-02T00:30:00Z', mw: 10100 },
      { t: '2026-01-02T01:00:00Z', mw: 10000 },
      { t: '2026-01-02T01:30:00Z', mw: null },
      { t: '2026-01-02T02:00:00Z', mw: 9500 },
    ],
    forecast: [
      { t: '2026-01-02T00:00:00Z', mw: 12000, publish_time: '2025-12-31T22:30:00Z', lead_h: 25.5 },
      { t: '2026-01-02T01:00:00Z', mw: 9000, publish_time: '2025-12-31T22:30:00Z', lead_h: 26.5 },
      { t: '2026-01-02T02:00:00Z', mw: null, publish_time: null, lead_h: null },
    ],
    metrics: METRICS,
    coverage: { target_hours: 3, with_forecast: 2, pct: 66.7 },
    ...overrides,
  }
}

/** A fetch stub that answers by path; anything else is a 404 envelope. */
export function fetchRoutes(routes: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const body = routes[url.pathname]
    if (body === undefined) {
      return Response.json(
        { error: { code: 'not_found', message: `No route ${url.pathname}`, details: [] } },
        { status: 404 },
      )
    }
    return typeof body === 'function'
      ? Response.json((body as (u: URL) => unknown)(url))
      : Response.json(body)
  })
}
