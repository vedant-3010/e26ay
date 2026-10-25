import type { EChartsOption } from 'echarts'
import { useEffect, useState } from 'react'

/**
 * Chart colours come from the CSS tokens in styles/globals.css (the only place colour literals
 * live), read at runtime so charts follow the light/dark switch. Text uses text tokens, never a
 * series colour (dataviz rule); gridlines are solid hairlines one step off the surface.
 */
export interface ChartColors {
  actual: string
  forecast: string
  shortfall: string
  shortfallSevere: string
  surplus: string
  cutoff: string
  grid: string
  text: string
  muted: string
  surface: string
  border: string
  popover: string
}

const TOKENS: Record<keyof ChartColors, string> = {
  actual: '--actual',
  forecast: '--forecast',
  shortfall: '--shortfall',
  shortfallSevere: '--shortfall-severe',
  surplus: '--surplus',
  cutoff: '--cutoff',
  grid: '--chart-grid',
  text: '--foreground',
  muted: '--muted-foreground',
  surface: '--card',
  border: '--border',
  popover: '--popover',
}

export function readChartColors(): ChartColors {
  const style = getComputedStyle(document.documentElement)
  const out = {} as ChartColors
  for (const key of Object.keys(TOKENS) as (keyof ChartColors)[]) {
    out[key] = style.getPropertyValue(TOKENS[key]).trim() || 'gray'
  }
  return out
}

/** `#16a34a` + 0.18 → `rgba(22, 163, 74, 0.18)` (ECharts cannot read CSS color-mix()). */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return color
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Current chart colours; re-read whenever the theme class on <html> changes. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(readChartColors)
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readChartColors()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return colors
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export const FONT_FAMILY = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
export const MONO_FAMILY = "'IBM Plex Mono', ui-monospace, monospace"

/** Options every chart shares: fonts, motion, tooltip chrome. */
export function baseOption(c: ChartColors): EChartsOption {
  const reduced = prefersReducedMotion()
  return {
    textStyle: { fontFamily: FONT_FAMILY, color: c.muted, fontSize: 12 },
    animation: !reduced,
    animationDuration: 300,
    animationDurationUpdate: 200,
    tooltip: {
      backgroundColor: c.popover,
      borderColor: c.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: c.text, fontSize: 12, fontFamily: FONT_FAMILY },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);',
      confine: true,
    },
  }
}

export function axisLine(c: ChartColors) {
  return { lineStyle: { color: c.grid, width: 1 } }
}

export function splitLine(c: ChartColors) {
  return { show: true, lineStyle: { color: c.grid, width: 1, type: 'solid' as const } }
}
