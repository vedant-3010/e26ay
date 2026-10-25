import type { EChartsOption } from 'echarts'

import type { DecisionData } from '@/api/client'
import { fmtAxisMW, fmtHours, fmtMW, fmtSignedMW } from '@/lib/format'
import { fmtUkDateTime, fmtUkTime } from '@/lib/time'

import type { LegendItem } from './ChartLegend'
import { axisLine, baseOption, splitLine, withAlpha, type ChartColors } from './theme'
import { axisTime, header, note, row } from './tooltip'

const HOUR_MS = 3_600_000

type SeriesList = Extract<NonNullable<EChartsOption['series']>, unknown[]>

export interface DecisionChartView {
  hindsight: boolean
  confidencePct: number
}

/** Hours (start ms) where actual at the period starting on the hour is below forecast, split into
 * those where firm wind still held and those where actual fell below firm wind too. */
export function shortfallHours(data: DecisionData): { shortfall: number[]; belowFirm: number[] } {
  const actualAt = new Map(data.actual.map((p) => [p.t, p.mw]))
  const shortfall: number[] = []
  const belowFirm: number[] = []
  for (const p of data.forecast) {
    const actual = actualAt.get(p.t)
    if (p.mw === null || actual === null || actual === undefined || actual >= p.mw) continue
    const t = Date.parse(p.t)
    if (p.firm_mw !== null && actual < p.firm_mw) belowFirm.push(t)
    else shortfall.push(t)
  }
  return { shortfall, belowFirm }
}

/** Two stacked hourly areas that fill only the gap between `actual` and an upper line, in hours
 * where actual is below it (zero-height elsewhere). Hourly, because errors use the period starting
 * on the hour (ADR-0004); missing values stay gaps. */
function gapArea(
  data: DecisionData,
  upper: (p: DecisionData['forecast'][number]) => number | null,
): { base: [number, number | null][]; gap: [number, number | null][] } {
  const actualAt = new Map(data.actual.map((p) => [p.t, p.mw]))
  const base: [number, number | null][] = []
  const gap: [number, number | null][] = []
  for (const p of data.forecast) {
    const t = Date.parse(p.t)
    const top = upper(p)
    const actual = actualAt.get(p.t)
    if (top === null || actual === null || actual === undefined) {
      base.push([t, null])
      gap.push([t, null])
    } else {
      base.push([t, Math.min(actual, top)])
      gap.push([t, Math.max(top - actual, 0)])
    }
  }
  return { base, gap }
}

