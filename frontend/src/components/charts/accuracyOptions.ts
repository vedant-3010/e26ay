/**
 * Accuracy Lab option builders (pure, unit-tested). Colour jobs:
 * - error magnitudes are neutral ink/slate (they are not "actual" or "forecast");
 * - bias and shortfall are amber (positive error = shortfall), surpluses slate;
 * - firm-wind coverage is green (it is about the forecast's firm band).
 * One axis per grid: two measures with different units are stacked grids, never a dual axis.
 */
import type { EChartsOption } from 'echarts'

import type { AccuracyData } from '@/api/client'
import { fmtAxisMW, fmtCount, fmtHours, fmtMW, fmtPct, fmtSignedMW } from '@/lib/format'
import { fmtCalendarDate } from '@/lib/time'

import type { LegendItem } from './ChartLegend'
import { axisLine, baseOption, splitLine, withAlpha, type ChartColors } from './theme'
import { note, row } from './tooltip'

type SeriesList = Extract<NonNullable<EChartsOption['series']>, unknown[]>

function title(text: string): string {
  return `<div style="font-weight:600;margin-bottom:4px">${text}</div>`
}

function valueAxis(c: ChartColors, name: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'value' as const,
    name,
    nameLocation: 'middle' as const,
    nameRotate: 90,
    nameGap: 48,
    nameTextStyle: { color: c.muted },
    axisLabel: { color: c.muted, formatter: fmtAxisMW },
    splitLine: splitLine(c),
    ...extra,
  }
}

function firstParam(raw: unknown): { dataIndex: number; axisValue?: number | string } | undefined {
  return (Array.isArray(raw) ? raw[0] : raw) as
    { dataIndex: number; axisValue?: number | string } | undefined
}

// ---------------------------------------------------------------- A. lead curve

export function leadLegend(windowLabel: string): LegendItem[] {
  return [
    { label: 'MAE', color: 'var(--foreground)', kind: 'thick-line' },
    { label: 'P90 |error|', color: 'var(--surplus)', kind: 'line' },
    { label: 'P99 |error|', color: 'var(--vintage-early)', kind: 'line' },
    { label: 'Bias (+ = over-forecast)', color: 'var(--shortfall)', kind: 'line' },
    {
      label: windowLabel,
      color: 'color-mix(in srgb, var(--forecast) 20%, transparent)',
      kind: 'area',
    },
  ]
}

export function buildLeadCurveOption(data: AccuracyData, c: ChartColors): EChartsOption {
  const bins = data.lead_curve
  const window = data.decision_lead_window_h
  const pick = (key: 'mae_mw' | 'p90_abs_mw' | 'p99_abs_mw' | 'bias_mw') =>
    bins.map((b) => [b.lead_h, b[key]])
  const line = (name: string, key: Parameters<typeof pick>[0], color: string, width: number) => ({
    name,
    type: 'line' as const,
    data: pick(key),
    showSymbol: false,
    lineStyle: { color, width },
    itemStyle: { color },
  })
  const series: SeriesList = [
    {
      ...line('MAE', 'mae_mw', c.text, 2.5),
      z: 4,
      markArea: window
        ? {
            silent: true,
            itemStyle: { color: withAlpha(c.forecast, 0.1) },
            data: [[{ xAxis: window[0] }, { xAxis: window[1] }]],
          }
        : undefined,
    },
    line('P90 |error|', 'p90_abs_mw', c.surplus, 2),
    line('P99 |error|', 'p99_abs_mw', c.vintageEarly, 1.5),
    line('Bias', 'bias_mw', c.shortfall, 2),
  ]
  return {
    ...baseOption(c),
    legend: { show: false },
    grid: { left: 64, right: 16, top: 16, bottom: 40 },
    tooltip: {
      ...baseOption(c).tooltip,
      trigger: 'axis',
      formatter: (raw: unknown) => {
        const p = firstParam(raw)
        const b = p ? bins[p.dataIndex] : undefined
        if (!b) return ''
        return [
          title(`${fmtHours(b.lead_h - 0.5)}–${fmtHours(b.lead_h + 0.5)} ahead`),
          row(c.text, fmtMW(b.mae_mw), 'MAE'),
          row(c.surplus, fmtMW(b.p90_abs_mw), 'P90 |error|'),
          row(c.vintageEarly, fmtMW(b.p99_abs_mw), 'P99 |error|'),
          row(c.shortfall, fmtSignedMW(b.bias_mw), 'bias'),
          note(`${fmtCount(b.n)} forecast–actual pairs`),
        ].join('')
      },
    },
    axisPointer: { lineStyle: { color: c.cutoff, width: 1, type: 'solid' } },
    xAxis: {
      type: 'value',
      min: 0,
      max: 48,
      interval: 6,
      name: 'Lead time (h)',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: c.muted },
      axisLabel: { color: c.muted, formatter: (v: number) => `${v} h` },
      axisLine: axisLine(c),
      splitLine: { show: false },
    },
    yAxis: valueAxis(c, 'MW'),
    series,
  }
}

