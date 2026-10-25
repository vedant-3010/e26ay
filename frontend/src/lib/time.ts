/**
 * UK-time formatting and conversion. The API speaks UTC; everything shown is UK time
 * (Europe/London), which equals UTC in January but not in summer, so conversions are real.
 * Never call `toLocaleString()` ad hoc: format through here.
 */

export const UK_TZ = 'Europe/London'

type Instant = string | number | Date

function toDate(value: Instant): Date {
  return value instanceof Date ? value : new Date(value)
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function ukParts(value: Instant): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(toDate(value))) out[p.type] = p.value
  return out
}

/** `Thu 15 Jan 18:00` (UK time). */
export function fmtUkDateTime(value: Instant): string {
  const p = ukParts(value)
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`
}

/** `Thu 15 Jan` (UK date of an instant). */
export function fmtUkDay(value: Instant): string {
  const p = ukParts(value)
  return `${p.weekday} ${p.day} ${p.month}`
}

/** `18:00` (UK time). */
export function fmtUkTime(value: Instant): string {
  const p = ukParts(value)
  return `${p.hour}:${p.minute}`
}

const calendarFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** A calendar date (`2026-01-15`, no time zone) as `Thu 15 Jan 2026`. */
export function fmtCalendarDate(isoDate: string): string {
  const parts: Record<string, string> = {}
  for (const p of calendarFormatter.formatToParts(new Date(`${isoDate}T00:00:00Z`))) {
    parts[p.type] = p.value
  }
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`
}

/** `2026-01-15` → `2026-01-16` (pure calendar arithmetic). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const offsetFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TZ,
  timeZoneName: 'longOffset',
})

/** Minutes east of UTC in London at an instant: 0 in winter (GMT), 60 in summer (BST). */
export function londonOffsetMinutes(instant: Instant): number {
  const name = offsetFormatter.formatToParts(toDate(instant)).find((p) => p.type === 'timeZoneName')
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name?.value ?? '')
  if (!match) return 0 // "GMT" alone means +00:00
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

/** A UK wall-clock value (`2026-06-15T09:20`, as from `<input type=datetime-local>`) → UTC ISO. */
export function ukLocalToUtcIso(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!match) throw new Error(`not a local date-time: ${local}`)
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number]
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Two passes resolve the offset correctly on either side of a clock change.
  const first = asUtc - londonOffsetMinutes(asUtc) * 60_000
  const utc = asUtc - londonOffsetMinutes(first) * 60_000
  return new Date(utc).toISOString().replace('.000Z', 'Z')
}

/** UTC ISO → UK wall-clock value for `<input type=datetime-local>` (`2026-01-02T00:00`). */
export function utcIsoToUkLocal(iso: string): string {
  const d = toDate(iso)
  const local = new Date(d.getTime() + londonOffsetMinutes(d) * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Whole hours between two instants (may be fractional). */
export function hoursBetween(from: Instant, to: Instant): number {
  return (toDate(to).getTime() - toDate(from).getTime()) / 3_600_000
}
