import type { ReactNode } from 'react'

import { InfoTip } from '@/components/feedback/InfoTip'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: string
  /** A short line under the value: context or a delta (`−8% vs forecast`). */
  sub?: ReactNode
  info?: string
  className?: string
}

/** One figure, large (28px mono, UI_SPEC §1). Proportional digits: a lone value isn't a column. */
export function KpiCard({ label, value, sub, info, className }: Props) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {info && <InfoTip term={label}>{info}</InfoTip>}
      </div>
      <div className="mt-1 font-mono text-[28px] leading-9 font-medium [font-variant-numeric:proportional-nums]">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
