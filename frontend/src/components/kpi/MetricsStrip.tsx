import type { ReactNode } from 'react'

import { InfoTip } from '@/components/feedback/InfoTip'

export interface MetricItem {
  label: string
  value: string
  info?: string
}

/** A dense row of labelled figures (n · MAE · RMSE · …), wrapping to a 2-column grid on mobile. */
export function MetricsStrip({ items, children }: { items: MetricItem[]; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-x-8">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              {item.label}
              {item.info && <InfoTip term={item.label}>{item.info}</InfoTip>}
            </dt>
            <dd className="font-mono text-base font-medium tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  )
}
