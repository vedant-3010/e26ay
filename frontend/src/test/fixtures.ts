/** Typed API payloads for tests. The generated types keep them honest against the contract. */
import { screen } from '@testing-library/react'

import type {
  AccuracyData,
  DecisionData,
  Health,
  LiveData,
  Meta,
  Metrics,
  MonitorData,
} from '@/api/client'

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
  live_enabled: false,
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

/** A 4-hour "day" (enough to exercise every branch), EPEX cutoff Wed 14 Jan 09:20:
 * 00:00 forecast 10,000 / firm 8,000 / actual 9,000 → shortfall, firm held;
 * 01:00 forecast 10,000 / firm 8,000 / actual 7,000 → below firm wind;
 * 02:00 forecast 9,000 / firm 7,500 / actual 9,500 → surplus;
 * 03:00 gap in the decision run (never filled). */
export function decisionData(overrides: Partial<DecisionData> = {}): DecisionData {
  const t = (h: number, m = 0) => `2026-01-15T${String(h).padStart(2, '0')}:${m ? '30' : '00'}:00Z`
  return {
    delivery_date: '2026-01-15',
    cutoff: { local: '09:20', utc: '2026-01-14T09:20:00Z', auction: 'epex' },
    run: {
      publish_time: '2026-01-14T07:30:00Z',
      lead_min_h: 16.5,
      lead_max_h: 18.5,
      partial: true,
      missing_hours: [t(3)],
    },
    forecast: [
      { t: t(0), mw: 10000, firm_mw: 8000, lead_h: 16.5 },
      { t: t(1), mw: 10000, firm_mw: 8000, lead_h: 17.5 },
      { t: t(2), mw: 9000, firm_mw: 7500, lead_h: 18.5 },
      { t: t(3), mw: null, firm_mw: null, lead_h: null },
    ],
    actual: [
      { t: t(0), mw: 9000 },
      { t: t(0, 30), mw: 9100 },
      { t: t(1), mw: 7000 },
      { t: t(1, 30), mw: 7500 },
      { t: t(2), mw: 9500 },
      { t: t(2, 30), mw: 9400 },
      { t: t(3), mw: 9000 },
      { t: t(3, 30), mw: 8800 },
    ],
    kpis: {
      forecast_mwh: null,
      actual_mwh: 34650,
      energy_error_pct: null,
      avg_firm_mw: 7833.3,
      avg_buffer_mw: 1833.3,
      mae_mw: 1500,
      bias_mw: 500,
      max_shortfall_mw: 3000,
      max_shortfall_at: t(1),
      firm_hours_kept: 2,
      firm_hours_total: 3,
    },
    buffers: {
      method: 'conditional_lodo',
      confidence: 0.9,
      simple_buffer_mw: 2000,
      bins: [
        { forecast_from_mw: 0, forecast_to_mw: null, buffer_mw: 2000, n: 700, fallback: false },
      ],
    },
    vintages: [
      {
        publish_time: '2026-01-13T22:30:00Z',
        is_decision_run: false,
        after_cutoff: false,
        points: [{ t: t(0), mw: 11000 }],
      },
      {
        publish_time: '2026-01-14T07:30:00Z',
        is_decision_run: true,
        after_cutoff: false,
        points: [
          { t: t(0), mw: 10000 },
          { t: t(1), mw: 10000 },
          { t: t(2), mw: 9000 },
        ],
      },
      {
        publish_time: '2026-01-14T09:30:00Z',
        is_decision_run: false,
        after_cutoff: true,
        points: [{ t: t(0), mw: 9200 }],
      },
    ],
    summary:
      'At 09:20 on Wed 14 Jan, … Wind delivered 35 GWh, with the largest shortfall of 3.0 GW at 01:00.',
    summary_trader:
      'At 09:20 on Wed 14 Jan, the latest forecast (published 07:30) covered only 3 of 4 hours.',
    ...overrides,
  }
}

/** Live mode (F8): the decision shape as of the fetch, with no actuals and no outcome. */
export function liveData(): LiveData {
  const d = decisionData()
  return {
    ...d,
    cutoff: { local: '10:00', utc: '2026-01-14T10:00:00Z', auction: 'custom' },
    actual: [],
    kpis: {
      ...d.kpis,
      actual_mwh: null,
      energy_error_pct: null,
      mae_mw: null,
      bias_mw: null,
      max_shortfall_mw: null,
      max_shortfall_at: null,
      firm_hours_kept: 0,
      firm_hours_total: 0,
    },
    summary: d.summary_trader,
    live: {
      fetched_at: '2026-01-14T10:07:00Z',
      ttl_s: 600,
      calibration_snapshot_id: 'ac22a4140bca',
    },
  }
}

