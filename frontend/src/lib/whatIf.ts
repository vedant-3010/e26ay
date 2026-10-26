/**
 * Procurement what-if (PRD F7, Could; illustrative). Given the desk's expected demand and its
 * share of national wind, how much would it still need to buy for each hour of the delivery day,
 * at the forecast (P50) and at firm wind (the chosen confidence)? Pure and client-side: nothing
 * the user enters is sent anywhere.
 *
 * Per hour h, all in MW (an hour at x MW is x MWh):
 *   wind_p50_h      = share × forecast_h
 *   wind_firm_h     = share × firm_h
 *   residual_p50_h  = max(demand_h − wind_p50_h, 0)
 *   residual_firm_h = max(demand_h − wind_firm_h, 0)
 * firm ≤ forecast, so residual_firm_h ≥ residual_p50_h: the difference is the extra volume that
 * planning at the chosen confidence asks you to secure. Hours the decision run does not cover stay
 * gaps (null) and are left out of every total, demand included, so the totals are comparable.
 */
import type { DecisionData } from '@/api/client'

import { toCsv, type CsvColumn } from './csv'
import { fmtUkDateTime } from './time'

export interface WhatIfHour {
  t: string
  demand_mw: number
  wind_p50_mw: number | null
  wind_firm_mw: number | null
  residual_p50_mw: number | null
  residual_firm_mw: number | null
}

export interface WhatIfResult {
  hours: WhatIfHour[]
  /** Hours with a forecast; the totals below cover these only. */
  covered_hours: number
  demand_mwh: number
  wind_p50_mwh: number
  wind_firm_mwh: number
  residual_p50_mwh: number
  residual_firm_mwh: number
}

/** `demandMw` has one value per forecast hour; `sharePct` is 0–100. */
export function computeWhatIf(
  forecast: DecisionData['forecast'],
  demandMw: readonly number[],
  sharePct: number,
): WhatIfResult {
  const share = sharePct / 100
  const hours: WhatIfHour[] = forecast.map((p, i) => {
    const demand = demandMw[i] ?? 0
    const covered = p.mw !== null && p.firm_mw !== null
    const windP50 = covered && p.mw !== null ? share * p.mw : null
    const windFirm = covered && p.firm_mw !== null ? share * p.firm_mw : null
    return {
      t: p.t,
      demand_mw: demand,
      wind_p50_mw: windP50,
      wind_firm_mw: windFirm,
      residual_p50_mw: windP50 === null ? null : Math.max(demand - windP50, 0),
      residual_firm_mw: windFirm === null ? null : Math.max(demand - windFirm, 0),
    }
  })
  const covered = hours.filter((h) => h.residual_p50_mw !== null)
  const sum = (pick: (h: WhatIfHour) => number | null) =>
    covered.reduce((total, h) => total + (pick(h) ?? 0), 0)
  return {
    hours,
    covered_hours: covered.length,
    demand_mwh: sum((h) => h.demand_mw),
    wind_p50_mwh: sum((h) => h.wind_p50_mw),
    wind_firm_mwh: sum((h) => h.wind_firm_mw),
    residual_p50_mwh: sum((h) => h.residual_p50_mw),
    residual_firm_mwh: sum((h) => h.residual_firm_mw),
  }
}

export type ParseResult = { ok: true; values: number[] } | { ok: false; error: string }

/**
 * Hourly demand pasted by the user: one value per hour, in MW. A spreadsheet column (one value per
 * line, or tab-separated) may use thousands separators ("1,500"); a single line is split on commas
 * and spaces instead ("1500, 1480 1460").
 */
export function parseHourlyDemand(text: string, hours: number): ParseResult {
  const multiline = /[\n\t;]/.test(text.trim())
  const tokens = (multiline ? text.split(/[\n\t;]+/) : text.split(/[\s,]+/))
    .map((s) => (multiline ? s.replace(/[\s,]/g, '') : s.trim()))
    .filter((s) => s !== '')
  if (tokens.length === 0) return { ok: false, error: `Paste ${hours} hourly values in MW.` }
  const values: number[] = []
  for (const token of tokens) {
    const value = Number(token)
    if (!Number.isFinite(value)) return { ok: false, error: `“${token}” is not a number.` }
    if (value < 0) return { ok: false, error: 'Demand cannot be negative.' }
    values.push(value)
  }
  if (values.length !== hours) {
    return { ok: false, error: `Expected ${hours} hourly values, got ${values.length}.` }
  }
  return { ok: true, values }
}

/** The hourly table behind the what-if chart, with the inputs repeated on every row. */
export function whatIfCsv(result: WhatIfResult, sharePct: number, confidencePct: number): string {
  const columns: CsvColumn<WhatIfHour>[] = [
    { header: 'target_time_utc', value: (h) => h.t },
    { header: 'target_time_uk', value: (h) => fmtUkDateTime(h.t) },
    { header: 'demand_mw', value: (h) => h.demand_mw },
    { header: 'wind_share_pct', value: () => sharePct },
    { header: 'wind_share_forecast_mw', value: (h) => round1(h.wind_p50_mw) },
    { header: `wind_share_firm_mw_p${confidencePct}`, value: (h) => round1(h.wind_firm_mw) },
    { header: 'to_buy_at_forecast_mw', value: (h) => round1(h.residual_p50_mw) },
    { header: `to_buy_at_firm_mw_p${confidencePct}`, value: (h) => round1(h.residual_firm_mw) },
  ]
  return toCsv(columns, result.hours)
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10
}
