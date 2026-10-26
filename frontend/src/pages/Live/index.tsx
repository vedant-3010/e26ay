import { Radio } from 'lucide-react'

import type { Meta } from '@/api/client'
import { useLive, useMeta } from '@/api/queries'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { InfoTip } from '@/components/feedback/InfoTip'
import { EmptyState, ErrorState, LoadingBar } from '@/components/feedback/States'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { shortSnapshotId } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { fmtUkTime } from '@/lib/time'
import { nullableNumberParam, useUrlState } from '@/lib/urlState'
import { cn } from '@/lib/utils'
import { DeskBody } from '@/pages/DecisionDesk'

const URL_SPEC = { conf: nullableNumberParam({ min: 0.5, max: 0.99 }) }

/**
 * Live mode (PRD F8, Could): tomorrow's wind from the latest Elexon run, as of now, in the
 * Decision Desk's Trader view. Only reachable from the nav when the server has
 * WINDDESK_ENABLE_LIVE=true; a direct visit otherwise explains that it is off.
 */
export function LivePage() {
  const meta = useMeta()
  return (
    <>
      <PageHeader title="Live">
        Tomorrow's wind from the latest Elexon forecast run, as of now. This is outside the January
        2026 pilot: firm wind uses buffers learned from the pilot month. All times UK.
      </PageHeader>
      {meta.isError ? (
        <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />
      ) : !meta.data ? (
        <Skeleton aria-hidden="true" className="h-24 w-full" />
      ) : meta.data.live_enabled ? (
        <Live meta={meta.data} />
      ) : (
        <EmptyState>
          Live mode is switched off on this server. It is an optional extra that calls Elexon at
          request time; set{' '}
          <code className="font-mono text-foreground">WINDDESK_ENABLE_LIVE=true</code> to enable it.
          Everything else in WindDesk uses the frozen January 2026 snapshot.
        </EmptyState>
      )}
    </>
  )
}

function Live({ meta }: { meta: Meta }) {
  const [view, setView] = useUrlState(URL_SPEC)
  const confidence = meta.confidences.find((c) => c === view.conf) ?? meta.defaults.confidence
  const query = useLive(confidence)
  const data = query.data

  return (
    <>
      <LoadingBar active={query.isFetching && Boolean(data)} />
      <section
        aria-label="Controls"
        className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-4 rounded-lg border bg-card p-4"
      >
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Confidence
            <InfoTip term="Firm wind">{GLOSSARY.firmWind}</InfoTip>
          </span>
          <SegmentedControl
            label="Confidence"
            value={String(confidence)}
            options={meta.confidences.map((c) => ({
              value: String(c),
              label: `${Math.round(c * 100)}%`,
            }))}
            onChange={(v) =>
              setView({ conf: Number(v) === meta.defaults.confidence ? null : Number(v) })
            }
          />
        </div>
        {data && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-auto">
            <Radio className="size-3.5 text-forecast" aria-hidden="true" />
            <span>
              Fetched from Elexon at{' '}
              <span className="font-mono text-foreground">{fmtUkTime(data.live.fetched_at)}</span>,
              re-fetched every {Math.round(data.live.ttl_s / 60)} minutes · buffers from snapshot{' '}
              <span className="font-mono">
                {shortSnapshotId(data.live.calibration_snapshot_id)}
              </span>
            </span>
          </p>
        )}
      </section>

      {query.isError && !data ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : !data ? (
        <Skeleton aria-hidden="true" className="h-[480px] w-full" />
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <DeskBody data={data} hindsight={false} meta={meta} live />
        </div>
      )}
    </>
  )
}
