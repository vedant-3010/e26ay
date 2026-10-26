import { decisionData } from '@/test/fixtures'
import { computeWhatIf } from '@/lib/whatIf'

import type { ChartColors } from './theme'
import {
  buildWhatIfOption,
  extraForConfidence,
  whatIfAriaLabel,
  whatIfLegend,
} from './whatIfOption'

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
  type: string
  stack?: string
  data: (number | null)[]
}
type Opt = {
  series: AnySeries[]
  yAxis: unknown
  xAxis: { data: string[] }
  tooltip: { formatter: (p: unknown) => string }
}

// Fixture forecast 10,000 / 10,000 / 9,000 / gap (firm 8,000 / 8,000 / 7,500); 10%, flat 1,500 MW.
const result = computeWhatIf(decisionData().forecast, [1500, 1500, 1500, 1500], 10)
const option = buildWhatIfOption(result, C, 90) as unknown as Opt

describe('buildWhatIfOption', () => {
  it('stacks the extra for confidence on top of the forecast volume, on one MW axis', () => {
    expect(Array.isArray(option.yAxis)).toBe(false) // no dual axis
    const [p50, extra, demand] = option.series
    expect(p50).toMatchObject({ type: 'bar', stack: 'buy', data: [500, 500, 600, null] })
    // Extra = firm residual − forecast residual: 700 − 500, 700 − 500, 750 − 600.
    expect(extra).toMatchObject({ type: 'bar', stack: 'buy', data: [200, 200, 150, null] })
    expect(demand).toMatchObject({ type: 'line', data: [1500, 1500, 1500, 1500] })
    expect(extraForConfidence(result)).toEqual([200, 200, 150, null])
  })

  it('labels hours in UK time and explains gaps in the tooltip', () => {
    expect(option.xAxis.data).toEqual(['00:00', '01:00', '02:00', '03:00'])
    const covered = option.tooltip.formatter([{ dataIndex: 2 }])
    expect(covered).toContain('600 MW')
    expect(covered).toContain('150 MW')
    expect(covered).toContain('750 MW to buy at 90%')
    expect(option.tooltip.formatter([{ dataIndex: 3 }])).toContain('Gap')
  })

  it('has a legend and an accessible summary with units', () => {
    expect(whatIfLegend(90).map((i) => i.label)).toEqual([
      'Demand',
      'To buy at the forecast (P50)',
      'Extra to buy at 90% firm wind',
    ])
    expect(whatIfAriaLabel(result, 90)).toBe(
      'Hourly volume left to buy: 1,600 MWh in total at the forecast, 2,150 MWh at 90% firm wind, against 4,500 MWh of demand.',
    )
  })
})
