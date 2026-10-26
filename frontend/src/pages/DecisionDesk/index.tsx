import { AlertTriangle, Download } from 'lucide-react'
import { useCallback } from 'react'

import type { DecisionData, Meta } from '@/api/client'
import { useDecision, useMeta } from '@/api/queries'
import { ChartPanel } from '@/components/charts/ChartPanel'
import { DecisionChart, VintagesChart } from '@/components/charts/DecisionCharts'
import { decisionLegend } from '@/components/charts/decisionOption'
import { vintagesLegend } from '@/components/charts/vintagesOption'
import { AuctionSelector, type AuctionChoice } from '@/components/controls/AuctionSelector'
import { DeliveryDatePicker } from '@/components/controls/DeliveryDatePicker'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { InfoTip } from '@/components/feedback/InfoTip'
import { ErrorState, LoadingBar } from '@/components/feedback/States'
import { Readout, type ReadoutItem } from '@/components/kpi/Readout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadCsv } from '@/lib/csv'
import { fmtGWh, fmtMW, fmtSignedPct } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { addDays, fmtUkDay, fmtUkTime, isQuarterHour } from '@/lib/time'
import {
  enumParam,
  nullableEnumParam,
  nullableNumberParam,
  nullableStringParam,
  useUrlState,
} from '@/lib/urlState'
import { cn } from '@/lib/utils'

import { decisionCsv, decisionCsvFilename } from './exportCsv'
import { DecisionTimeline } from './Timeline'
import { useDayKeys } from './useDayKeys'
import { ProcurementWhatIf } from './WhatIf'

const DEFAULT_CUSTOM_CUTOFF = '10:00'

