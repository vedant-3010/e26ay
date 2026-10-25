import type { Meta } from '@/api/client'
import type { Range } from '@/components/controls/DateTimeRange'
import { fmtUkDateTime } from '@/lib/time'

export const DAY_MS = 86_400_000
export const MAX_SPAN_DAYS = 35

/** Client-side range rules mirroring the API (PRD F2.1), so a bad range never hits the network. */
export function rangeError(range: Range, bounds: Meta['bounds']): string | null {
  const s = Date.parse(range.start)
  const e = Date.parse(range.end)
  if (s < Date.parse(bounds.target_from) || e > Date.parse(bounds.target_to)) {
    return `Choose a window between ${fmtUkDateTime(bounds.target_from)} and ${fmtUkDateTime(bounds.target_to)} UK time.`
  }
  if (e <= s) return 'The end must be after the start.'
  if (e - s > MAX_SPAN_DAYS * DAY_MS) return `The window can span at most ${MAX_SPAN_DAYS} days.`
  return null
}
