import type { AccuracyData } from '@/api/client'
import { toCsv } from '@/lib/csv'

/** CSVs behind each Accuracy Lab chart: the charts' table-view alternative. */
function stem(data: AccuracyData, chart: string): string {
  const p = data.params
  const who = p.population === 'decision' ? p.auction : `H${p.horizon_h}h`
  return `winddesk-accuracy-${chart}_${who}_${p.start}_${p.end}.csv`
}

export const accuracyCsv = {
  leadCurve: (d: AccuracyData) => ({
    filename: stem(d, 'lead-curve'),
    build: () =>
      toCsv(
        [
          { header: 'lead_h_mid', value: (r) => r.lead_h },
          { header: 'n', value: (r) => r.n },
          { header: 'mae_mw', value: (r) => r.mae_mw },
          { header: 'rmse_mw', value: (r) => r.rmse_mw },
          { header: 'bias_mw', value: (r) => r.bias_mw },
          { header: 'p50_abs_mw', value: (r) => r.p50_abs_mw },
          { header: 'p90_abs_mw', value: (r) => r.p90_abs_mw },
          { header: 'p99_abs_mw', value: (r) => r.p99_abs_mw },
        ],
        d.lead_curve,
      ),
  }),
  distribution: (d: AccuracyData) => ({
    filename: stem(d, 'distribution'),
    build: () =>
      toCsv(
        [
          { header: 'error_from_mw', value: (i: number) => d.distribution.bin_edges_mw[i] },
          { header: 'error_to_mw', value: (i: number) => d.distribution.bin_edges_mw[i + 1] },
          { header: 'hours', value: (i: number) => d.distribution.counts[i] },
        ],
        d.distribution.counts.map((_, i) => i),
      ),
  }),
  level: (d: AccuracyData) => ({
    filename: stem(d, 'buffer-by-level'),
    build: () =>
      toCsv(
        [
          { header: 'forecast_from_mw', value: (r) => r.forecast_from_mw },
          { header: 'forecast_to_mw', value: (r) => r.forecast_to_mw },
          { header: 'n', value: (r) => r.n },
          { header: 'mae_mw', value: (r) => r.mae_mw },
          { header: 'bias_mw', value: (r) => r.bias_mw },
          { header: 'p80_shortfall_mw', value: (r) => r.p80_shortfall_mw },
          { header: 'p90_shortfall_mw', value: (r) => r.p90_shortfall_mw },
          { header: 'p95_shortfall_mw', value: (r) => r.p95_shortfall_mw },
          { header: 'firm_wind_held_pct', value: (r) => r.achieved_pct },
        ],
        d.by_level,
      ),
  }),
  daily: (d: AccuracyData) => ({
    filename: stem(d, 'daily'),
    build: () =>
      toCsv(
        [
          { header: 'delivery_date', value: (r) => r.delivery_date },
          { header: 'mae_mw', value: (r) => r.mae_mw },
          { header: 'bias_mw', value: (r) => r.bias_mw },
          { header: 'max_shortfall_mw', value: (r) => r.max_shortfall_mw },
        ],
        d.daily,
      ),
  }),
  byHour: (d: AccuracyData) => ({
    filename: stem(d, 'by-hour'),
    build: () =>
      toCsv(
        [
          { header: 'hour_uk', value: (r) => r.hour_uk },
          { header: 'n', value: (r) => r.n },
          { header: 'mae_mw', value: (r) => r.mae_mw },
          { header: 'bias_mw', value: (r) => r.bias_mw },
          { header: 'p90_shortfall_mw', value: (r) => r.p90_shortfall_mw },
        ],
        d.by_hour,
      ),
  }),
}
