import type { ReactNode } from 'react'

import { useAccuracy, useMeta } from '@/api/queries'
import { ErrorState } from '@/components/feedback/States'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtCount, fmtHourRange, fmtMW, fmtPct, fmtSignedMW } from '@/lib/format'
import { fmtCalendarDate, fmtUkDateTime } from '@/lib/time'
import { cn } from '@/lib/utils'

import { SelectionTimeline } from './SelectionTimeline'

const SECTIONS = [
  ['sources', 'Data sources'],
  ['window', 'Pilot window'],
  ['definitions', 'Definitions'],
  ['selection', 'How we pick the forecast'],
  ['alignment', 'Alignment'],
  ['buffers', 'Buffers and calibration'],
  ['quality', 'Data quality'],
  ['findings', 'What the data shows'],
  ['limitations', 'Limitations'],
] as const

const DEFINITIONS: [string, string][] = [
  ['Target time', 'The hour or half-hour the generation refers to (Elexon startTime).'],
  ['Publish time', 'When a forecast run was issued (Elexon publishTime).'],
  ['Lead time / horizon', 'Target time − publish time, in hours.'],
  ['Run / vintage', 'All forecast values issued at one publish time.'],
  [
    'Decision cutoff',
    'The moment the purchase is locked: the auction gate closure on the day before delivery (UK time).',
  ],
  ['Delivery day', '00:00–24:00 UK local time, matching the settlement day.'],
  ['Error', 'Forecast − actual (MW). Positive means over-forecast, i.e. wind shortfall.'],
  ['Shortfall', 'max(error, 0): wind that was expected but did not arrive.'],
  ['Buffer (P90)', 'The over-forecast you would need to cover in 90% of hours.'],
  ['Firm wind (P90)', 'Forecast − P90 buffer: wind you can count on 90% of the time.'],
  [
    'MAE / RMSE / bias / WAPE',
    'Mean absolute error / root mean squared error / mean error / Σ|error| ÷ Σ actual.',
  ],
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t pt-6">
      <h2 id={`${id}-h`} className="mb-3 text-base font-semibold tracking-tight">
        {title}
      </h2>
      <div className="grid gap-3 text-[15px] leading-relaxed text-pretty">{children}</div>
    </section>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">{children}</code>
}

