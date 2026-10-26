import { decisionData } from '@/test/fixtures'

import { computeWhatIf, parseHourlyDemand, whatIfCsv } from './whatIf'

// Fixture forecast (MW): 10,000 / 10,000 / 9,000 / gap, firm wind 8,000 / 8,000 / 7,500 / gap.
const forecast = decisionData().forecast

describe('computeWhatIf', () => {
  it('buys demand minus the wind share, at the forecast and at firm wind', () => {
    // Share 10%: wind 1,000 / 1,000 / 900 (firm 800 / 800 / 750) against a flat 1,500 MW.
    const r = computeWhatIf(forecast, [1500, 1500, 1500, 1500], 10)
    expect(r.hours.map((h) => h.residual_p50_mw)).toEqual([500, 500, 600, null])
    expect(r.hours.map((h) => h.residual_firm_mw)).toEqual([700, 700, 750, null])
    expect(r.covered_hours).toBe(3)
    // Totals cover the 3 forecast hours only: 3 × 1,500; 1,000 + 1,000 + 900; 800 + 800 + 750.
    expect(r.demand_mwh).toBe(4500)
    expect(r.wind_p50_mwh).toBe(2900)
    expect(r.wind_firm_mwh).toBe(2350)
    expect(r.residual_p50_mwh).toBe(1600) // 500 + 500 + 600
    expect(r.residual_firm_mwh).toBe(2150) // 700 + 700 + 750
  })

  it('never buys a negative volume when the wind share exceeds demand', () => {
    // Share 6%: wind 600 / 600 / 540, firm 480 / 480 / 450 against 500 MW.
    const r = computeWhatIf(forecast, [500, 500, 500, 500], 6)
    expect(r.hours.map((h) => h.residual_p50_mw)).toEqual([0, 0, 0, null])
    expect(r.hours.map((h) => h.residual_firm_mw)).toEqual([20, 20, 50, null])
  })

  it('uses hourly demand values hour by hour', () => {
    const r = computeWhatIf(forecast, [2000, 1000, 900, 5000], 10)
    expect(r.hours.map((h) => h.residual_p50_mw)).toEqual([1000, 0, 0, null])
    expect(r.hours.map((h) => h.residual_firm_mw)).toEqual([1200, 200, 150, null])
    expect(r.demand_mwh).toBe(3900) // the 5,000 MW gap hour is left out
  })

  it('with no wind share, buys all of the demand either way', () => {
    const r = computeWhatIf(forecast, [1500, 1500, 1500, 1500], 0)
    expect(r.residual_p50_mwh).toBe(4500)
    expect(r.residual_firm_mwh).toBe(4500)
  })
})

describe('parseHourlyDemand', () => {
  it('reads a single line split on commas and spaces', () => {
    expect(parseHourlyDemand('1500, 1480 1460', 3)).toEqual({
      ok: true,
      values: [1500, 1480, 1460],
    })
  })

  it('reads a pasted spreadsheet column with thousands separators', () => {
    expect(parseHourlyDemand('1,500\n1,480\r\n1,460\n', 3)).toEqual({
      ok: true,
      values: [1500, 1480, 1460],
    })
    expect(parseHourlyDemand('1500\t1480.5\t1460', 3)).toEqual({
      ok: true,
      values: [1500, 1480.5, 1460],
    })
  })

  it('explains what is wrong', () => {
    expect(parseHourlyDemand('', 24)).toEqual({ ok: false, error: 'Paste 24 hourly values in MW.' })
    expect(parseHourlyDemand('1500, abc, 1460', 3)).toEqual({
      ok: false,
      error: '“abc” is not a number.',
    })
    expect(parseHourlyDemand('-5, 1, 2', 3)).toEqual({
      ok: false,
      error: 'Demand cannot be negative.',
    })
    expect(parseHourlyDemand('1, 2', 3)).toEqual({
      ok: false,
      error: 'Expected 3 hourly values, got 2.',
    })
  })
})

describe('whatIfCsv', () => {
  it('has one row per hour, gaps left empty', () => {
    const csv = whatIfCsv(computeWhatIf(forecast, [1500, 1500, 1500, 1500], 10), 10, 90)
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'target_time_utc,target_time_uk,demand_mw,wind_share_pct,wind_share_forecast_mw,wind_share_firm_mw_p90,to_buy_at_forecast_mw,to_buy_at_firm_mw_p90',
    )
    expect(lines).toHaveLength(5)
    expect(lines[1]).toMatch(/^2026-01-15T00:00:00Z,.*,1500,10,1000,800,500,700$/)
    expect(lines[4]).toMatch(/,1500,10,,,,$/)
  })
})
