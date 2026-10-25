import type { ReactNode } from 'react'

import { InfoTip } from '@/components/feedback/InfoTip'
import { cn } from '@/lib/utils'

import { Figure } from './Figure'

export interface ReadoutItem {
  label: string
  value: string
  sub?: ReactNode
  info?: string
}

interface Props {
  items: ReadoutItem[]
  /** Tailwind grid-cols classes per breakpoint. */
  columns: string
  size?: 'lg' | 'md'
  className?: string
}

/** An instrument-panel row of figures. The hairline dividers are the 1px grid gap showing the
 * border colour, so they stay correct however the cells wrap. A lone last cell on the 2-column
 * mobile layout spans both columns instead of leaving a hole. */
export function Readout({ items, columns, size = 'lg', className }: Props) {
  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border bg-border',
        'max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
        columns,
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-xs text-muted-foreground">
            {item.label}
            {item.info && <InfoTip term={item.label}>{item.info}</InfoTip>}
          </dt>
          <dd className="mt-1">
            <Figure text={item.value} size={size} />
          </dd>
          {item.sub && <dd className="mt-0.5 text-xs text-muted-foreground">{item.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}