export function MethodologyPage() {
  const meta = useMeta()
  const epex = useAccuracy({
    population: 'decision',
    auction: 'epex',
    horizon_h: 24,
    start: '2026-01-02',
    end: '2026-02-01',
    confidence: 0.9,
  })
  const m = meta.data
  const a = epex.data
  const leadBias = a?.lead_curve[0]?.bias_mw ?? null
  const topLevel = a?.by_level.at(-1)
  const lowLevel = a?.by_level[0]

  return (
    <div className="mx-auto max-w-reading">
      <PageHeader title="Methodology">
        Where the numbers come from, how the forecast for each decision is chosen, and what the data
        can and cannot tell you.
      </PageHeader>

      <nav aria-label="On this page" className="mb-6">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SECTIONS.map(([id, label], i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <span className="font-mono text-xs">{i + 1}</span> {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 pb-8">
        <Section id="sources" title="Data sources">
          <p>
            Two public Elexon BMRS datasets, and nothing else. <b>Actual wind</b>:{' '}
            <a
              className="underline underline-offset-4"
              href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
            >
              FUELHH
            </a>{' '}
            (half-hourly generation outturn by fuel type, <Code>fuelType = WIND</Code>; average MW
            over each settlement period). <b>Forecasts</b>:{' '}
            <a
              className="underline underline-offset-4"
              href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
            >
              WINDFOR
            </a>{' '}
            (national wind generation forecast, hourly, published about eight times a day).
          </p>
          <p>
            Both are national. FUELHH reports transmission-metered generation, so wind connected to
            the distribution networks is not visible in it. The data was fetched once, validated and
            frozen as a snapshot
            {m ? (
              <>
                {' '}
                (<Code>{m.snapshot.id}</Code>, created {fmtUkDateTime(m.snapshot.created_at)})
              </>
            ) : null}
            ; the app never calls Elexon while you use it, so every number is reproducible.
          </p>
        </Section>

        <Section id="window" title="Pilot window">
          <p>
            Purchase decisions made from 1 to 31 January 2026, i.e. delivery days{' '}
            <b>
              {m
                ? `${fmtCalendarDate(m.bounds.delivery_from)} – ${fmtCalendarDate(m.bounds.delivery_to)}`
                : '2 Jan – 1 Feb 2026'}
            </b>
            . The Forecast Monitor also shows 1 January for context. Forecast runs are included from
            30 December so that 48-hour leads reach into 1 January. January is GMT, so UK time
            equals UTC; the code still converts properly for summer time.
          </p>
        </Section>

        <Section id="definitions" title="Definitions">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
            {DEFINITIONS.map(([term, meaning]) => (
              <div key={term} className="contents">
                <dt className="font-medium">{term}</dt>
                <dd className="text-muted-foreground">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="selection" title="How we pick the forecast">
          <div className="rounded-lg border bg-card p-3">
            <SelectionTimeline />
          </div>
          <p>
            <b>Decision Desk.</b> For delivery day D, the forecast is the single latest run
            published at or before the gate closure on D−1 (EPEX 09:20, N2EX 09:50, or a custom
            time). For EPEX that is the 07:30 run, reaching 16.5–39.5 h ahead; N2EX bidders get the
            09:30 run (14.5–37.5 h). If that run does not cover an hour, the hour is shown as a gap.
            Another run is never substituted.
          </p>
          <p>
            <b>Forecast Monitor.</b> For each target hour, the latest run published at least H hours
            before it. Each run reaches 21:00 UTC two days after it is published, so beyond about
            43.5 h the late-evening hours have no qualifying run and appear as gaps.
          </p>
          <p>
            <b>No look-ahead.</b> Nothing published after the cutoff can affect a decision view: not
            the forecast, the firm wind or the buffers. This is enforced by tests for every delivery
            day and several cutoffs.
          </p>
        </Section>

        <Section id="alignment" title="Alignment">
          <p>
            WINDFOR is hourly and FUELHH half-hourly. The forecast for hour H is compared with the
            settlement period that <i>starts</i> at H. The analysis notebook repeats the analysis
            against the mean of both half-hours in the hour: MAE moves by about 1% and no conclusion
            changes. Daily energy treats hourly forecast values as hourly averages.
          </p>
        </Section>

        <Section id="buffers" title="Buffers and calibration">
          <p>
            A buffer at confidence c is the c-quantile of over-forecast error, never below zero.
            Firm wind is the forecast minus that buffer, never below zero. Buffers depend on how
            windy the forecast is: each fifth of the forecast range gets its own buffer, falling
            back to one flat buffer when a bin has fewer than 30 hours.
          </p>
          <p>
            Every buffer is <b>leave-one-day-out</b>: the buffer used on day D is learned from the
            other days only, so a day's own outcome never informs it.{' '}
            {a?.calibration ? (
              <>
                Back-tested this way, the 90% firm-wind line held in{' '}
                <b className="font-mono">{fmtPct(a.calibration.achieved_pct)}</b> of EPEX decision
                hours.
              </>
            ) : null}{' '}
            The level-based buffer holds back less on average than one flat buffer, at the cost of
            slightly lower coverage; both stay within five points of their targets.
          </p>
        </Section>

        <Section id="quality" title="Data quality">
          {meta.isError ? (
            <ErrorState message={meta.error.message} onRetry={() => meta.refetch()} />
          ) : !m ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <p>
                {fmtCount(m.quality.summary.forecast_runs)} forecast runs (
                {fmtCount(m.quality.summary.forecast_rows)} rows kept) and{' '}
                {fmtCount(m.quality.summary.actual_rows)} half-hourly actuals;{' '}
                {fmtCount(m.quality.summary.missing_periods)} missing settlement periods;{' '}
                {fmtCount(
                  m.quality.summary.forecast_duplicates_removed +
                    m.quality.summary.actual_duplicates_removed,
                )}{' '}
                duplicates removed. Nothing is filled or interpolated.
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-normal">
                        Check
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-normal">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-normal">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.quality.checks.map((c) => (
                      <tr key={c.id} className="border-t align-top">
                        <td className="px-3 py-2 font-mono text-xs">{c.id}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 text-xs font-medium',
                              c.status === 'ok' ? 'text-forecast' : 'text-shortfall',
                            )}
                          >
                            <span aria-hidden="true">{c.status === 'ok' ? '●' : '▲'}</span>
                            {c.status === 'ok' ? 'OK' : 'Warning'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[13px]">{c.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        <Section id="findings" title="What the data shows">
          <p>
            <b>The forecast runs high, and not because of timing.</b>{' '}
            {a ? (
              <>
                At the EPEX decision point it averages{' '}
                <b className="font-mono">{fmtSignedMW(a.headline.bias_mw)}</b> above metered wind,
                and it is already {fmtSignedMW(leadBias)} high half an hour ahead. The gap grows
                with wind level, from {fmtSignedMW(lowLevel?.bias_mw)} in the calmest fifth of hours
                to {fmtSignedMW(topLevel?.bias_mw)} in the windiest.
              </>
            ) : (
              'The decision forecasts average well above metered wind, even half an hour ahead.'
            )}{' '}
            That pattern fits constraint curtailment, or WINDFOR covering wind that FUELHH does not
            meter. Elexon's dataset descriptions do not settle which, so we treat it as a hypothesis
            to confirm with your data team. The buffers absorb it either way.
          </p>
          {m && m.forecast_runs.off_schedule.length > 0 && (
            <p>
              <b>One late run.</b> The 11:30 run on{' '}
              {m.forecast_runs.off_schedule.map((t) => fmtUkDateTime(t)).join(', ')} was published
              off its usual schedule. It is kept as published and is not a decision run for either
              auction.
            </p>
          )}
          {a && (
            <p className="text-sm text-muted-foreground">
              Decision forecasts at EPEX: MAE {fmtMW(a.headline.mae_mw)}, lead window{' '}
              {fmtHourRange(a.decision_lead_window_h?.[0], a.decision_lead_window_h?.[1])}.
            </p>
          )}
        </Section>

        <Section id="limitations" title="Limitations">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              One month of data: P95 is a small-sample estimate, P99 is not offered as a buffer, and
              seasonality is not captured.
            </li>
            <li>National wind stands in for your own exposure.</li>
            <li>
              Leave-one-day-out uses other days of the same month, not strictly earlier days. A
              production version would use a rolling window.
            </li>
            <li>Hourly forecasts are compared with half-hourly actuals (see Alignment).</li>
            <li>Distribution-connected wind is not visible in FUELHH.</li>
            <li>
              Errors are treated symmetrically. A cost-weighted buffer needs your imbalance costs.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
