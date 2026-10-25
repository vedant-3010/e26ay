import type { DecisionData } from '@/api/client'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { fmtUkDateTime } from '@/lib/time'

type Point = DecisionData['forecast'][number]

/** One row per hour of the delivery day. Actuals (the period starting on the hour) are only
 * exported in Hindsight, so the Trader view's file never contains the outcome. */
export function decisionCsv(data: DecisionData, hindsight: boolean): string {
  const actualAt = new Map(data.actual.map((p) => [p.t, p.mw]))
  const columns: CsvColumn<Point>[] = [
    { header: 'target_time_utc', value: (p) => p.t },
    { header: 'target_time_uk', value: (p) => fmtUkDateTime(p.t) },
    { header: 'forecast_mw', value: (p) => p.mw },
    { header: `firm_mw_p${Math.round(data.buffers.confidence * 100)}`, value: (p) => p.firm_mw },
    { header: 'lead_h', value: (p) => p.lead_h },
    { header: 'run_publish_time_utc', value: () => data.run.publish_time },
  ]
  if (hindsight) columns.push({ header: 'actual_mw', value: (p) => actualAt.get(p.t) ?? null })
  return toCsv(columns, data.forecast)
}

export function decisionCsvFilename(data: DecisionData, hindsight: boolean): string {
  const cutoff = data.cutoff.local.replace(':', '')
  return `winddesk-decision_${data.delivery_date}_${data.cutoff.auction}-${cutoff}${hindsight ? '_hindsight' : ''}.csv`
}