/** Main Decision Desk chart: forecast, firm band, and (hindsight) actual + shortfall hours. */
export function buildDecisionOption(
  data: DecisionData,
  c: ChartColors,
  { hindsight, confidencePct }: DecisionChartView,
): EChartsOption {
  const forecastAt = new Map(data.forecast.map((p) => [Date.parse(p.t), p]))
  const actualAt = new Map(data.actual.map((p) => [Date.parse(p.t), p.mw]))
  const dayStart = Date.parse(data.forecast[0]?.t ?? data.delivery_date)
  const dayEnd = dayStart + data.forecast.length * HOUR_MS
  const firmName = `Firm wind (${confidencePct}%)`

  const tooltipFormatter = (raw: unknown): string => {
    const t = axisTime(raw)
    if (!Number.isFinite(t)) return ''
    const hourStart = t - (t % HOUR_MS)
    const fc = forecastAt.get(hourStart)
    const actual = actualAt.get(t)
    const lines = [header(t)]
    if (fc) {
      const suffix = t === hourStart ? '' : ` for ${fmtUkTime(hourStart)}`
      lines.push(row(c.forecast, fmtMW(fc.mw), `forecast${suffix}`))
      lines.push(row(c.forecast, fmtMW(fc.firm_mw), `firm wind (${confidencePct}%)`, 'square'))
    }
    if (hindsight && actual !== undefined) {
      lines.push(row(c.actual, fmtMW(actual), 'actual'))
      if (fc && t === hourStart && fc.mw !== null && actual !== null) {
        const error = fc.mw - actual
        const label = error > 0 ? 'error · shortfall' : error < 0 ? 'error · surplus' : 'error'
        lines.push(row(error > 0 ? c.shortfall : c.surplus, fmtSignedMW(error), label, 'square'))
      }
    }
    if (fc?.mw === null) lines.push(note('Gap: the decision run does not cover this hour'))
    else if (fc && t === hourStart) lines.push(note(`${fmtHours(fc.lead_h)} ahead at the cutoff`))
    return lines.join('')
  }

  const series: SeriesList = [
    {
      // Invisible base of the stacked band: the band is drawn from firm up to forecast.
      name: '__firm_base',
      type: 'line',
      stack: 'band',
      data: data.forecast.map((p) => [Date.parse(p.t), p.firm_mw]),
      symbol: 'none',
      lineStyle: { opacity: 0 },
      silent: true,
      tooltip: { show: false },
      connectNulls: false,
    },
    {
      name: firmName,
      type: 'line',
      stack: 'band',
      data: data.forecast.map((p) => [
        Date.parse(p.t),
        p.mw !== null && p.firm_mw !== null ? p.mw - p.firm_mw : null,
      ]),
      symbol: 'none',
      lineStyle: { opacity: 0 },
      // In Hindsight the band is context and the shortfall fill is the signal, so it recedes.
      areaStyle: { color: withAlpha(c.forecast, hindsight ? 0.08 : 0.18) },
      itemStyle: { color: withAlpha(c.forecast, 0.35) },
      connectNulls: false,
    },
    {
      name: '__firm_line',
      type: 'line',
      data: data.forecast.map((p) => [Date.parse(p.t), p.firm_mw]),
      symbol: 'none',
      lineStyle: { color: c.forecast, width: 1, opacity: 0.6 },
      silent: true,
      connectNulls: false,
    },
    {
      name: 'Forecast',
      type: 'line',
      data: data.forecast.map((p) => [Date.parse(p.t), p.mw]),
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: c.forecast, width: 2, join: 'round', cap: 'round' },
      itemStyle: { color: c.forecast, borderColor: c.surface, borderWidth: 1 },
      connectNulls: false,
      z: 3,
    },
  ]
  if (hindsight) {
    series.push(
      {
        name: 'Actual',
        type: 'line',
        data: data.actual.map((p) => [Date.parse(p.t), p.mw]),
        showSymbol: false,
        lineStyle: { color: c.actual, width: 2, join: 'round', cap: 'round' },
        itemStyle: { color: c.actual },
        connectNulls: false,
        z: 4,
      },
      ...gapSeries(
        'shortfall',
        'Shortfall',
        gapArea(data, (p) => p.mw),
        withAlpha(c.shortfall, 0.3),
      ),
      ...gapSeries(
        'belowfirm',
        'Below firm wind',
        gapArea(data, (p) => p.firm_mw),
        withAlpha(c.shortfallSevere, 0.35),
      ),
    )
  }

  return {
    ...baseOption(c),
    useUTC: true,
    legend: { show: false }, // HTML legend (ChartLegend) above the canvas
    grid: { left: 64, right: 12, top: 16, bottom: 32 },
    tooltip: { ...baseOption(c).tooltip, trigger: 'axis', formatter: tooltipFormatter },
    axisPointer: { lineStyle: { color: c.cutoff, width: 1, type: 'solid' } },
    xAxis: {
      type: 'time',
      min: dayStart,
      max: dayEnd,
      interval: 3 * HOUR_MS,
      axisLabel: { color: c.muted, formatter: (v: number) => fmtUkTime(v), hideOverlap: true },
      axisTick: { show: false },
      axisLine: axisLine(c),
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'MW',
      nameLocation: 'middle',
      nameRotate: 90,
      nameGap: 48,
      nameTextStyle: { color: c.muted },
      min: 0,
      axisLabel: { color: c.muted, formatter: fmtAxisMW },
      splitLine: splitLine(c),
    },
    series,
  }
}

function gapSeries(
  id: string,
  name: string,
  area: ReturnType<typeof gapArea>,
  color: string,
): SeriesList {
  return [
    {
      name: `__${id}_base`,
      type: 'line',
      stack: id,
      data: area.base,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      silent: true,
      connectNulls: false,
      z: 1,
    },
    {
      name,
      type: 'line',
      stack: id,
      data: area.gap,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      areaStyle: { color },
      itemStyle: { color },
      silent: true,
      connectNulls: false,
      z: 1,
    },
  ]
}

/** Legend for the HTML legend above the chart (keys mirror the marks). */
export function decisionLegend(hindsight: boolean, confidencePct: number): LegendItem[] {
  const items: LegendItem[] = [
    { label: 'Forecast (decision run)', color: 'var(--forecast)', kind: 'marker-line' },
    {
      label: `Firm wind band (${confidencePct}%)`,
      color: 'color-mix(in srgb, var(--forecast) 35%, transparent)',
      kind: 'area',
    },
  ]
  if (hindsight) {
    items.push(
      { label: 'Actual', color: 'var(--actual)', kind: 'line' },
      {
        label: 'Shortfall',
        color: 'color-mix(in srgb, var(--shortfall) 45%, transparent)',
        kind: 'area',
      },
      {
        label: 'Below firm wind',
        color: 'color-mix(in srgb, var(--shortfall-severe) 50%, transparent)',
        kind: 'area',
      },
    )
  }
  return items
}

export function decisionAriaLabel(data: DecisionData, hindsight: boolean): string {
  const day = fmtUkDateTime(data.forecast[0]?.t ?? data.delivery_date)
    .split(' ')
    .slice(0, 3)
    .join(' ')
  const base = `Wind forecast for ${day} from the run published ${
    data.run.publish_time ? fmtUkDateTime(data.run.publish_time) : 'never'
  }, with the firm-wind band; average firm wind ${fmtMW(data.kpis.avg_firm_mw)}.`
  return hindsight
    ? `${base} Actual wind overlaid; largest shortfall ${fmtMW(data.kpis.max_shortfall_mw)}.`
    : base
}
