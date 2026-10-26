import { useId, useMemo, useState } from 'react'

import type { DecisionData } from '@/api/client'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { ChartPanel } from '@/components/charts/ChartPanel'
import { WhatIfChart } from '@/components/charts/DecisionCharts'
import { whatIfLegend } from '@/components/charts/whatIfOption'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { InfoTip } from '@/components/feedback/InfoTip'
import { Readout } from '@/components/kpi/Readout'
import { fmtMW, fmtMWh } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { computeWhatIf, parseHourlyDemand, whatIfCsv, type ParseResult } from '@/lib/whatIf'

type DemandMode = 'flat' | 'hourly'

const DEMAND_MODES = [
  { value: 'flat', label: 'Flat' },
  { value: 'hourly', label: 'Hourly' },
] as const

// Illustrative starting point: a mid-sized supplier holding a tenth of GB wind.
const DEFAULT_DEMAND_MW = '3000'
const DEFAULT_SHARE_PCT = '10'

const INPUT =
  'h-8 rounded-lg border bg-card px-2 font-mono text-sm tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive'

function flatDemand(text: string, hours: number): ParseResult {
  const value = Number(text)
  if (text.trim() === '' || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'Enter demand in MW (0 or more).' }
  }
  return { ok: true, values: Array.from({ length: hours }, () => value) }
}

function parseShare(text: string): number | null {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

/**
 * Procurement what-if (PRD F7, Could): the volume still to buy for the delivery day once the
 * desk's share of national wind is counted, at the forecast and at firm wind. Client-side and
 * clearly illustrative; the inputs are local state, not part of the shareable URL.
 */
export function ProcurementWhatIf({
  data,
  confidencePct,
}: {
  data: DecisionData
  confidencePct: number
}) {
  const id = useId()
  const hours = data.forecast.length
  const [mode, setMode] = useState<DemandMode>('flat')
  const [flat, setFlat] = useState(DEFAULT_DEMAND_MW)
  const [pasted, setPasted] = useState('')
  const [share, setShare] = useState(DEFAULT_SHARE_PCT)

  const demand = useMemo(
    () => (mode === 'flat' ? flatDemand(flat, hours) : parseHourlyDemand(pasted, hours)),
    [mode, flat, pasted, hours],
  )
  const sharePct = parseShare(share)
  const result = useMemo(
    () =>
      demand.ok && sharePct !== null ? computeWhatIf(data.forecast, demand.values, sharePct) : null,
    [data.forecast, demand, sharePct],
  )

  const switchMode = (next: DemandMode) => {
    // Start the hourly box from the flat value so there is something to edit.
    if (next === 'hourly' && pasted.trim() === '' && flatDemand(flat, hours).ok) {
      setPasted(Array.from({ length: hours }, () => flat.trim()).join(', '))
    }
    setMode(next)
  }

  const partial = result !== null && result.covered_hours < hours
  const over = partial ? ` over the ${result.covered_hours} covered hours` : ''

  return (
    <ChartPanel
      title="Procurement what-if"
      description="What is left to buy for the day once your share of national wind is counted"
      actions={
        <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Illustrative
        </span>
      }
      csv={
        result && sharePct !== null
          ? {
              filename: `winddesk-whatif_${data.delivery_date}_${data.cutoff.auction}_p${confidencePct}.csv`,
              build: () => whatIfCsv(result, sharePct, confidencePct),
            }
          : undefined
      }
      footnote={
        <>
          Illustrative only: it assumes your wind moves in proportion to national wind, which is a
          proxy (see Methodology). To buy = demand − your share × forecast, or × firm wind at{' '}
          {confidencePct}%, and never below 0. What you enter stays in your browser.
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-3 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Demand</span>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Demand"
              value={mode}
              options={DEMAND_MODES}
              onChange={switchMode}
            />
            {mode === 'flat' && (
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">Flat demand (MW)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  value={flat}
                  onChange={(e) => setFlat(e.target.value)}
                  aria-invalid={!demand.ok}
                  aria-describedby={demand.ok ? undefined : `${id}-demand-error`}
                  className={`${INPUT} w-28`}
                />
                <span className="text-muted-foreground">MW every hour</span>
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${id}-share`}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            Your share of national wind
            <InfoTip term="Wind share">{GLOSSARY.windShare}</InfoTip>
          </label>
          <span className="flex items-center gap-2 text-sm">
            <input
              id={`${id}-share`}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.5}
              value={share}
              onChange={(e) => setShare(e.target.value)}
              aria-invalid={sharePct === null}
              aria-describedby={sharePct === null ? `${id}-share-error` : undefined}
              className={`${INPUT} w-20`}
            />
            <span className="text-muted-foreground">%</span>
          </span>
        </div>

        {mode === 'hourly' && (
          <label className="flex w-full flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Hourly demand in MW: {hours} values from 00:00 UK, pasted from a spreadsheet column or
              separated by commas
            </span>
            <textarea
              rows={3}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              aria-invalid={!demand.ok}
              aria-describedby={demand.ok ? undefined : `${id}-demand-error`}
              spellCheck={false}
              className={`${INPUT} h-auto max-w-2xl py-1.5 leading-relaxed`}
            />
          </label>
        )}
      </div>

      {(!demand.ok || sharePct === null) && (
        <div role="alert" className="px-3 pt-2 text-xs text-destructive">
          {!demand.ok && <p id={`${id}-demand-error`}>{demand.error}</p>}
          {sharePct === null && <p id={`${id}-share-error`}>Enter a share between 0% and 100%.</p>}
        </div>
      )}

      {result && (
        <>
          <Readout
            className="mx-3 mt-4"
            size="md"
            columns="grid-cols-2 lg:grid-cols-4"
            items={[
              {
                label: 'Demand',
                value: fmtMWh(result.demand_mwh),
                sub:
                  mode === 'flat'
                    ? `${fmtMW(Number(flat))} for ${result.covered_hours} h`
                    : `${hours} hourly values${over}`,
              },
              {
                label: 'To buy at the forecast',
                value: fmtMWh(result.residual_p50_mwh),
                sub: `your wind share: ${fmtMWh(result.wind_p50_mwh)}${over}`,
              },
              {
                label: `To buy at ${confidencePct}% firm wind`,
                value: fmtMWh(result.residual_firm_mwh),
                sub: `wind you can count on: ${fmtMWh(result.wind_firm_mwh)}`,
              },
              {
                label: `Extra for ${confidencePct}% confidence`,
                value: fmtMWh(result.residual_firm_mwh - result.residual_p50_mwh),
                sub: 'to secure beyond the forecast',
              },
            ]}
          />
          <div className="px-3 pt-4">
            <ChartLegend items={whatIfLegend(confidencePct)} />
          </div>
          <WhatIfChart result={result} confidencePct={confidencePct} />
        </>
      )}
    </ChartPanel>
  )
}