/** The value shown under a readout label, e.g. readoutValue('MAE') → "1,500 MW". */
export function readoutValue(label: string): string {
  const term = screen.getAllByRole('term').find((t) => t.textContent === label)
  if (!term) throw new Error(`No readout labelled ${label}`)
  const value = term.parentElement?.querySelector('dd')
  return (value?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** A small Accuracy Lab payload (decision population, EPEX, full window). */
export function accuracyData(overrides: Partial<AccuracyData> = {}): AccuracyData {
  return {
    params: {
      population: 'decision',
      auction: 'epex',
      horizon_h: 24,
      start: '2026-01-02',
      end: '2026-02-01',
      confidence: 0.9,
    },
    headline: { ...METRICS, n: 744, mae_mw: 2022.4, bias_mw: 1746.2, wape_pct: 17.9 },
    takeaways: [
      'At the EPEX SPOT GB Day-Ahead decision point (16.5–39.5 h ahead), the forecast is typically off by 2,022 MW.',
      'The forecast tends to run high, by 1,746 MW on average, so shortfalls are more common than surpluses.',
      'Holding back 4,154 MW covers 90% of shortfalls.',
    ],
    lead_curve: [
      {
        lead_h: 0.5,
        n: 248,
        mae_mw: 1669,
        rmse_mw: 2000,
        bias_mw: 1455,
        p50_abs_mw: 1500,
        p90_abs_mw: 3430,
        p99_abs_mw: 6000,
      },
      {
        lead_h: 16.5,
        n: 248,
        mae_mw: 1859,
        rmse_mw: 2200,
        bias_mw: 1650,
        p50_abs_mw: 1600,
        p90_abs_mw: 3636,
        p99_abs_mw: 6200,
      },
    ],
    decision_lead_window_h: [16.5, 39.5],
    distribution: {
      bin_edges_mw: [-500, -250, 0, 250],
      counts: [2, 5, 9],
      p10_mw: -426,
      p50_mw: 1582,
      p90_mw: 4154,
    },
    by_hour: [{ hour_uk: 0, n: 31, mae_mw: 1950, bias_mw: 1900, p90_shortfall_mw: 4000 }],
    by_level: [
      {
        forecast_from_mw: 0,
        forecast_to_mw: 8200,
        n: 148,
        mae_mw: 1258,
        bias_mw: 371,
        p80_shortfall_mw: 1657,
        p90_shortfall_mw: 1970,
        p95_shortfall_mw: 2489,
        achieved_pct: 88.5,
      },
      {
        forecast_from_mw: 18100,
        forecast_to_mw: null,
        n: 148,
        mae_mw: 3458,
        bias_mw: 3458,
        p80_shortfall_mw: 4340,
        p90_shortfall_mw: 5376,
        p95_shortfall_mw: 5895,
        achieved_pct: 85.1,
      },
    ],
    calibration: { target_pct: 90, achieved_pct: 87, method: 'conditional_lodo' },
    daily: [
      { delivery_date: '2026-01-27', mae_mw: 3419, bias_mw: 3300, max_shortfall_mw: 5914 },
      { delivery_date: '2026-01-28', mae_mw: 5329, bias_mw: 5329, max_shortfall_mw: 6210 },
    ],
    worst: [
      {
        t: '2026-01-12T01:00:00Z',
        delivery_date: '2026-01-12',
        forecast_mw: 20942,
        actual_mw: 14048,
        error_mw: 6894,
        publish_time: '2026-01-11T07:30:00Z',
        lead_h: 17.5,
      },
    ],
    auction_comparison: {
      epex: { ...METRICS, mae_mw: 2022.4, p90_shortfall_mw: 4154 },
      n2ex: { ...METRICS, mae_mw: 1996.1, p90_shortfall_mw: 4184 },
      mae_change_pct: -1.3,
    },
    forecast_value: {
      confidence: 0.9,
      unconditional_firm_mw: 5379.6,
      avg_forecast_firm_mw: 9522.9,
      gain_mw: 4143.3,
    },
    ...overrides,
  }
}
