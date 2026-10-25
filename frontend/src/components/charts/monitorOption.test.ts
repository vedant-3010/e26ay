import { monitorData } from '@/test/fixtures'

import { buildMonitorOption } from './monitorOption'
import type { ChartColors } from './theme'

const COLORS: ChartColors = {
  actual: 'blue',
  forecast: 'green',
  shortfall: 'amber',
  shortfallSevere: 'red',
  surplus: 'slate',
  cutoff: 'ink',
  grid: 'grid',
  text: 'text',
  muted: 'muted',
  surface: 'surface',
  border: 'border',
  popover: 'popover',
}

interface Series {
  name: string
  data: [number, number | null][]
  xAxisIndex: number
  itemStyle: { color: string }
}

function option() {
  return buildMonitorOption(monitorData(), COLORS) as unknown as {
    series: Series[]
    xAxis: unknown[]
    dataZoom: { xAxisIndex: number[] }[]
    useUTC: boolean
    tooltip: { formatter: (params: unknown) => string }
  }
}

const T0 = Date.parse('2026-01-02T00:00:00Z')

describe('buildMonitorOption', () => {
  it('draws actual and forecast on the top grid and errors on the bottom grid', () => {
    const o = option()
    expect(o.series.map((s) => [s.name, s.xAxisIndex])).toEqual([
      ['Actual', 0],
      ['Forecast', 0],
      ['Shortfall', 1],
      ['Surplus', 1],
    ])
    expect(o.series[0]!.itemStyle.color).toBe('blue')
    expect(o.series[1]!.itemStyle.color).toBe('green')
    expect(o.xAxis).toHaveLength(2)
    expect(o.dataZoom.every((z) => z.xAxisIndex.join() === '0,1')).toBe(true)
    expect(o.useUTC).toBe(true)
  })

  it('splits error = forecast − actual (period starting at the hour) by sign', () => {
    const [, , shortfall, surplus] = option().series
    // 00:00: 12,000 − 10,000 = +2,000; 01:00: 9,000 − 10,000 = −1,000; 02:00: no forecast.
    expect(shortfall!.data).toEqual([
      [T0, 2000],
      [T0 + 3_600_000, null],
      [T0 + 7_200_000, null],
    ])
    expect(surplus!.data.map(([, v]) => v)).toEqual([null, -1000, null])
  })

  it('keeps gaps as gaps (no connected nulls)', () => {
    const forecast = option().series[1] as unknown as { data: unknown[]; connectNulls: boolean }
    expect(forecast.connectNulls).toBe(false)
    expect(forecast.data[2]).toEqual([T0 + 7_200_000, null])
  })

  it('tooltip shows UK time, values, error and the run used', () => {
    const html = option().tooltip.formatter([{ axisValue: T0 }])
    expect(html).toContain('Fri 2 Jan 00:00')
    expect(html).toContain('10,000 MW')
    expect(html).toContain('12,000 MW')
    expect(html).toContain('+2,000 MW')
    expect(html).toContain('shortfall')
    expect(html).toContain('Run published Wed 31 Dec 22:30 · 25.5 h ahead')
  })

  it('tooltip explains a missing forecast and half-hour points', () => {
    const tip = option().tooltip.formatter
    expect(tip([{ axisValue: T0 + 7_200_000 }])).toContain(
      'No run published ≥ 24 h before this hour',
    )
    const halfHour = tip([{ axisValue: T0 + 1_800_000 }])
    expect(halfHour).toContain('10,100 MW')
    expect(halfHour).toContain('forecast for 00:00')
    expect(halfHour).toContain('Forecasts are hourly')
    expect(tip([{ axisValue: Number.NaN }])).toBe('')
  })
})