// ---------------------------------------------------------------- B. distribution

export function buildDistributionOption(data: AccuracyData, c: ChartColors): EChartsOption {
  const d = data.distribution
  const width = d.bin_edges_mw.length > 1 ? d.bin_edges_mw[1]! - d.bin_edges_mw[0]! : 250
  const bars = d.counts.map((n, i) => {
    const left = d.bin_edges_mw[i]!
    return {
      value: [left + width / 2, n],
      itemStyle: { color: left >= 0 ? c.shortfall : c.surplus, borderRadius: [2, 2, 0, 0] },
    }
  })
  const marker = (label: string, value: number | null) =>
    value === null
      ? []
      : [
          {
            xAxis: value,
            // Short labels: they collide on phones; the values are in the panel footnote.
            label: { formatter: label, color: c.muted, fontSize: 11 },
          },
        ]
  return {
    ...baseOption(c),
    legend: { show: false },
    grid: { left: 56, right: 16, top: 28, bottom: 40 },
    tooltip: {
      ...baseOption(c).tooltip,
      trigger: 'item',
      formatter: (raw: unknown) => {
        const p = raw as { dataIndex: number }
        const left = d.bin_edges_mw[p.dataIndex]
        if (left === undefined) return ''
        return [
          title(`${fmtSignedMW(left)} to ${fmtSignedMW(left + width)}`),
          row(
            left >= 0 ? c.shortfall : c.surplus,
            fmtCount(d.counts[p.dataIndex]),
            'hours',
            'square',
          ),
          note(left >= 0 ? 'forecast above actual (shortfall)' : 'forecast below actual (surplus)'),
        ].join('')
      },
    },
    xAxis: {
      type: 'value',
      name: 'Forecast − actual (MW)',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: c.muted },
      axisLabel: { color: c.muted, formatter: fmtAxisMW, hideOverlap: true },
      axisLine: axisLine(c),
      splitLine: { show: false },
    },
    yAxis: { ...valueAxis(c, 'Hours'), nameGap: 36 },
    series: [
      {
        name: 'Hours',
        type: 'bar',
        data: bars,
        barCategoryGap: '8%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: c.cutoff, width: 1, type: 'solid' },
          label: { position: 'end' },
          data: [
            ...marker('P10', d.p10_mw),
            ...marker('P50', d.p50_mw),
            ...marker('P90', d.p90_mw),
          ],
        },
      },
    ],
  }
}

// ---------------------------------------------------------------- C. buffer by level

export function levelLabel(from: number, to: number | null, unit = true): string {
  const gw = (mw: number) => (mw / 1000).toFixed(1)
  const range = to === null ? `≥ ${gw(from)}` : `${gw(from)}–${gw(to)}`
  return unit ? `${range} GW` : range
}

/** `to 11.3` (or `18.1+` for the open top bin): a compact axis tick for a level bin, in GW. */
export function levelTick(from: number, to: number | null): string {
  const gw = (mw: number) => (mw / 1000).toFixed(1)
  return to === null ? `${gw(from)}+` : `to ${gw(to)}`
}

