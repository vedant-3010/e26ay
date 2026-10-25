import { useId } from 'react'

import type { Meta } from '@/api/client'
import { InfoTip } from '@/components/feedback/InfoTip'
import { GLOSSARY } from '@/lib/glossary'
import { isQuarterHour } from '@/lib/time'

import { SegmentedControl } from './SegmentedControl'

export type AuctionChoice = 'epex' | 'n2ex' | 'custom'

const SHORT_LABEL: Record<string, string> = { epex: 'EPEX', n2ex: 'N2EX' }

interface Props {
  auctions: Meta['auctions']
  value: AuctionChoice
  cutoff: string
  onChange: (auction: AuctionChoice, cutoff: string) => void
}

/** EPEX 09:20 | N2EX 09:50 | Custom (time input in 15-minute steps, UK time on D−1). */
export function AuctionSelector({ auctions, value, cutoff, onChange }: Props) {
  const id = useId()
  const invalid = value === 'custom' && !isQuarterHour(cutoff)
  const options = [
    ...auctions.map((a) => ({
      value: a.id as AuctionChoice,
      label: `${SHORT_LABEL[a.id] ?? a.label} ${a.cutoff_local}`,
    })),
    { value: 'custom' as const, label: 'Custom' },
  ]
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        Auction gate closure (UK, day before)
        <InfoTip term="Decision cutoff">{GLOSSARY.cutoff}</InfoTip>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Auction"
          value={value}
          options={options}
          onChange={(v) => onChange(v, cutoff)}
        />
        {value === 'custom' && (
          <label htmlFor={id} className="flex items-center gap-2 text-sm">
            <span className="sr-only">Custom cutoff time</span>
            <input
              id={id}
              type="time"
              step={900}
              value={cutoff}
              onChange={(e) => e.target.value && onChange('custom', e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-error` : undefined}
              className="h-8 rounded-lg border bg-card px-2 font-mono text-sm tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"
            />
          </label>
        )}
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          Choose a time in 15-minute steps, e.g. 09:45.
        </p>
      )}
    </div>
  )
}
