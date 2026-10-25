import { useEffect, useId, useRef, useState } from 'react'

import { InfoTip } from '@/components/feedback/InfoTip'
import { Slider } from '@/components/ui/slider'
import { fmtHours } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'

const TICKS = [0, 6, 12, 24, 36, 48]
export const SLIDER_DEBOUNCE_MS = 150

interface Props {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

/** Forecast horizon 0–48 h in 0.5 h steps. Moves instantly; commits after 150 ms of stillness. */
export function HorizonSlider({ value, min, max, step, onChange }: Props) {
  const labelId = useId()
  const [local, setLocal] = useState(value)
  const [committed, setCommitted] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // An outside change (e.g. browser back) resets the thumb: adjust state during render.
  if (value !== committed) {
    setCommitted(value)
    setLocal(value)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleChange = (next: number) => {
    setLocal(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(next), SLIDER_DEBOUNCE_MS)
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span id={labelId}>Forecast horizon</span>
          <InfoTip term="Horizon">{GLOSSARY.horizon}</InfoTip>
        </span>
        <span className="font-mono text-sm font-medium">{fmtHours(local)} ahead</span>
      </div>
      <Slider
        thumbLabelledBy={labelId}
        thumbValueText={`${fmtHours(local)} ahead`}
        value={[local]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => v !== undefined && handleChange(v)}
        className="py-2"
      />
      <div className="relative mt-1 h-4 text-[11px] text-muted-foreground" aria-hidden="true">
        {TICKS.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 font-mono whitespace-nowrap first:translate-x-0 last:-translate-x-full"
            style={{ left: `${((t - min) / (max - min)) * 100}%` }}
          >
            {t} h
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Day-ahead decisions are about 15–40 h ahead.
      </p>
    </div>
  )
}
