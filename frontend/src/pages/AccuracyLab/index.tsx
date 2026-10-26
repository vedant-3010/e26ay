import { useCallback, useId } from 'react'
import { Link, useNavigate } from 'react-router'

import type { AccuracyData, Meta } from '@/api/client'
import { useAccuracy, useMeta } from '@/api/queries'
import {
  ByHourChart,
  DailyChart,
  DistributionChart,
  LeadCurveChart,
  LevelChart,
} from '@/components/charts/AccuracyCharts'
import { leadLegend, levelLegend, MAE_BIAS_LEGEND } from '@/components/charts/accuracyOptions'
import { ChartPanel } from '@/components/charts/ChartPanel'
import { HorizonSlider } from '@/components/controls/HorizonSlider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { InfoTip } from '@/components/feedback/InfoTip'
import { ErrorState, LoadingBar } from '@/components/feedback/States'
import { Figure } from '@/components/kpi/Figure'
import { Readout } from '@/components/kpi/Readout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  fmtCount,
  fmtHourRange,
  fmtHours,
  fmtMW,
  fmtPct,
  fmtSignedMW,
  fmtSignedPct,
} from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { fmtCalendarDate, fmtUkDateTime } from '@/lib/time'
import {
  nullableEnumParam,
  nullableNumberParam,
  nullableStringParam,
  useUrlState,
} from '@/lib/urlState'
import { cn } from '@/lib/utils'

import { accuracyCsv } from './exportCsv'

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const URL_SPEC = {
  population: nullableEnumParam(['decision', 'horizon'] as const),
  auction: nullableEnumParam(['epex', 'n2ex'] as const),
  horizon: nullableNumberParam({ min: 0, max: 48, step: 0.5 }),
  start: nullableStringParam(isDate),
  end: nullableStringParam(isDate),
  conf: nullableNumberParam({ min: 0.5, max: 0.99 }),
}

type PopulationChoice = 'epex' | 'n2ex' | 'horizon'
const POPULATION_OPTIONS = [
  { value: 'epex', label: 'EPEX 09:20' },
  { value: 'n2ex', label: 'N2EX 09:50' },
  { value: 'horizon', label: 'Fixed horizon' },
] as const

export function AccuracyLabPage() {
  const meta = useMeta()
  return (
    <>
      <PageHeader title="Accuracy Lab">
        How wrong the forecasts are at the lead times you trade at, and the buffer that justifies.
        All times UK.
      </PageHeader>
      {meta.isError ? (
        <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />
      ) : !meta.data ? (
        <LabSkeleton />
      ) : (
        <Lab meta={meta.data} />
      )}
    </>
  )
}

function Lab({ meta }: { meta: Meta }) {
  const [view, setView] = useUrlState(URL_SPEC)
  const { delivery_from: first, delivery_to: last } = meta.bounds
  const population = view.population ?? 'decision'
  const auction = view.auction ?? meta.defaults.auction
  const horizon = view.horizon ?? meta.horizon.default_h
  const start = view.start && view.start >= first && view.start <= last ? view.start : first
  const end = view.end && view.end >= first && view.end <= last ? view.end : last
  const confidence = meta.confidences.find((c) => c === view.conf) ?? meta.defaults.confidence
  const rangeError = end < start ? 'The last day must not be before the first.' : null

  const query = useAccuracy(
    { population, auction, horizon_h: horizon, start, end, confidence },
    !rangeError,
  )
  const data = query.data
  const choice: PopulationChoice = population === 'horizon' ? 'horizon' : auction

  return (
    <>
      <LoadingBar active={query.isFetching && Boolean(data)} />
      <section
        aria-label="Controls"
        className="mb-4 grid gap-x-8 gap-y-4 rounded-lg border bg-card p-4 lg:grid-cols-[auto_1fr]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Forecasts evaluated: what the desk had at an auction cutoff, or a fixed horizon
            </span>
            <SegmentedControl
              label="Forecasts evaluated"
              value={choice}
              options={POPULATION_OPTIONS}
              onChange={(v) =>
                v === 'horizon'
                  ? setView({ population: 'horizon', auction: null })
                  : setView({ population: null, auction: v === meta.defaults.auction ? null : v })
              }
            />
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <DayRange
              start={start}
              end={end}
              min={first}
              max={last}
              error={rangeError}
              onChange={(s, e) =>
                setView({ start: s === first ? null : s, end: e === last ? null : e })
              }
            />
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Confidence
                <InfoTip term="Buffer">{GLOSSARY.buffer}</InfoTip>
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
          </div>
        </div>
        {population === 'horizon' && (
          <div className="max-w-md lg:justify-self-end">
            <HorizonSlider
              value={horizon}
              min={meta.horizon.min_h}
              max={meta.horizon.max_h}
              step={meta.horizon.step_h}
              onChange={(h) => setView({ horizon: h === meta.horizon.default_h ? null : h })}
            />
          </div>
        )}
      </section>

      {rangeError ? null : query.isError && !data ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : !data ? (
        <LabBodySkeleton />
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <LabBody data={data} meta={meta} />
        </div>
      )}
    </>
  )
}

