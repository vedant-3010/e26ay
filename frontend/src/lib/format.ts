/**
 * All user-visible number and identifier formatting lives here (CLAUDE.md conventions).
 * Every number shown carries its unit; missing values render as an em dash.
 * Time formatting lives in `time.ts`.
 */

export const MISSING = '—'
const MINUS = '−' // U+2212, typographically correct for signed values

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

type Num = number | null | undefined

function isNum(value: Num): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `13,100 MW` */
export function fmtMW(value: Num): string {
  return isNum(value) ? `${nf0.format(value)} MW` : MISSING
}

/** `+1,300 MW` / `−250 MW` / `0 MW`: errors keep their sign (positive = over-forecast). */
export function fmtSignedMW(value: Num): string {
  if (!isNum(value)) return MISSING
  const rounded = Math.round(value)
  if (rounded === 0) return '0 MW'
  return `${rounded > 0 ? '+' : MINUS}${nf0.format(Math.abs(rounded))} MW`
}

/** `13.1 GW` from MW. */
export function fmtGW(mw: Num): string {
  return isNum(mw) ? `${nf1.format(mw / 1000)} GW` : MISSING
}

/** `412 GWh` from MWh. */
export function fmtGWh(mwh: Num): string {
  return isNum(mwh) ? `${nf0.format(mwh / 1000)} GWh` : MISSING
}

/** `98.0%` (1 decimal, UI_SPEC §5). */
export function fmtPct(value: Num): string {
  return isNum(value) ? `${nf1.format(value)}%` : MISSING
}

/** `+7.8%` / `−3.2%` */
export function fmtSignedPct(value: Num): string {
  if (!isNum(value)) return MISSING
  const abs = nf1.format(Math.abs(value))
  if (abs === '0.0') return '0.0%'
  return `${value > 0 ? '+' : MINUS}${abs}%`
}

/** `16.5 h` */
export function fmtHours(value: Num): string {
  return isNum(value) ? `${Number(value.toFixed(2))} h` : MISSING
}

/** `16.5–39.5 h` */
export function fmtHourRange(from: Num, to: Num): string {
  return isNum(from) && isNum(to)
    ? `${Number(from.toFixed(2))}–${Number(to.toFixed(2))} h`
    : MISSING
}

/** `1,536` */
export function fmtCount(value: Num): string {
  return isNum(value) ? nf0.format(value) : MISSING
}

/** Axis tick in MW without the unit (the axis title carries it): `12,000`. */
export function fmtAxisMW(value: number): string {
  return nf0.format(value)
}

/** Short git SHA for display (`abc1234def…` → `abc1234`). */
export function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 7) : null
}

/** Snapshot ids are 12 hex chars; the header shows the first 6 (UI_SPEC §2). */
export function shortSnapshotId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 6) : null
}

/** `14,465 MW` → value and unit. Only splits a trailing unit after a digit, so `—` stays whole. */
export function splitUnit(text: string): [string, string | null] {
  const m = /^(.*\d)\s?(MW|GW|GWh|MWh|h|%)$/.exec(text)
  return m ? [m[1]!, m[2]!] : [text, null]
}
