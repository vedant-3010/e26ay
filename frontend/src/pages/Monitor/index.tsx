import { Download } from 'lucide-react'
import { useMemo } from 'react'

import type { Meta, MonitorData } from '@/api/client'
import { useMeta, useMonitor } from '@/api/queries'
import { MonitorChart } from '@/components/charts/MonitorChart'
import { DateTimeRange, type Range } from '@/components/controls/DateTimeRange'
import { HorizonSlider } from '@/components/controls/HorizonSlider'
import { EmptyState, ErrorState, LoadingBar } from '@/components/feedback/States'
import { InfoTip } from '@/components/feedback/InfoTip'
import { MetricsStrip } from '@/components/kpi/MetricsStrip'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadCsv } from '@/lib/csv'
import { fmtCount, fmtHours, fmtMW, fmtPct, fmtSignedMW } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { fmtUkDateTime } from '@/lib/time'
import { nullableNumberParam, nullableStringParam, useUrlState } from '@/lib/urlState'
import { cn } from '@/lib/utils'

import { monitorCsv, monitorCsvFilename } from './exportCsv'
import { DAY_MS, rangeError } from './range'

const isIso = (s: string) => !Number.isNaN(Date.parse(s)) && /Z$/.test(s)

// Module-level so the URL-state spec is referentially stable.
const URL_SPEC = {
  start: nullableStringParam(isIso),
  end: nullableStringParam(isIso),
  horizon: nullableNumberParam({ min: 0, max: 48, step: 0.5 }),
}

function shiftIso(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString().replace('.000Z', 'Z')
}

export function MonitorPage() {
  const meta = useMeta()
  return (
    <>
      <PageHeader title="Forecast Monitor">
        Actual vs forecast wind for any window: for each hour, the latest forecast published at
        least the chosen horizon before it. All times UK.
      </PageHeader>
      {meta.isError ? (
        <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />
      ) : !meta.data ? (
        <MonitorSkeleton />
      ) : (
        <Monitor meta={meta.data} />
      )}
    </>
  )
}

function Monitor({ meta }: { meta: Meta }) {
  const [view, setView] = useUrlState(URL_SPEC)
  const range: Range = {
    start: view.start ?? meta.defaults.monitor_start,
    end: view.end ?? meta.defaults.monitor_end,
  }
  const horizon = view.horizon ?? meta.horizon.default_h
  const error = rangeError(range, meta.bounds)

  const query = useMonitor({ start: range.start, end: range.end, horizon_h: horizon }, !error)
  const data = query.data

  const presets = useMemo(() => {
    const clampEnd = (iso: string) =>
      Date.parse(iso) > Date.parse(meta.bounds.target_to) ? meta.bounds.target_to : iso
    return [
      {
        label: '1 week',
        range: { start: range.start, end: clampEnd(shiftIso(range.start, 7 * DAY_MS)) },
      },
      {
        label: '2 weeks',
        range: { start: range.start, end: clampEnd(shiftIso(range.start, 14 * DAY_MS)) },
      },
      {
        label: 'Full month',
        range: { start: meta.bounds.target_from, end: meta.bounds.target_to },
      },
    ]
  }, [range.start, meta.bounds])

  const setRange = (r: Range) =>
    setView({
      start: r.start === meta.defaults.monitor_start ? null : r.start,
      end: r.end === meta.defaults.monitor_end ? null : r.end,
    })

  return (
    <>
      <LoadingBar active={query.isFetching && Boolean(data)} />

      <section
        aria-label="Controls"
        className="mb-4 grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_minmax(280px,400px)] lg:gap-8"
      >
        <DateTimeRange
          value={range}
          min={meta.bounds.target_from}
          max={meta.bounds.target_to}
          presets={presets}
          onChange={setRange}
          error={error}
        />
        <HorizonSlider
          value={horizon}
          min={meta.horizon.min_h}
          max={meta.horizon.max_h}
          step={meta.horizon.step_h}
          onChange={(h) => setView({ horizon: h === meta.horizon.default_h ? null : h })}
        />
      </section>

      {query.isError && !data ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : !data ? (
        <MonitorBodySkeleton />
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <MonitorBody data={data} />
        </div>
      )}
    </>
  )
}

function MonitorBody({ data }: { data: MonitorData }) {
  const m = data.metrics
  const cov = data.coverage
  const window = `${fmtUkDateTime(data.params.start)} – ${fmtUkDateTime(data.params.end)}`
  const ariaLabel =
    `Actual and forecast national wind, ${window} UK, at a ${fmtHours(data.params.horizon_h)} horizon. ` +
    `Mean absolute error ${fmtMW(m.mae_mw)}, bias ${fmtSignedMW(m.bias_mw)}. Data available as CSV.`

  return (
    <>
      <section aria-label="Accuracy for this window" className="mb-4 rounded-lg border bg-card p-4">
        <MetricsStrip
          items={[
            { label: 'Hours compared', value: fmtCount(m.n) },
            { label: 'MAE', value: fmtMW(m.mae_mw), info: GLOSSARY.mae },
            { label: 'RMSE', value: fmtMW(m.rmse_mw), info: GLOSSARY.rmse },
            { label: 'Bias', value: fmtSignedMW(m.bias_mw), info: GLOSSARY.bias },
            { label: 'P90 |error|', value: fmtMW(m.p90_abs_mw), info: GLOSSARY.p90Abs },
            {
              label: 'P90 shortfall',
              value: fmtMW(m.p90_shortfall_mw),
              info: GLOSSARY.p90Shortfall,
            },
            { label: 'WAPE', value: fmtPct(m.wape_pct), info: GLOSSARY.wape },
          ]}
        >
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-1 text-sm">
              <span
                className={cn('font-medium', cov.pct !== null && cov.pct < 100 && 'text-shortfall')}
              >
                Forecast available for {fmtPct(cov.pct)} of hours
              </span>
              <InfoTip term="Coverage">{GLOSSARY.coverage}</InfoTip>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(monitorCsvFilename(data), monitorCsv(data))}
            >
              <Download aria-hidden="true" />
              Download CSV
            </Button>
          </div>
        </MetricsStrip>
        {cov.pct !== null && cov.pct < 100 && (
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            {fmtCount(cov.target_hours - cov.with_forecast)} of {fmtCount(cov.target_hours)} hours
            have no forecast published at least {fmtHours(data.params.horizon_h)} ahead: each run
            only reaches 21:00 UTC two days after it is published, so late-evening hours drop out
            beyond about 43.5 h. They are left as gaps, never filled with another run.
          </p>
        )}
      </section>

      <section aria-label="Chart" className="rounded-lg border bg-card p-3 sm:p-4">
        {data.actual.length === 0 ? (
          <EmptyState>No data in this window.</EmptyState>
        ) : (
          <MonitorChart data={data} ariaLabel={ariaLabel} />
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Error = forecast − actual for the settlement period starting at each hour. Amber bars are
          shortfalls (wind below forecast), slate bars surpluses. Drag or pinch to zoom.
        </p>
      </section>
    </>
  )
}

function MonitorBodySkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-4 h-24 w-full" />
      <Skeleton className="h-[340px] w-full sm:h-[460px]" />
    </div>
  )
}

function MonitorSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-4 h-28 w-full" />
      <MonitorBodySkeleton />
    </div>
  )
}
