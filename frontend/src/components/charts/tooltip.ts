/**
 * Tooltip markup shared by every chart (dataviz rules): values lead, labels follow, and each row
 * is keyed by a short line (or a small square for bars) in the series colour. Content is numbers
 * and fixed labels only, never untrusted text.
 */
import { fmtUkDateTime } from '@/lib/time'

import { MONO_FAMILY } from './theme'

export function key(color: string, shape: 'line' | 'dash' | 'square' = 'line'): string {
  const size =
    shape === 'square'
      ? 'width:8px;height:8px;border-radius:2px'
      : shape === 'dash'
        ? `width:12px;height:0;border-top:2px dashed ${color}`
        : 'width:12px;height:2px'
  const fill = shape === 'dash' ? '' : `background:${color};`
  return `<span style="display:inline-block;${size};${fill}vertical-align:middle;margin-right:8px"></span>`
}

export function row(
  color: string,
  value: string,
  label: string,
  shape: 'line' | 'dash' | 'square' = 'line',
): string {
  return `<div style="display:flex;align-items:center;gap:2px;line-height:20px">${key(color, shape)}<b style="font-family:${MONO_FAMILY};font-weight:600">${value}</b><span style="opacity:.7;margin-left:6px">${label}</span></div>`
}

export function header(t: number): string {
  return `<div style="font-weight:600;margin-bottom:4px">${fmtUkDateTime(t)} <span style="opacity:.6;font-weight:400">UK</span></div>`
}

export function note(text: string): string {
  return `<div style="margin-top:4px;opacity:.75">${text}</div>`
}

/** The hovered x of an axis-trigger tooltip (ms), or NaN. */
export function axisTime(raw: unknown): number {
  const first = (Array.isArray(raw) ? raw[0] : raw) as { axisValue?: number } | undefined
  return Number(first?.axisValue)
}
