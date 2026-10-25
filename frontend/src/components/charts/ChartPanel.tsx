import type { ReactNode } from 'react'

import { ChartLegend, type LegendItem } from './ChartLegend'

interface Props {
  title: string
  description?: ReactNode
  actions?: ReactNode
  legend?: LegendItem[]
  footnote?: ReactNode
  children: ReactNode
}

/** The frame every chart sits in: a header row (title, one-line description, actions), the
 * legend, the plot, and an optional footnote under a hairline. */
export function ChartPanel({ title, description, actions, legend, footnote, children }: Props) {
  return (
    <section aria-label={title} className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {legend && (
        <div className="px-4 pt-3">
          <ChartLegend items={legend} />
        </div>
      )}
      <div className="px-1 pb-1 sm:px-2">{children}</div>
      {footnote && (
        <p className="border-t px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {footnote}
        </p>
      )}
    </section>
  )
}