// Module-level so the URL-state spec is referentially stable. Deep link example:
// /?date=2026-01-21&auction=n2ex&conf=0.9&view=hindsight
const URL_SPEC = {
  date: nullableStringParam((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  auction: nullableEnumParam(['epex', 'n2ex', 'custom'] as const),
  // Any HH:MM is kept, so an off-step time is shown as an error rather than silently replaced.
  cutoff: nullableStringParam((s) => /^\d{2}:\d{2}$/.test(s)),
  conf: nullableNumberParam({ min: 0.5, max: 0.99 }),
  view: enumParam(['hindsight', 'trader'] as const, 'hindsight'),
}

const VIEW_OPTIONS = [
  { value: 'trader', label: 'Trader view' },
  { value: 'hindsight', label: 'Hindsight' },
] as const

export function DecisionDeskPage() {
  const meta = useMeta()
  return (
    <>
      <PageHeader title="Decision Desk">
        The forecast you had at the auction gate closure, and how much of it you could bank on. All
        times UK.
      </PageHeader>
      {meta.isError ? (
        <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />
      ) : !meta.data ? (
        <DeskSkeleton />
      ) : (
        <Desk meta={meta.data} />
      )}
    </>
  )
}

function Desk({ meta }: { meta: Meta }) {
  const [view, setView] = useUrlState(URL_SPEC)
  const { delivery_from: first, delivery_to: last } = meta.bounds
  const date =
    view.date && view.date >= first && view.date <= last ? view.date : meta.defaults.delivery_date
  const auction: AuctionChoice = view.auction ?? meta.defaults.auction
  const cutoff = view.cutoff ?? DEFAULT_CUSTOM_CUTOFF
  const confidence = meta.confidences.find((c) => c === view.conf) ?? meta.defaults.confidence
  const hindsight = view.view === 'hindsight'
  const cutoffValid = auction !== 'custom' || isQuarterHour(cutoff)

  const query = useDecision(
    {
      delivery_date: date,
      auction,
      confidence,
      ...(auction === 'custom' ? { cutoff } : {}),
    },
    cutoffValid,
  )
  const data = query.data

  const setDate = useCallback(
    (d: string) => {
      if (d < first || d > last) return
      setView({ date: d === meta.defaults.delivery_date ? null : d })
    },
    [first, last, meta.defaults.delivery_date, setView],
  )
  const prevDay = useCallback(() => setDate(addDays(date, -1)), [date, setDate])
  const nextDay = useCallback(() => setDate(addDays(date, 1)), [date, setDate])
  useDayKeys(prevDay, nextDay)

  return (
    <>
      <LoadingBar active={query.isFetching && Boolean(data)} />
      <section
        aria-label="Controls"
        className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-4 rounded-lg border bg-card/95 p-4 supports-[backdrop-filter]:backdrop-blur-sm md:sticky md:top-2 md:z-20"
      >
        <DeliveryDatePicker value={date} min={first} max={last} onChange={setDate} />
        <AuctionSelector
          auctions={meta.auctions}
          value={auction}
          cutoff={cutoff}
          onChange={(a, c) =>
            setView({
              auction: a === meta.defaults.auction ? null : a,
              cutoff: a === 'custom' ? c : null,
            })
          }
        />
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
        <div className="flex flex-col gap-1 sm:ml-auto">
          <span className="text-xs text-muted-foreground">View</span>
          <SegmentedControl
            label="View"
            value={view.view}
            options={VIEW_OPTIONS}
            onChange={(v) => setView({ view: v })}
          />
        </div>
      </section>

      {!cutoffValid ? null : query.isError && !data ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : !data ? (
        <DeskBodySkeleton />
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <DeskBody data={data} hindsight={hindsight} meta={meta} />
        </div>
      )}
    </>
  )
}

/** Everything below the controls. The Live page reuses it (`live`): its cutoff is the fetch
 * time rather than an auction, and the day has not happened yet. */
export function DeskBody({
  data,
  hindsight,
  meta,
  live = false,
}: {
  data: DecisionData
  hindsight: boolean
  meta: Meta
  live?: boolean
}) {
  const k = data.kpis
  const pct = Math.round(data.buffers.confidence * 100)
  const day = fmtUkDay(data.forecast[0]?.t ?? `${data.delivery_date}T00:00:00Z`)
  const auctionLabel = live
    ? 'latest runs fetched from Elexon'
    : data.cutoff.auction === 'custom'
      ? 'custom cutoff'
      : (meta.auctions.find((a) => a.id === data.cutoff.auction)?.label ?? data.cutoff.auction)
  const hours = data.forecast.length
  const covered = hours - data.run.missing_hours.length

  const planned: ReadoutItem[] = [
    {
      label: 'Forecast energy',
      value: fmtGWh(k.forecast_mwh),
      sub: k.forecast_mwh === null ? `run covers ${covered} of ${hours} h` : `${day}, ${hours} h`,
    },
    {
      // Plain language first, the term in the explanation (UI_SPEC §5).
      label: `Wind you can count on (${pct}%)`,
      value: fmtMW(k.avg_firm_mw),
      sub: 'firm wind, hourly average',
      info: GLOSSARY.firmWind,
    },
  ]
  const outcome: ReadoutItem[] = [
    {
      label: 'Actual energy',
      value: fmtGWh(k.actual_mwh),
      sub:
        k.energy_error_pct === null
          ? undefined
          : `${fmtSignedPct(-k.energy_error_pct)} vs forecast`,
    },
    { label: 'Day MAE', value: fmtMW(k.mae_mw), sub: 'hourly', info: GLOSSARY.mae },
    {
      label: 'Largest shortfall',
      value: fmtMW(k.max_shortfall_mw),
      sub: k.max_shortfall_at ? `at ${fmtUkTime(k.max_shortfall_at)}` : 'none',
      info: GLOSSARY.shortfall,
    },
    {
      label: 'Firm wind held',
      value: `${k.firm_hours_kept}/${k.firm_hours_total} h`,
      sub: `target ${pct}% of hours`,
    },
  ]
  const buffer: ReadoutItem = {
    label: `Buffer held back (${pct}%)`,
    value: fmtMW(k.avg_buffer_mw),
    sub: 'forecast − firm, average',
    info: GLOSSARY.buffer,
  }

  return (
    <>
      {(data.run.partial || !data.run.publish_time) && (
        <div
          role="status"
          className="mb-4 flex gap-3 rounded-lg border border-shortfall/50 bg-card p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-shortfall" aria-hidden="true" />
          <p>
            {data.run.publish_time ? (
              <>
                The run available at the cutoff covers <b>{covered}</b> of {hours} hours of {day}.
                The {hours - covered} missing hours (from{' '}
                {fmtUkTime(data.run.missing_hours[0] ?? data.forecast[0]!.t)}) are left as gaps;
                another run is never substituted.
              </>
            ) : (
              <>
                No forecast run covering {day} had been published by the cutoff. Nothing is shown
                rather than using a run that was not yet available.
              </>
            )}
          </p>
        </div>
      )}

      <DecisionTimeline
        data={data}
        auctionLabel={auctionLabel}
        cutoffLabel={live ? 'As of' : undefined}
      />

      <section aria-label="Key figures" className="mb-4">
        <Readout
          items={hindsight ? [...planned, ...outcome] : [...planned, buffer]}
          columns={
            hindsight ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'grid-cols-1 sm:grid-cols-3'
          }
        />
      </section>

      <section aria-label="Summary" className="mb-6 border-l-2 border-foreground/15 pl-4">
        <p aria-live="polite" className="max-w-3xl text-[15px] leading-relaxed text-pretty">
          {hindsight ? data.summary : data.summary_trader}
        </p>
      </section>

      <div className="grid gap-4 [&>*]:min-w-0">
        <ChartPanel
          title={`Wind for ${day}`}
          description={
            hindsight
              ? 'Decision-run forecast, firm wind and what actually happened'
              : 'What you knew at the cutoff: the decision-run forecast and firm wind'
          }
          legend={decisionLegend(hindsight, pct)}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(decisionCsvFilename(data, hindsight), decisionCsv(data, hindsight))
              }
            >
              <Download aria-hidden="true" />
              CSV
            </Button>
          }
          footnote={
            <>
              The band runs from firm wind up to the forecast: the {pct}% buffer,{' '}
              {live
                ? 'learned from the January 2026 pilot at the same time of day. The day has not happened yet, so there is no actual.'
                : hindsight
                  ? 'learned only from other days. Shaded amber where wind came in below the forecast, red where it fell below firm wind too.'
                  : 'learned only from other days. Switch to Hindsight to see what actually happened.'}
            </>
          }
        >
          <DecisionChart data={data} hindsight={hindsight} confidencePct={pct} />
        </ChartPanel>

        <ChartPanel
          title="How the forecast evolved"
          description={`Every run published in the 48 hours before ${day}; older runs are lighter`}
          legend={vintagesLegend(data, hindsight)}
          footnote={
            live
              ? 'Every run Elexon had published for this day by the fetch time.'
              : hindsight
                ? 'Dashed runs were published after the cutoff and were not available at decision time.'
                : 'Runs published after the cutoff are hidden in the Trader view.'
          }
        >
          <VintagesChart data={data} hindsight={hindsight} />
        </ChartPanel>

        <ProcurementWhatIf data={data} confidencePct={pct} />
      </div>
    </>
  )
}

function DeskBodySkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-4 h-12 w-full" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mb-4 h-16 w-full" />
      <Skeleton className="h-[280px] w-full sm:h-[380px]" />
    </div>
  )
}

function DeskSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-4 h-24 w-full" />
      <DeskBodySkeleton />
    </div>
  )
}