export function levelLegend(withCalibration: boolean, confidencePct: number): LegendItem[] {
  const items: LegendItem[] = [
    {
      label: 'P80 shortfall',
      color: 'color-mix(in srgb, var(--shortfall) 40%, transparent)',
      kind: 'area',
    },
    {
      label: 'P90 shortfall',
      color: 'color-mix(in srgb, var(--shortfall) 70%, transparent)',
      kind: 'area',
    },
    { label: 'P95 shortfall', color: 'var(--shortfall)', kind: 'area' },
  ]
  if (withCalibration) {
    items.push(
      {
        label: `Firm wind held (${confidencePct}% band)`,
        color: 'var(--forecast)',
        kind: 'marker-line',
      },
      { label: `Target ${confidencePct}%`, color: 'var(--cutoff)', kind: 'dashed' },
    )
  }
  return items
}

/** Bars of P80/P90/P95 shortfall per forecast-level bin (MW, top grid) and, for the decision
 * population, the achieved firm-wind coverage per bin (%, its own grid below). */
export function buildLevelOption(
  data: AccuracyData,
  c: ChartColors,
  confidencePct: number,
): EChartsOption {
  const bins = data.by_level
  // Short tick labels (upper bound; full ranges in the tooltip) so all five fit on a phone.
  const labels = bins.map((b) => levelTick(b.forecast_from_mw, b.forecast_to_mw))
  const withCalibration = bins.some((b) => b.achieved_pct !== null)
  const bar = (
    name: string,
    key: 'p80_shortfall_mw' | 'p90_shortfall_mw' | 'p95_shortfall_mw',
    alpha: number,
  ) => ({
    name,
    type: 'bar' as const,
    xAxisIndex: 0,
    yAxisIndex: 0,
    data: bins.map((b) => b[key]),
    barMaxWidth: 18,
    itemStyle: { color: withAlpha(c.shortfall, alpha), borderRadius: [3, 3, 0, 0] },
  })
  const series: SeriesList = [
    bar('P80 shortfall', 'p80_shortfall_mw', 0.4),
    bar('P90 shortfall', 'p90_shortfall_mw', 0.7),
    bar('P95 shortfall', 'p95_shortfall_mw', 1),
  ]
  const grids = withCalibration
    ? [
        { left: 64, right: 16, top: 16, height: '52%' },
        { left: 64, right: 16, top: '68%', height: '16%' },
      ]
    : [{ left: 64, right: 16, top: 16, bottom: 44 }]
  const xAxis = [
    {
      type: 'category' as const,
      gridIndex: 0,
      data: labels,
      axisLabel: { color: c.muted, show: !withCalibration, interval: 0, fontSize: 11 },
      name: withCalibration ? '' : 'Forecast level (GW)',
      nameLocation: 'middle' as const,
      nameGap: 28,
      nameTextStyle: { color: c.muted },
      axisTick: { show: false },
      axisLine: axisLine(c),
    },
  ]
  const yAxis: Record<string, unknown>[] = [valueAxis(c, 'MW', { gridIndex: 0 })]
  if (withCalibration) {
    xAxis.push({
      type: 'category',
      gridIndex: 1,
      data: labels,
      axisLabel: { color: c.muted, show: true, interval: 0, fontSize: 11 },
      name: 'Forecast level (GW)',
      nameLocation: 'middle' as const,
      nameGap: 28,
      nameTextStyle: { color: c.muted },
      axisTick: { show: false },
      axisLine: axisLine(c),
    })
    yAxis.push({
      ...valueAxis(c, 'Held %', { gridIndex: 1 }),
      min: 60,
      max: 100,
      interval: 20,
      axisLabel: { color: c.muted, formatter: (v: number) => `${v}%` },
    })
    series.push({
      name: 'Firm wind held',
      type: 'line',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: bins.map((b) => b.achieved_pct),
      symbol: 'circle',
      symbolSize: 9,
      lineStyle: { opacity: 0 },
      itemStyle: { color: c.forecast, borderColor: c.surface, borderWidth: 2 },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: c.cutoff, type: 'dashed', width: 1 },
        label: { show: false },
        data: [{ yAxis: confidencePct }],
      },
    })
  }
  return {
    ...baseOption(c),
    legend: { show: false },
    grid: grids,
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      ...baseOption(c).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (raw: unknown) => {
        const p = firstParam(raw)
        const b = p ? bins[p.dataIndex] : undefined
        if (!b) return ''
        const lines = [
          title(`Forecast ${levelLabel(b.forecast_from_mw, b.forecast_to_mw)}`),
          row(withAlpha(c.shortfall, 0.4), fmtMW(b.p80_shortfall_mw), 'P80 shortfall', 'square'),
          row(withAlpha(c.shortfall, 0.7), fmtMW(b.p90_shortfall_mw), 'P90 shortfall', 'square'),
          row(c.shortfall, fmtMW(b.p95_shortfall_mw), 'P95 shortfall', 'square'),
          row(c.text, fmtMW(b.mae_mw), 'MAE'),
          row(c.shortfall, fmtSignedMW(b.bias_mw), 'bias'),
        ]
        if (b.achieved_pct !== null) {
          lines.push(
            row(
              c.forecast,
              fmtPct(b.achieved_pct),
              `firm wind held (target ${confidencePct}%)`,
              'square',
            ),
          )
        }
        lines.push(note(`${fmtCount(b.n)} decision hours`))
        return lines.join('')
      },
    },
    xAxis,
    yAxis,
    series,
  }
}

