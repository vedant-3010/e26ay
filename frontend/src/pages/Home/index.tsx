import { ArrowRight } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'

import type { AccuracyData, DecisionData, Meta } from '@/api/client'
import { useAccuracy, useDecision, useMeta } from '@/api/queries'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { DecisionChart } from '@/components/charts/DecisionCharts'
import { decisionLegend } from '@/components/charts/decisionOption'
import { ErrorState } from '@/components/feedback/States'
import { Figure } from '@/components/kpi/Figure'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtCount, fmtHourRange, fmtMW, fmtPct, fmtSignedMW, shortSnapshotId } from '@/lib/format'
import { fmtCalendarDate } from '@/lib/time'
import { cn } from '@/lib/utils'

/** Query parameters that belong to the Decision Desk, which lived at `/` before this page. */
const DESK_PARAMS = ['date', 'auction', 'cutoff', 'conf', 'view']

/** Fig. 1: a day where the forecast missed by 18% and the 90% buffer still held 23 of 24 hours. */
const FEATURED_DAY = '2026-01-27'

/**
 * The product's front page. Every number on it comes from the API (the same snapshot as the
 * rest of the app) and every sentence about a day comes from the server's tested templates.
 * Old Desk links such as `/?date=2026-01-27` are forwarded to `/desk`, so shared URLs keep working.
 */
export function HomePage() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (DESK_PARAMS.some((p) => params.has(p))) return <Navigate to={`/desk${search}`} replace />
  return <Home />
}

function Home() {
  useEffect(() => {
    document.title = 'WindDesk · Day-ahead wind, as the desk saw it'
  }, [])
  const meta = useMeta()

  return (
    <div className="pb-4">
      <Hero meta={meta.data} />
      {meta.isError ? (
        <div className="mt-10">
          <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />
        </div>
      ) : meta.data ? (
        <Month meta={meta.data} />
      ) : (
        <Skeleton aria-hidden="true" className="mt-10 h-64 w-full" />
      )}
      <Moments />
      <Views />
      {meta.data && <DataNote meta={meta.data} />}
    </div>
  )
}

function Hero({ meta }: { meta: Meta | undefined }) {
  return (
    <section
      aria-labelledby="home-title"
      className="grid gap-8 pt-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:pt-6"
    >
      <div className="lg:pt-4">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          GB day-ahead · national wind · January 2026 pilot
        </p>
        <h1
          id="home-title"
          className="mt-3 text-[30px] leading-[1.12] font-semibold tracking-tight text-balance sm:text-[38px]"
        >
          How much wind can the desk bank on at 09:20?
        </h1>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-pretty text-muted-foreground sm:text-base">
          The day-ahead auction closes before tomorrow's wind is known. WindDesk replays every
          January 2026 decision with the forecast the desk actually had at gate closure, then shows
          how far off it was and the buffer that would have covered the miss.
        </p>
        {meta && <Answer meta={meta} />}
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link to="/desk" className={buttonVariants({ size: 'lg', className: 'px-4' })}>
            Open the Decision Desk
          </Link>
          <Link
            to="/methodology"
            className="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            How the numbers are made
          </Link>
        </div>
      </div>
      {meta && <FeaturedDay meta={meta} />}
    </section>
  )
}

/** The headline answer, from the Accuracy Lab's "value of the forecast". */
function Answer({ meta }: { meta: Meta }) {
  const { data } = useMonthAccuracy(meta)
  const value = data?.forecast_value
  if (!value) return <Skeleton aria-hidden="true" className="mt-4 h-12 max-w-[46ch]" />
  return (
    <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-pretty sm:text-base">
      At {Math.round(value.confidence * 100)}% confidence the answer was{' '}
      <strong className="font-semibold">{fmtMW(value.avg_forecast_firm_mw)}</strong> on an average
      hour: {fmtMW(value.gain_mw)} more than the desk could count on with no forecast at all.
    </p>
  )
}

