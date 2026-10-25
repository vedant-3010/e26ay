import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { addDays, fmtCalendarDate } from '@/lib/time'

interface Props {
  value: string // YYYY-MM-DD (UK delivery day)
  min: string
  max: string
  onChange: (date: string) => void
}

/** Delivery day with ◀ ▶ (also ← / → on the page, see useDayKeys). Bounded to the pilot window. */
export function DeliveryDatePicker({ value, min, max, onChange }: Props) {
  const id = useId()
  const prev = addDays(value, -1)
  const next = addDays(value, 1)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Delivery day
      </label>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous day"
          disabled={prev < min}
          onClick={() => onChange(prev)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <input
          id={id}
          type="date"
          min={min}
          max={max}
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-describedby={`${id}-label`}
          className="h-8 rounded-lg border bg-card px-2 font-mono text-sm tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          disabled={next > max}
          onClick={() => onChange(next)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <span id={`${id}-label`} className="ml-1 text-sm font-medium whitespace-nowrap">
          {fmtCalendarDate(value)}
        </span>
      </div>
    </div>
  )
}
