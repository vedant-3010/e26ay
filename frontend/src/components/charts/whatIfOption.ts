import type { EChartsOption } from 'echarts'

import { fmtAxisMW, fmtMW, fmtMWh } from '@/lib/format'
import { fmtUkTime } from '@/lib/time'
import type { WhatIfResult } from '@/lib/whatIf'

import type { LegendItem } from './ChartLegend'
import { axisLine, baseOption, splitLine, withAlpha, type ChartColors } from './theme'
import { note, row } from './tooltip'

/** Per hour: the extra volume that planning on firm wind adds on top of buying at the forecast. */
export function extraForConfidence(r: WhatIfResult): (number | null)[] {
  return r.hours.map((h) =>
    h.residual_p50_mw === null || h.residual_firm_mw === null
      ? null
      : h.residual_firm_mw - h.residual_p50_mw,
  )
}

/**
 * Procurement what-if (PRD F7): stacked hourly bars of what is left to buy at the forecast (P50)
 * and the extra at firm wind, with demand as a stepped reference line. Everything is MW on one
 * axis; gap hours stay empty.
 */
export function buildWhatIfOption(
  r: WhatIfResult,
  c: ChartColors,
  confidencePct: number,
): EChartsOption {
  const labels = r.hours.map((h) => fmtUkTime(h.t))
  const extra = extraForConfidence(r)

  const tooltipFormatter = (raw: unknown): string => {
    const first = (Array.isArray(raw) ? raw[0] : raw) as { dataIndex?: number } | undefined
    const i = first?.dataIndex ?? -1
    const h = r.hours[i]
    if (!h) return ''
    const lines = [
      `<div style="font-weight:600;margin-bottom:4px">${labels[i]} <span style="opacity:.6;font-weight:400">UK</span></div>`,
      row(c.text, fmtMW(h.demand_mw), 'demand'),
    ]
    if (h.residual_p50_mw === null) {
      lines.push(note('Gap: the decision run does not cover this hour'))
    } else {
      lines.push(row(c.surplus, fmtMW(h.residual_p50_mw), 'to buy at the forecast', 'square'))
      lines.push(row(c.shortfall, fmtMW(extra[i]), `extra at ${confidencePct}%`, 'square'))
      lines.push(
        note(
          `${fmtMW(h.residual_firm_mw)} to buy at ${confidencePct}% · your wind share ${fmtMW(h.wind_p50_mw)} forecast, ${fmtMW(h.wind_firm_mw)} firm`,
        ),
      )
    }
    return lines.join('')
  }

  return {
    ...baseOption(c),
    legend: { show: false }, // HTML legend (ChartLegend) above the canvas
    grid: { left: 64, right: 12, top: 16, bottom: 32 },
    tooltip: {
      ...baseOption(c).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: c.muted, interval: 2, hideOverlap: true },
      axisTick: { show: false },
      axisLine: axisLine(c),
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
    series: [
      {
        name: 'To buy at the forecast',
        type: 'bar',
        stack: 'buy',
        data: r.hours.map((h) => h.residual_p50_mw),
        barMaxWidth: 18,
        // A 1px surface border on each segment leaves a 2px gap between stacked fills.
        itemStyle: { color: withAlpha(c.surplus, 0.75), borderColor: c.surface, borderWidth: 1 },
      },
      {
        name: `Extra at ${confidencePct}%`,
        type: 'bar',
        stack: 'buy',
        data: extra,
        barMaxWidth: 18,
        itemStyle: {
          color: c.shortfall,
          borderColor: c.surface,
          borderWidth: 1,
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: 'Demand',
        type: 'line',
        step: 'middle',
        data: r.hours.map((h) => h.demand_mw),
        symbol: 'none',
        lineStyle: { color: c.text, width: 1.5 },
        z: 3,
      },
    ],
  }
}

export function whatIfLegend(confidencePct: number): LegendItem[] {
  return [
    { label: 'Demand', color: 'var(--foreground)', kind: 'line' },
    {
      label: 'To buy at the forecast (P50)',
      color: 'color-mix(in srgb, var(--surplus) 75%, transparent)',
      kind: 'area',
    },
    {
      label: `Extra to buy at ${confidencePct}% firm wind`,
      color: 'var(--shortfall)',
      kind: 'area',
    },
  ]
}

export function whatIfAriaLabel(r: WhatIfResult, confidencePct: number): string {
  return `Hourly volume left to buy: ${fmtMWh(r.residual_p50_mwh)} in total at the forecast, ${fmtMWh(r.residual_firm_mwh)} at ${confidencePct}% firm wind, against ${fmtMWh(r.demand_mwh)} of demand.`
}
