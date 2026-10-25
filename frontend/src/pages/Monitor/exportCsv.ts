import type { MonitorData } from '@/api/client'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { fmtUkDateTime } from '@/lib/time'

interface Row {
  t: string
  actual: number | null
  forecast: MonitorData['forecast'][number] | undefined
}

/** One row per settlement period; forecast columns are filled on the hour (forecasts are hourly).
 * `error_mw = forecast − actual` for the period starting at the hour (ADR-0004). */
export function monitorCsv(data: MonitorData): string {
  const forecastAt = new Map(data.forecast.map((p) => [p.t, p]))
  const times = new Set([...data.actual.map((p) => p.t), ...data.forecast.map((p) => p.t)])
  const actualAt = new Map(data.actual.map((p) => [p.t, p.mw]))
  const rows: Row[] = [...times]
    .sort()
    .map((t) => ({ t, actual: actualAt.get(t) ?? null, forecast: forecastAt.get(t) }))

  const columns: CsvColumn<Row>[] = [
    { header: 'target_time_utc', value: (r) => r.t },
    { header: 'target_time_uk', value: (r) => fmtUkDateTime(r.t) },
    { header: 'actual_mw', value: (r) => r.actual },
    { header: 'forecast_mw', value: (r) => r.forecast?.mw },
    { header: 'forecast_publish_time_utc', value: (r) => r.forecast?.publish_time },
    { header: 'lead_h', value: (r) => r.forecast?.lead_h },
    {
      header: 'error_mw',
      value: (r) =>
        r.forecast?.mw !== null && r.forecast?.mw !== undefined && r.actual !== null
          ? Math.round((r.forecast.mw - r.actual) * 10) / 10
          : null,
    },
  ]
  return toCsv(columns, rows)
}

export function monitorCsvFilename(data: MonitorData): string {
  const day = (iso: string) => iso.slice(0, 10)
  return `winddesk-monitor_${day(data.params.start)}_${day(data.params.end)}_H${data.params.horizon_h}h.csv`
}
