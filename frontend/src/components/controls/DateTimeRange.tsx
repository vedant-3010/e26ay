import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { ukLocalToUtcIso, utcIsoToUkLocal } from '@/lib/time'

export interface Range {
  start: string // UTC ISO
  end: string // UTC ISO (exclusive)
}

interface Props {
  value: Range
  /** Data bounds from /api/meta (UTC ISO; `max` is exclusive). */
  min: string
  max: string
  presets: { label: string; range: Range }[]
  onChange: (range: Range) => void
  error?: string | null
}

const STEP_SECONDS = 30 * 60

/** Start/end pickers in UK time (native datetime-local: keyboard- and touch-friendly), plus
 * one-click presets. Values in and out are UTC ISO strings. */
export function DateTimeRange({ value, min, max, presets, onChange, error }: Props) {
  const id = useId()
  const minLocal = utcIsoToUkLocal(min)
  const maxLocal = utcIsoToUkLocal(max)

  const update = (key: keyof Range, local: string) => {
    if (!local) return
    onChange({ ...value, [key]: ukLocalToUtcIso(local) })
  }

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Time window (UK time)</legend>
      <div className="flex flex-wrap items-end gap-3">
        {(['start', 'end'] as const).map((key) => (
          <label key={key} htmlFor={`${id}-${key}`} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {key === 'start' ? 'Start (UK)' : 'End (UK)'}
            </span>
            <input
              id={`${id}-${key}`}
              type="datetime-local"
              step={STEP_SECONDS}
              min={minLocal}
              max={maxLocal}
              value={utcIsoToUkLocal(value[key])}
              onChange={(e) => update(key, e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-8 rounded-lg border bg-card px-2 font-mono text-sm tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"
            />
          </label>
        ))}
        <div className="flex flex-wrap gap-1" role="group" aria-label="Window presets">
          {presets.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              aria-pressed={p.range.start === value.start && p.range.end === value.end}
              onClick={() => onChange(p.range)}
              className="aria-pressed:bg-muted"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
