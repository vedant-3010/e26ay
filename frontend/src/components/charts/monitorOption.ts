import type { EChartsOption } from 'echarts'

import type { MonitorData } from '@/api/client'
import { fmtAxisMW, fmtHours, fmtMW, fmtSignedMW } from '@/lib/format'
import { fmtUkDateTime, fmtUkDay, fmtUkTime } from '@/lib/time'

import type { LegendItem } from './ChartLegend'
import { axisLine, baseOption, splitLine, withAlpha, type ChartColors } from './theme'
import { axisTime, header, note, row } from './tooltip'

const HOUR_MS = 3_600_000

/** Pure option builder (unit-tested): two grids sharing the time axis, linked zoom and crosshair. */
export function buildMonitorOption(data: MonitorData, c: ChartColors): EChartsOption {
  const actualAt = new Map(data.actual.map((p) => [Date.parse(p.t), p.mw]))
  const forecastAt = new Map(data.forecast.map((p) => [Date.parse(p.t), p]))

  const errors = data.forecast.map((p) => {
    const t = Date.parse(p.t)
    const actual = actualAt.get(t)
    const error = p.mw !== null && actual !== null && actual !== undefined ? p.mw - actual : null
    return [t, error] as const
  })

  const tooltipFormatter = (raw: unknown): string => {
    const t = axisTime(raw)
    if (!Number.isFinite(t)) return ''
    const actual = actualAt.get(t)
    const fc = forecastAt.get(t)
    const lines = [header(t)]
    if (actual !== undefined) lines.push(row(c.actual, fmtMW(actual), 'actual'))
    if (fc) {
      lines.push(row(c.forecast, fmtMW(fc.mw), 'forecast'))
      if (fc.mw !== null && actual !== null && actual !== undefined) {
        const error = fc.mw - actual
        const label = error > 0 ? 'error · shortfall' : error < 0 ? 'error · surplus' : 'error'
        lines.push(row(error > 0 ? c.shortfall : c.surplus, fmtSignedMW(error), label, 'square'))
      }
      lines.push(
        note(
          fc.publish_time
            ? `Run published ${fmtUkDateTime(fc.publish_time)} · ${fmtHours(fc.lead_h)} ahead`
            : `No run published ≥ ${fmtHours(data.params.horizon_h)} before this hour`,
        ),
      )
    } else {
      // A half-hour period: show the hourly forecast it belongs to, for context (no error is
      // computed against it; errors use the period starting on the hour, ADR-0004).
      const hourFc = forecastAt.get(t - (t % HOUR_MS))
      if (hourFc)
        lines.push(row(c.forecast, fmtMW(hourFc.mw), `forecast for ${fmtUkTime(hourFc.t)}`))
      lines.push(note('Forecasts are hourly'))
    }
    return lines.join('')
  }

  const timeLabel = (value: number): string =>
    new Date(value).getUTCHours() === 0 && new Date(value).getUTCMinutes() === 0
      ? fmtUkDay(value)
      : fmtUkTime(value)

  return {
    ...baseOption(c),
    // Ticks at UTC boundaries; labels are formatted in UK time (equal in January).
    useUTC: true,
    legend: { show: false }, // HTML legend (ChartLegend) above the canvas
    grid: [
      { left: 64, right: 12, top: 12, height: '56%' },
      { left: 64, right: 12, top: '71%', height: '15%' },
    ],
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      lineStyle: { color: c.cutoff, width: 1, type: 'solid' },
    },
    tooltip: { ...baseOption(c).tooltip, trigger: 'axis', formatter: tooltipFormatter },
    xAxis: [
      {
        type: 'time',
        gridIndex: 0,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: axisLine(c),
        splitLine: { show: false },
      },
      {
        type: 'time',
        gridIndex: 1,
        axisLabel: { color: c.muted, formatter: timeLabel, hideOverlap: true },
        axisTick: { show: false },
        axisLine: axisLine(c),
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: 'MW',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 48,
        nameTextStyle: { color: c.muted },
        min: 0,
        splitNumber: 5,
        axisLabel: { color: c.muted, formatter: fmtAxisMW },
        splitLine: splitLine(c),
      },
      {
        type: 'value',
        gridIndex: 1,
        name: 'Error MW',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 48,
        nameTextStyle: { color: c.muted },
        splitNumber: 2,
        axisLabel: { color: c.muted, formatter: fmtAxisMW },
        splitLine: splitLine(c),
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], minValueSpan: 6 * HOUR_MS },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        bottom: 4,
        height: 18,
        borderColor: c.border,
        backgroundColor: 'transparent',
        fillerColor: withAlpha(c.forecast, 0.1),
        handleStyle: { color: c.surface, borderColor: c.muted },
        moveHandleStyle: { color: c.grid },
        dataBackground: { lineStyle: { color: c.grid }, areaStyle: { color: c.grid } },
        selectedDataBackground: { lineStyle: { color: c.muted }, areaStyle: { color: c.grid } },
        textStyle: { color: c.muted },
        labelFormatter: (value: number) => fmtUkDay(value),
        minValueSpan: 6 * HOUR_MS,
      },
    ],
    series: [
      {
        name: 'Actual',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: data.actual.map((p) => [Date.parse(p.t), p.mw]),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: c.actual, width: 2, join: 'round', cap: 'round' },
        itemStyle: { color: c.actual },
        z: 3,
      },
      {
        name: 'Forecast',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: data.forecast.map((p) => [Date.parse(p.t), p.mw]),
        symbol: 'circle',
        symbolSize: 5,
        showAllSymbol: 'auto',
        connectNulls: false,
        lineStyle: { color: c.forecast, width: 2, join: 'round', cap: 'round' },
        itemStyle: { color: c.forecast, borderColor: c.surface, borderWidth: 1 },
        z: 2,
      },
      {
        name: 'Shortfall',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        stack: 'error',
        data: errors.map(([t, e]) => [t, e !== null && e > 0 ? e : null]),
        itemStyle: { color: c.shortfall, borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 8,
        barCategoryGap: '20%',
      },
      {
        name: 'Surplus',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        stack: 'error',
        data: errors.map(([t, e]) => [t, e !== null && e < 0 ? e : null]),
        itemStyle: { color: c.surplus, borderRadius: [0, 0, 2, 2] },
        barMaxWidth: 8,
      },
    ],
  }
}

export const MONITOR_LEGEND: LegendItem[] = [
  { label: 'Actual (half-hourly)', color: 'var(--actual)', kind: 'line' },
  { label: 'Forecast (hourly)', color: 'var(--forecast)', kind: 'marker-line' },
  { label: 'Shortfall', color: 'var(--shortfall)', kind: 'area' },
  { label: 'Surplus', color: 'var(--surplus)', kind: 'area' },
]