function FeaturedDay({ meta }: { meta: Meta }) {
  const confidence = meta.defaults.confidence
  const pct = Math.round(confidence * 100)
  const query = useDecision({ delivery_date: FEATURED_DAY, auction: 'epex', confidence })
  return (
    <figure className="min-w-0 rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
        <span className="font-mono text-xs tracking-wide whitespace-nowrap text-muted-foreground uppercase">
          Fig. 1 · {fmtCalendarDate(FEATURED_DAY)}
        </span>
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
          EPEX 09:20 · {pct}%
        </span>
      </div>
      <div className="px-4 pt-3">
        {query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : query.data ? (
          <>
            <ChartLegend items={decisionLegend(true, pct)} />
            <DecisionChart data={query.data} hindsight confidencePct={pct} />
          </>
        ) : (
          <Skeleton aria-hidden="true" className="h-[300px] w-full sm:h-[400px]" />
        )}
      </div>
      <figcaption className="border-t px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        {query.data && <Caption data={query.data} />}
        <Link
          to={`/desk?date=${FEATURED_DAY}`}
          className="mt-2 inline-flex items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          Open this day in the Decision Desk
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </figcaption>
    </figure>
  )
}

/** The server's summary sentence for the day, the same text as the Desk's Hindsight view. */
function Caption({ data }: { data: DecisionData }) {
  return (
    <p className="text-pretty">
      {data.summary} The shaded band is the buffer, learned only from other days.
    </p>
  )
}

function useMonthAccuracy(meta: Meta) {
  return useAccuracy({
    population: 'decision',
    auction: meta.defaults.auction,
    horizon_h: meta.horizon.default_h,
    start: meta.bounds.delivery_from,
    end: meta.bounds.delivery_to,
    confidence: meta.defaults.confidence,
  })
}

function Month({ meta }: { meta: Meta }) {
  const query = useMonthAccuracy(meta)
  return (
    <Section
      id="home-month"
      title="January, judged at the 09:20 gate closure"
      intro={query.data ? <MonthIntro data={query.data} meta={meta} /> : null}
      link={{ to: '/accuracy', label: 'Open the Accuracy Lab' }}
    >
      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data ? (
        <FactSheet data={query.data} />
      ) : (
        <Skeleton aria-hidden="true" className="h-72 w-full" />
      )}
    </Section>
  )
}

function MonthIntro({ data, meta }: { data: AccuracyData; meta: Meta }) {
  const days =
    (Date.parse(meta.bounds.delivery_to) - Date.parse(meta.bounds.delivery_from)) / 86_400_000 + 1
  const lead = data.decision_lead_window_h
  return (
    <>
      {fmtCount(data.headline.n)} hours across {days} delivery days, each compared with the run the
      desk had at gate closure the day before
      {lead ? (
        <>
          , <span className="whitespace-nowrap">{fmtHourRange(lead[0], lead[1])}</span> ahead.
        </>
      ) : (
        '.'
      )}
    </>
  )
}

