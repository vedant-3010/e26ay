import { useMemo } from 'react'

import type { AccuracyData } from '@/api/client'

import {
  buildByHourOption,
  buildDailyOption,
  buildDistributionOption,
  buildLeadCurveOption,
  buildLevelOption,
  dailyClickDate,
} from './accuracyOptions'
import { EChart } from './EChart'
import { useChartColors } from './theme'

export function LeadCurveChart({ data }: { data: AccuracyData }) {
  const c = useChartColors()
  const option = useMemo(() => buildLeadCurveOption(data, c), [data, c])
  return (
    <EChart
      option={option}
      ariaLabel="Forecast error by lead time from 0 to 48 hours: mean absolute error, 90th and 99th percentile absolute error and bias, with the decision lead window shaded."
      className="h-[280px] sm:h-[340px]"
    />
  )
}

export function DistributionChart({ data }: { data: AccuracyData }) {
  const c = useChartColors()
  const option = useMemo(() => buildDistributionOption(data, c), [data, c])
  return (
    <EChart
      option={option}
      ariaLabel="Histogram of signed forecast error in 250 MW bins with the 10th, 50th and 90th percentiles marked."
      className="h-[260px] sm:h-[300px]"
    />
  )
}

export function LevelChart({ data, confidencePct }: { data: AccuracyData; confidencePct: number }) {
  const c = useChartColors()
  const option = useMemo(() => buildLevelOption(data, c, confidencePct), [data, c, confidencePct])
  return (
    <EChart
      option={option}
      ariaLabel="Shortfall buffers at 80, 90 and 95 percent for each forecast-level bin, with the share of hours where firm wind held."
      className="h-[260px] sm:h-[300px]"
    />
  )
}

export function ByHourChart({ data }: { data: AccuracyData }) {
  const c = useChartColors()
  const option = useMemo(() => buildByHourOption(data, c), [data, c])
  return (
    <EChart
      option={option}
      ariaLabel="Mean absolute error and bias by hour of day, UK time."
      className="h-[240px] sm:h-[280px]"
    />
  )
}

export function DailyChart({
  data,
  onSelectDay,
}: {
  data: AccuracyData
  onSelectDay: (date: string) => void
}) {
  const c = useChartColors()
  const option = useMemo(() => buildDailyOption(data, c), [data, c])
  const events = useMemo(
    () => ({
      click: (params: unknown) => {
        const date = dailyClickDate(data, params)
        if (date) onSelectDay(date)
      },
    }),
    [data, onSelectDay],
  )
  return (
    <EChart
      option={option}
      onEvents={events}
      ariaLabel="Mean absolute error and bias for each delivery day. Select a day to open it in the Decision Desk."
      className="h-[240px] sm:h-[280px]"
    />
  )
}
