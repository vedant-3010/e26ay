import type { ReactNode } from 'react'

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
      {children && (
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  )
}

/** Stand-in body for pages that are built in a later phase (walking skeleton, Phase 0). */
export function PlannedSection({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-6 text-muted-foreground">
      <p className="font-mono text-xs tracking-wide uppercase">Planned · Phase {phase}</p>
      <p className="mt-2">{children}</p>
    </div>
  )
}