function FactSheet({ data }: { data: AccuracyData }) {
  const h = data.headline
  const target = Math.round(data.params.confidence * 100)
  const runsHigh = (h.bias_mw ?? 0) > 0
  const held = data.calibration?.achieved_pct
  const rows: { value: string; text: ReactNode }[] = [
    {
      value: fmtMW(h.mae_mw),
      text: (
        <>
          Typical miss, as mean absolute error. That is {fmtPct(h.wape_pct)} of the wind that
          actually blew.
        </>
      ),
    },
    {
      value: fmtSignedMW(h.bias_mw),
      text: runsHigh
        ? 'Average bias. The forecast runs high, so the desk is short more often than long.'
        : 'Average bias. The forecast runs low, so the desk is long more often than short.',
    },
    {
      value: fmtMW(h.p90_shortfall_mw),
      text: 'Hold this much back from the forecast and 90% of shortfalls are covered.',
    },
  ]
  if (held != null) {
    rows.push({
      value: fmtPct(held),
      text: `Hours in which ${target}% firm wind actually held, back-tested one day at a time against a ${target}% target.`,
    })
  }
  return (
    <dl className="divide-y border-y lg:border-t-0">
      {rows.map((row) => (
        <div
          key={row.value}
          className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-4 py-4 sm:grid-cols-[11rem_minmax(0,1fr)]"
        >
          <dt className="col-start-2 row-start-1 text-sm leading-relaxed text-pretty text-muted-foreground">
            {row.text}
          </dt>
          <dd className="col-start-1 row-start-1">
            <Figure text={row.value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

const MOMENTS = [
  {
    when: 'D−1 · 07:30',
    title: 'A forecast is published',
    body: "Elexon's WINDFOR run gives hourly national wind for roughly the next two and a half days. There are eight runs a day.",
    pivot: false,
  },
  {
    when: 'D−1 · 09:20',
    title: 'The auction closes',
    body: 'EPEX day-ahead gate closure. The desk commits on the latest run published before this minute; the 09:30 run arrives too late.',
    pivot: true,
  },
  {
    when: 'D · 00:00–23:00',
    title: 'The wind arrives',
    body: 'FUELHH records what actually blew, half-hour by half-hour, and each hour is scored against the run the desk used.',
    pivot: false,
  },
]

function Moments() {
  return (
    <Section
      id="home-moments"
      title="One decision, three moments"
      intro="Times are UK, for delivery day D. Nothing published after the gate closure is used."
      link={{ to: '/methodology', label: 'See the selection rule drawn to scale' }}
    >
      <ol className="grid gap-6 sm:grid-cols-3 sm:gap-5">
        {MOMENTS.map((m) => (
          <li key={m.when} className={cn('border-t-2 pt-3', m.pivot ? 'border-foreground' : '')}>
            <p
              className={cn(
                'font-mono text-xs',
                m.pivot ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {m.when}
            </p>
            <p className="mt-1.5 font-medium">{m.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-pretty text-muted-foreground">
              {m.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

const VIEWS = [
  {
    to: '/desk',
    name: 'Decision Desk',
    text: 'Pick a delivery day: the forecast at gate closure, the firm wind at 80, 90 or 95% confidence, and what came.',
  },
  {
    to: '/accuracy',
    name: 'Accuracy Lab',
    text: 'How wrong the decision forecasts were across the month, by lead time, wind level and hour, with back-tested buffers.',
  },
  {
    to: '/monitor',
    name: 'Monitor',
    text: 'Actual against forecast for any window, at any horizon from 0 to 48 hours.',
  },
  {
    to: '/methodology',
    name: 'Methodology',
    text: 'Every definition and data check, in plain language.',
  },
]

function Views() {
  return (
    <Section id="home-views" title="Where to look">
      <ul className="divide-y border-y lg:border-t-0">
        {VIEWS.map((v) => (
          <li key={v.to}>
            <Link
              to={v.to}
              className="group grid gap-1 py-3.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
            >
              <span className="font-medium group-hover:underline group-hover:underline-offset-4">
                {v.name}
              </span>
              <span className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {v.text}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function DataNote({ meta }: { meta: Meta }) {
  return (
    <p className="mt-10 max-w-[80ch] text-xs leading-relaxed text-pretty text-muted-foreground">
      Every figure on this page comes from Elexon's public data, frozen as snapshot{' '}
      <span className="font-mono">{shortSnapshotId(meta.snapshot.id)}</span>: deliveries{' '}
      {fmtCalendarDate(meta.bounds.delivery_from)} to {fmtCalendarDate(meta.bounds.delivery_to)},
      all times UK. National wind stands in for a supplier's own portfolio, and one month is a small
      sample, so read the tails as indicative.
    </p>
  )
}

/** A report-style section: the title and a short note on the left, the content on the right. */
function Section({
  id,
  title,
  intro,
  link,
  children,
}: {
  id: string
  title: string
  intro?: ReactNode
  link?: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="mt-12 grid gap-5 border-t pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
    >
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {intro && (
          <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-pretty text-muted-foreground">
            {intro}
          </p>
        )}
        {link && (
          <Link
            to={link.to}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            {link.label}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
