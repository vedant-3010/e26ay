import type { EChartsOption } from 'echarts'

import type { DecisionData } from '@/api/client'
import { fmtAxisMW, fmtMW } from '@/lib/format'
import { fmtUkDateTime, fmtUkTime } from '@/lib/time'

import type { LegendItem } from './ChartLegend'
import { axisLine, baseOption, mix, splitLine, type ChartColors } from './theme'
import { axisTime, header, note, row } from './tooltip'

const HOUR_MS = 3_600_000

type SeriesList = Extract<NonNullable<EChartsOption['series']>, unknown[]>
export const EARLIER = 'Earlier runs'
export const DECISION = 'Decision run'
export const LATER = 'Later runs (not available at decision time)'

type Vintage = DecisionData['vintages'][number]

/** The runs shown: the Trader view never shows runs published after the cutoff (UI_SPEC §3.1). */
export function visibleVintages(data: DecisionData, hindsight: boolean): Vintage[] {
  return data.vintages.filter((v) => hindsight || !v.after_cutoff)
}

/** Forecast evolution: every run in the 48 h before the day. Older runs lighter, the decision run
 * bold green, later runs dashed. */
export function buildVintagesOption(
  data: DecisionData,
  c: ChartColors,
  { hindsight }: { hindsight: boolean },
): EChartsOption {
  const vintages = visibleVintages(data, hindsight)
  const earlier = vintages.filter((v) => !v.is_decision_run && !v.after_cutoff)
  const later = vintages.filter((v) => v.after_cutoff)
  const decision = vintages.find((v) => v.is_decision_run)
  const dayStart = Date.parse(data.forecast[0]?.t ?? data.delivery_date)
  const dayEnd = dayStart + data.forecast.length * HOUR_MS
  const actualAt = new Map(data.actual.map((p) => [Date.parse(p.t), p.mw]))

  const points = (v: Vintage) => v.points.map((p) => [Date.parse(p.t), p.mw])
  const valueAt = (v: Vintage | undefined, t: number) =>
    v?.points.find((p) => Date.parse(p.t) === t)?.mw ?? null

  const series: SeriesList = [
    ...earlier.map((v, i) => ({
      name: EARLIER,
      type: 'line' as const,
      data: points(v),
      symbol: 'none',
      lineStyle: {
        width: 1.5,
        color: mix(
          c.vintageEarly,
          c.vintageLate,
          earlier.length > 1 ? i / (earlier.length - 1) : 1,
        ),
      },
      itemStyle: { color: c.vintageLate },
      z: 1,
    })),
    ...later.map((v) => ({
      name: LATER,
      type: 'line' as const,
      data: points(v),
      symbol: 'none',
      lineStyle: { width: 1.5, type: 'dashed' as const, color: c.vintageLate },
      itemStyle: { color: c.vintageLate },
      z: 2,
    })),
  ]
  if (decision) {
    series.push({
      name: DECISION,
      type: 'line',
      data: points(decision),
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 3, color: c.forecast },
      itemStyle: { color: c.forecast, borderColor: c.surface, borderWidth: 1 },
      z: 4,
    })
  }
  if (hindsight) {
    series.push({
      name: 'Actual',
      type: 'line',
      data: data.actual.map((p) => [Date.parse(p.t), p.mw]),
      showSymbol: false,
      lineStyle: { width: 2, color: c.actual },
      itemStyle: { color: c.actual },
      connectNulls: false,
      z: 5,
    })
  }

  const tooltipFormatter = (raw: unknown): string => {
    const t = axisTime(raw)
    if (!Number.isFinite(t)) return ''
    const lines = [header(t)]
    if (t % HOUR_MS === 0) {
      const first = earlier[0]
      const last = later.at(-1)
      if (first) {
        lines.push(
          row(
            c.vintageEarly,
            fmtMW(valueAt(first, t)),
            `earliest run (${fmtUkDateTime(first.publish_time)})`,
          ),
        )
      }
      if (decision) {
        lines.push(
          row(
            c.forecast,
            fmtMW(valueAt(decision, t)),
            `decision run (${fmtUkDateTime(decision.publish_time)})`,
          ),
        )
      }
      if (last) {
        lines.push(
          row(
            c.vintageLate,
            fmtMW(valueAt(last, t)),
            `latest run (${fmtUkDateTime(last.publish_time)})`,
            'dash',
          ),
        )
      }
    }
    const actual = actualAt.get(t)
    if (hindsight && actual !== undefined) lines.push(row(c.actual, fmtMW(actual), 'actual'))
    lines.push(note(`${vintages.length} runs shown`))
    return lines.join('')
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

export function vintagesLegend(data: DecisionData, hindsight: boolean): LegendItem[] {
  const items: LegendItem[] = [
    { label: EARLIER, color: 'var(--vintage-late)', kind: 'line' },
    { label: DECISION, color: 'var(--forecast)', kind: 'thick-line' },
  ]
  if (visibleVintages(data, hindsight).some((v) => v.after_cutoff)) {
    items.push({ label: LATER, color: 'var(--vintage-late)', kind: 'dashed' })
  }
  if (hindsight) items.push({ label: 'Actual', color: 'var(--actual)', kind: 'line' })
  return items
}
