import { AlertTriangle, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Error card with the server's message and a retry (UI_SPEC §6). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border bg-card p-6 sm:flex-row sm:items-center"
    >
      <AlertTriangle className="size-5 shrink-0 text-shortfall" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">This view could not be loaded</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed bg-card p-6 text-muted-foreground">
      <Inbox className="size-5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

/** A thin bar at the top of the page while data refetches (the previous render stays visible). */
export function LoadingBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity',
        active ? 'opacity-100' : 'opacity-0',
      )}
    >
      {active && (
        <div
          role="progressbar"
          aria-label="Loading"
          className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] bg-forecast"
        />
      )}
    </div>
  )
}