function DayRange({
  start,
  end,
  min,
  max,
  error,
  onChange,
}: {
  start: string
  end: string
  min: string
  max: string
  error: string | null
  onChange: (start: string, end: string) => void
}) {
  const id = useId()
  const input =
    'h-8 rounded-lg border bg-card px-2 font-mono text-sm tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive'
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs text-muted-foreground">Delivery days</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-start`} className="sr-only">
          First delivery day
        </label>
        <input
          id={`${id}-start`}
          type="date"
          min={min}
          max={max}
          value={start}
          aria-invalid={Boolean(error)}
          onChange={(e) => e.target.value && onChange(e.target.value, end)}
          className={input}
        />
        <span className="text-muted-foreground" aria-hidden="true">
          –
        </span>
        <label htmlFor={`${id}-end`} className="sr-only">
          Last delivery day
        </label>
        <input
          id={`${id}-end`}
          type="date"
          min={min}
          max={max}
          value={end}
          aria-invalid={Boolean(error)}
          onChange={(e) => e.target.value && onChange(start, e.target.value)}
          className={input}
        />
        <Button
          variant="outline"
          size="sm"
          aria-pressed={start === min && end === max}
          className="aria-pressed:bg-muted"
          onClick={() => onChange(min, max)}
        >
          Full pilot
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function LabBody({ data, meta }: { data: AccuracyData; meta: Meta }) {
  const navigate = useNavigate()
  const h = data.headline
  const pct = Math.round(data.params.confidence * 100)
  const deskAuction = data.params.population === 'decision' ? data.params.auction : 'epex'
  const deskLink = useCallback(
    (date: string) => {
      const q = new URLSearchParams({ date })
      if (deskAuction !== meta.defaults.auction) q.set('auction', deskAuction)
      return `/?${q.toString()}`
    },
    [deskAuction, meta.defaults.auction],
  )
  const window = data.decision_lead_window_h
  const windowLabel =
    data.params.population === 'decision'
      ? `${data.params.auction.toUpperCase()} decision window (${fmtHourRange(window?.[0], window?.[1])})`
      : `Leads used at ${fmtHours(data.params.horizon_h)} (${fmtHourRange(window?.[0], window?.[1])})`
  const days =
    data.params.start === data.params.end
      ? fmtCalendarDate(data.params.start)
      : `${fmtCalendarDate(data.params.start)} – ${fmtCalendarDate(data.params.end)}`

  return (
    // min-w-0 on grid children: wide content (the worst-hours table) scrolls inside its panel
    // instead of widening the page.
    <div className="grid gap-4 [&>*]:min-w-0">
      <section aria-label="Key takeaways" className="rounded-lg border bg-card px-4 py-3">
        <h2 className="mb-2 text-sm font-semibold">Key takeaways</h2>
        <ol className="grid gap-2 text-[15px] leading-relaxed sm:grid-cols-3 sm:gap-6">
          {data.takeaways.map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="font-mono text-xs leading-6 text-muted-foreground">{i + 1}</span>
              <span className="text-pretty">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Headline accuracy">
        <Readout
          columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          items={[
            { label: 'MAE', value: fmtMW(h.mae_mw), info: GLOSSARY.mae },
            { label: 'RMSE', value: fmtMW(h.rmse_mw), info: GLOSSARY.rmse },
            { label: 'Bias', value: fmtSignedMW(h.bias_mw), info: GLOSSARY.bias },
            {
              label: 'P90 shortfall',
              value: fmtMW(h.p90_shortfall_mw),
              info: GLOSSARY.p90Shortfall,
            },
            { label: 'WAPE', value: fmtPct(h.wape_pct), info: GLOSSARY.wape },
            { label: 'Hours compared', value: fmtCount(h.n), sub: days },
          ]}
        />
      </section>

      <ChartPanel
        title="A · Error by lead time"
        description="All runs × the hours they cover, by actual lead time; how fast the forecast degrades and where the decisions sit"
        legend={leadLegend(windowLabel)}
        csv={accuracyCsv.leadCurve(data)}
        footnote="Bins are one hour of lead time. This view always uses every run; the population setting above does not change it."
      >
        <LeadCurveChart data={data} />
      </ChartPanel>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartPanel
          title="C · Buffer by wind level"
          description="Shortfall to cover at each confidence, by how windy the forecast was"
          legend={levelLegend(data.calibration !== null, pct)}
          csv={accuracyCsv.level(data)}
          actions={
            data.calibration ? (
              <p className="text-xs">
                Firm wind held <b className="font-mono">{fmtPct(data.calibration.achieved_pct)}</b>{' '}
                of hours (target {pct}%)
              </p>
            ) : undefined
          }
          footnote={
            data.calibration
              ? 'Coverage is a leave-one-day-out backtest: each day is judged with buffers learned from the other days only.'
              : 'Coverage is measured for decision forecasts only.'
          }
        >
          <LevelChart data={data} confidencePct={pct} />
        </ChartPanel>
        <ChartPanel
          title="B · Error distribution"
          description="Signed error of every hour in the population"
          legend={[
            { label: 'Shortfall (forecast above actual)', color: 'var(--shortfall)', kind: 'area' },
            { label: 'Surplus', color: 'var(--surplus)', kind: 'area' },
          ]}
          csv={accuracyCsv.distribution(data)}
          footnote={`P10 ${fmtSignedMW(data.distribution.p10_mw)} · P50 ${fmtSignedMW(data.distribution.p50_mw)} · P90 ${fmtSignedMW(data.distribution.p90_mw)}; 250 MW bins.`}
        >
          <DistributionChart data={data} />
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {data.forecast_value && <ForecastValue value={data.forecast_value} />}
        <AuctionTiming data={data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartPanel
          title="E · Day by day"
          description="MAE and bias for each delivery day; select a day to open it in the Decision Desk"
          legend={MAE_BIAS_LEGEND}
          csv={accuracyCsv.daily(data)}
        >
          <DailyChart data={data} onSelectDay={(d) => navigate(deskLink(d))} />
        </ChartPanel>
        <ChartPanel
          title="D · By hour of day"
          description="MAE and bias by UK hour"
          legend={MAE_BIAS_LEGEND}
          csv={accuracyCsv.byHour(data)}
        >
          <ByHourChart data={data} />
        </ChartPanel>
      </div>

      <WorstHours data={data} deskLink={deskLink} />
    </div>
  )
}

function ForecastValue({ value }: { value: NonNullable<AccuracyData['forecast_value']> }) {
  const pct = Math.round(value.confidence * 100)
  const max = Math.max(value.unconditional_firm_mw ?? 0, value.avg_forecast_firm_mw ?? 0, 1)
  const bar = (mw: number | null, color: string, label: string, note: string) => (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span>
          {label} <span className="text-muted-foreground">· {note}</span>
        </span>
        <Figure text={fmtMW(mw)} size="md" />
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${(100 * (mw ?? 0)) / max}%`, background: color }}
        />
      </div>
    </div>
  )
  return (
    <section aria-label="Value of the forecast" className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">G · Value of the forecast</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Wind you can bank on an average hour at {pct}% confidence
      </p>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-[40px] leading-none font-medium tracking-tight">
          {fmtSignedMW(value.gain_mw).replace(' MW', '')}
        </span>
        <span className="text-sm text-muted-foreground">MW more with the forecast</span>
      </p>
      <div className="mt-5 grid gap-3">
        {bar(
          value.unconditional_firm_mw,
          'var(--surplus)',
          'Without a forecast',
          `P${100 - pct} of actual wind`,
        )}
        {bar(
          value.avg_forecast_firm_mw,
          'var(--forecast)',
          'With the forecast',
          'average firm wind',
        )}
      </div>
    </section>
  )
}

function AuctionTiming({ data }: { data: AccuracyData }) {
  const { epex, n2ex, mae_change_pct } = data.auction_comparison
  const rows: [string, string, string][] = [
    ['MAE', fmtMW(epex.mae_mw), fmtMW(n2ex.mae_mw)],
    ['P90 shortfall', fmtMW(epex.p90_shortfall_mw), fmtMW(n2ex.p90_shortfall_mw)],
    ['Bias', fmtSignedMW(epex.bias_mw), fmtSignedMW(n2ex.bias_mw)],
    ['WAPE', fmtPct(epex.wape_pct), fmtPct(n2ex.wape_pct)],
  ]
  return (
    <section aria-label="Auction timing" className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">F · Auction timing</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        N2EX bidders (09:50) can use the 09:30 run, two hours fresher than EPEX's 07:30 run
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-2 text-left font-normal">Decision forecasts</th>
            <th className="pb-2 text-right font-normal">EPEX 09:20</th>
            <th className="pb-2 text-right font-normal">N2EX 09:50</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map(([label, a, b]) => (
            <tr key={label} className="border-t">
              <th scope="row" className="py-1.5 text-left font-sans font-normal">
                {label}
              </th>
              <td className="py-1.5 text-right">{a}</td>
              <td className="py-1.5 text-right">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Bidding at 09:50 instead of 09:20 changes MAE by{' '}
        <b className="font-mono text-foreground">{fmtSignedPct(mae_change_pct)}</b>.
      </p>
    </section>
  )
}

function WorstHours({ data, deskLink }: { data: AccuracyData; deskLink: (d: string) => string }) {
  const navigate = useNavigate()
  return (
    <section aria-label="Worst hours" className="rounded-lg border bg-card">
      <header className="px-4 pt-4">
        <h2 className="text-sm font-semibold">H · The 10 worst hours</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Largest absolute errors in the population; select a row to open that day in the Decision
          Desk
        </p>
      </header>
      <div className="overflow-x-auto px-1 pt-2 pb-1">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              {['Hour (UK)', 'Forecast', 'Actual', 'Error', 'Lead', 'Run published'].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    'px-3 pb-2 font-normal',
                    i === 0 || i === 5 ? 'text-left' : 'text-right',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {data.worst.map((w) => (
              <tr
                key={w.t}
                onClick={() => navigate(deskLink(w.delivery_date))}
                className="cursor-pointer border-t hover:bg-muted/60"
              >
                <td className="px-3 py-2">
                  <Link
                    to={deskLink(w.delivery_date)}
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {fmtUkDateTime(w.t)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{fmtMW(w.forecast_mw)}</td>
                <td className="px-3 py-2 text-right">{fmtMW(w.actual_mw)}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-right font-medium',
                    w.error_mw > 0 ? 'text-shortfall' : 'text-surplus',
                  )}
                >
                  {fmtSignedMW(w.error_mw)}
                </td>
                <td className="px-3 py-2 text-right">{fmtHours(w.lead_h)}</td>
                <td className="px-3 py-2">{fmtUkDateTime(w.publish_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LabBodySkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-[340px] w-full" />
    </div>
  )
}

function LabSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-4 h-32 w-full" />
      <LabBodySkeleton />
    </div>
  )
}
