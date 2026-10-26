import { accuracyData } from '@/test/fixtures'

import {
  buildDailyOption,
  buildDistributionOption,
  buildLeadCurveOption,
  buildLevelOption,
  dailyClickDate,
  levelLabel,
  levelTick,
  levelLegend,
} from './accuracyOptions'
import type { ChartColors } from './theme'

const C = {
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
} satisfies ChartColors

type Any = Record<string, unknown> & {
  series: {
    name: string
    data: unknown[]
    markArea?: { data: unknown }
    markLine?: { data: unknown[] }
    xAxisIndex?: number
  }[]
  grid: unknown
  yAxis: unknown
}

describe('accuracy charts', () => {
  it('lead curve: four statistics and the decision window shaded', () => {
    const o = buildLeadCurveOption(accuracyData(), C) as unknown as Any
    expect(o.series.map((s) => s.name)).toEqual(['MAE', 'P90 |error|', 'P99 |error|', 'Bias'])
    expect(o.series[0]!.markArea!.data).toEqual([[{ xAxis: 16.5 }, { xAxis: 39.5 }]])
    expect(o.series[3]!.data[0]).toEqual([0.5, 1455])
  })

  it('distribution: bars at bin centres, coloured by sign, with P10/P50/P90 lines', () => {
    const o = buildDistributionOption(accuracyData(), C) as unknown as Any
    const bars = o.series[0]!.data as { value: [number, number]; itemStyle: { color: string } }[]
    expect(bars.map((b) => b.value)).toEqual([
      [-375, 2],
      [-125, 5],
      [125, 9],
    ])
    expect(bars.map((b) => b.itemStyle.color)).toEqual([C.surplus, C.surplus, C.shortfall])
    expect((o.series[0]!.markLine!.data as { xAxis: number }[]).map((m) => m.xAxis)).toEqual([
      -426, 1582, 4154,
    ])
  })

  it('buffer by level: achieved % gets its own grid, never a second axis on the bars', () => {
    const o = buildLevelOption(accuracyData(), C, 90) as unknown as Any
    expect(o.grid).toHaveLength(2)
    expect(o.yAxis).toHaveLength(2)
    const held = o.series.find((s) => s.name === 'Firm wind held')!
    expect(held.xAxisIndex).toBe(1)
    expect(held.data).toEqual([88.5, 85.1])
    expect(levelLegend(true, 90).map((l) => l.label)).toContain('Target 90%')
  })

  it('buffer by level without calibration (fixed horizon) is a single grid', () => {
    const data = accuracyData({
      calibration: null,
      by_level: accuracyData().by_level.map((b) => ({ ...b, achieved_pct: null })),
    })
    const o = buildLevelOption(data, C, 90) as unknown as Any
    expect(o.grid).toHaveLength(1)
    expect(o.series.map((s) => s.name)).not.toContain('Firm wind held')
  })

  it('formats bin labels', () => {
    expect(levelLabel(0, 8200)).toBe('0.0–8.2 GW')
    expect(levelLabel(18100, null, false)).toBe('≥ 18.1')
    expect(levelTick(8200, 11300)).toBe('to 11.3')
    expect(levelTick(18100, null)).toBe('18.1+')
  })

  it('daily chart: a click resolves to the delivery day', () => {
    const data = accuracyData()
    expect((buildDailyOption(data, C) as unknown as Any).series.map((s) => s.name)).toEqual([
      'MAE',
      'Bias',
    ])
    expect(dailyClickDate(data, { dataIndex: 1 })).toBe('2026-01-28')
    expect(dailyClickDate(data, { dataIndex: 9 })).toBeNull()
    expect(dailyClickDate(data, null)).toBeNull()
  })
})