// ---------------------------------------------------------------- D. by hour, E. daily

export const MAE_BIAS_LEGEND: LegendItem[] = [
  { label: 'MAE', color: 'var(--surplus)', kind: 'area' },
  { label: 'Bias (+ = over-forecast)', color: 'var(--shortfall)', kind: 'marker-line' },
]

function maeBiasOption(
  c: ChartColors,
  labels: string[],
  mae: (number | null)[],
  bias: (number | null)[],
  tooltipTitle: (i: number) => string,
  extraNote: (i: number) => string,
): EChartsOption {
  return {
    ...baseOption(c),
    legend: { show: false },
    grid: { left: 64, right: 16, top: 16, bottom: 32 },
    tooltip: {
      ...baseOption(c).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (raw: unknown) => {
        const p = firstParam(raw)
        if (!p) return ''
        const i = p.dataIndex
        return [
          title(tooltipTitle(i)),
          row(c.surplus, fmtMW(mae[i]), 'MAE', 'square'),
          row(c.shortfall, fmtSignedMW(bias[i]), 'bias'),
          note(extraNote(i)),
        ].join('')
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: c.muted, hideOverlap: true },
      axisTick: { show: false },
      axisLine: axisLine(c),
    },
    yAxis: valueAxis(c, 'MW'),
    series: [
      {
        name: 'MAE',
        type: 'bar',
        data: mae,
        barMaxWidth: 16,
        itemStyle: { color: withAlpha(c.surplus, 0.75), borderRadius: [3, 3, 0, 0] },
        emphasis: { itemStyle: { color: c.surplus } },
        cursor: 'pointer',
      },
      {
        name: 'Bias',
        type: 'line',
        data: bias,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: c.shortfall, width: 2 },
        itemStyle: { color: c.shortfall, borderColor: c.surface, borderWidth: 1 },
      },
    ],
  }
}

export function buildByHourOption(data: AccuracyData, c: ChartColors): EChartsOption {
  const h = data.by_hour
  return maeBiasOption(
    c,
    h.map((r) => `${String(r.hour_uk).padStart(2, '0')}:00`),
    h.map((r) => r.mae_mw),
    h.map((r) => r.bias_mw),
    (i) => `${String(h[i]?.hour_uk ?? 0).padStart(2, '0')}:00 UK`,
    (i) => `P90 shortfall ${fmtMW(h[i]?.p90_shortfall_mw)} · ${fmtCount(h[i]?.n)} hours`,
  )
}

export function buildDailyOption(data: AccuracyData, c: ChartColors): EChartsOption {
  const d = data.daily
  const short = (iso: string) => fmtCalendarDate(iso).split(' ').slice(1, 3).join(' ')
  return maeBiasOption(
    c,
    d.map((r) => short(r.delivery_date)),
    d.map((r) => r.mae_mw),
    d.map((r) => r.bias_mw),
    (i) => (d[i] ? fmtCalendarDate(d[i].delivery_date) : ''),
    (i) =>
      `Largest shortfall ${fmtMW(d[i]?.max_shortfall_mw)} · click to open in the Decision Desk`,
  )
}

/** The delivery day behind a clicked bar/point of the daily chart, if any. */
export function dailyClickDate(data: AccuracyData, params: unknown): string | null {
  const index = (params as { dataIndex?: number } | null)?.dataIndex
  return index === undefined ? null : (data.daily[index]?.delivery_date ?? null)
}
