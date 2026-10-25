import { decisionData } from '@/test/fixtures'

import { buildDecisionOption, decisionLegend, shortfallHours } from './decisionOption'
import type { ChartColors } from './theme'
import {
  buildVintagesOption,
  DECISION,
  EARLIER,
  LATER,
  vintagesLegend,
  visibleVintages,
} from './vintagesOption'

const C: ChartColors = {
  actual: '#2563eb',
  forecast: '#16a34a',
  shortfall: '#d97706',
  shortfallSevere: '#dc2626',
  surplus: '#64748b',
  cutoff: '#334155',
  vintageEarly: '#cbd5e1',
  vintageLate: '#64748b',
  grid: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  surface: '#ffffff',
  border: '#e2e8f0',
  popover: '#ffffff',
}

interface AnySeries {
  name: string
  data: [number, number | null][]
  stack?: string
  lineStyle?: { type?: string; width?: number; color?: string }
  markArea?: { data: [{ xAxis: number }, { xAxis: number }][] }
}
type Opt = {
  series: AnySeries[]
  tooltip: { formatter: (p: unknown) => string }
  xAxis: { min: number; max: number }
}

const T = (h: number, m = 0) => Date.parse(`2026-01-15T0${h}:${m ? '30' : '00'}:00Z`)
const decision = (hindsight: boolean) =>
  buildDecisionOption(decisionData(), C, { hindsight, confidencePct: 90 }) as unknown as Opt
const names = (o: Opt) => o.series.map((s) => s.name)

describe('decision chart', () => {
  it('classifies hours by the period starting on the hour', () => {
    // 00:00 actual 9,000 < forecast 10,000 but ≥ firm 8,000; 01:00 actual 7,000 < firm.
    expect(shortfallHours(decisionData())).toEqual({ shortfall: [T(0)], belowFirm: [T(1)] })
  })

  it('Trader view shows forecast and firm band only', () => {
    const o = decision(false)
    expect(names(o)).toEqual(['__firm_base', 'Firm wind (90%)', '__firm_line', 'Forecast'])
    expect(decisionLegend(false, 90).map((l) => l.label)).toEqual([
      'Forecast (decision run)',
      'Firm wind band (90%)',
    ])
    expect(decisionLegend(true, 90)).toHaveLength(5)
  })

  it('Hindsight adds actual and fills only the gap below forecast / below firm', () => {
    const o = decision(true)
    expect(names(o)).toContain('Actual')
    const area = (name: string) => o.series.find((s) => s.name === name)!.data
    // Shortfall gap = max(forecast − actual, 0): 00:00 1,000; 01:00 3,000; 02:00 0 (surplus); gap.
    expect(area('Shortfall').map(([, v]) => v)).toEqual([1000, 3000, 0, null])
    // Below firm = max(firm − actual, 0): only 01:00 (8,000 − 7,000).
    expect(area('Below firm wind').map(([, v]) => v)).toEqual([0, 1000, 0, null])
    // Each area sits on min(actual, upper), so it spans exactly actual → upper.
    expect(area('__shortfall_base').map(([, v]) => v)).toEqual([9000, 7000, 9000, null])
  })

  it('stacks the band from firm to forecast and keeps the gap hour empty', () => {
    const [base, band] = decision(false).series
    expect(base!.stack).toBe('band')
    expect(band!.stack).toBe('band')
    expect(base!.data[0]).toEqual([T(0), 8000])
    expect(band!.data[0]).toEqual([T(0), 2000]) // 10,000 − 8,000
    expect(band!.data[3]).toEqual([T(3), null])
  })

  it('spans exactly the delivery day', () => {
    const o = decision(false)
    expect(o.xAxis.min).toBe(T(0))
    expect(o.xAxis.max).toBe(T(0) + 4 * 3_600_000)
  })

  it('tooltip: Trader view never shows the actual', () => {
    const trader = decision(false).tooltip.formatter([{ axisValue: T(1) }])
    expect(trader).toContain('10,000 MW')
    expect(trader).toContain('8,000 MW')
    expect(trader).not.toContain('7,000 MW')
    const hindsight = decision(true).tooltip.formatter([{ axisValue: T(1) }])
    expect(hindsight).toContain('7,000 MW')
    expect(hindsight).toContain('+3,000 MW')
    expect(decision(true).tooltip.formatter([{ axisValue: T(3) }])).toContain('Gap')
  })
})

describe('vintages chart', () => {
  const vintages = (hindsight: boolean) =>
    buildVintagesOption(decisionData(), C, { hindsight }) as unknown as Opt

  it('Trader view hides runs published after the cutoff', () => {
    expect(visibleVintages(decisionData(), false)).toHaveLength(2)
    const o = vintages(false)
    expect(names(o)).toEqual([EARLIER, DECISION])
    expect(vintagesLegend(decisionData(), false).map((l) => l.label)).not.toContain(LATER)
    expect(vintagesLegend(decisionData(), true).map((l) => l.label)).toContain(LATER)
  })

  it('Hindsight shows later runs dashed, the decision run bold, and the actual', () => {
    const o = vintages(true)
    expect(names(o)).toEqual([EARLIER, LATER, DECISION, 'Actual'])
    const later = o.series.find((s) => s.name === LATER)!
    expect(later.lineStyle!.type).toBe('dashed')
    const decisionRun = o.series.find((s) => s.name === DECISION)!
    expect(decisionRun.lineStyle).toMatchObject({ width: 3, color: C.forecast })
  })

  it('tooltip summarises earliest, decision and latest runs', () => {
    const html = vintages(true).tooltip.formatter([{ axisValue: T(0) }])
    expect(html).toContain('11,000 MW')
    expect(html).toContain('decision run (Wed 14 Jan 07:30)')
    expect(html).toContain('latest run (Wed 14 Jan 09:30)')
    expect(html).toContain('9,000 MW') // actual
  })
})
