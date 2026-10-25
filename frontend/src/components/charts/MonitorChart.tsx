import { useMemo } from 'react'

import type { MonitorData } from '@/api/client'

import { EChart } from './EChart'
import { buildMonitorOption } from './monitorOption'
import { useChartColors } from './theme'

export function MonitorChart({ data, ariaLabel }: { data: MonitorData; ariaLabel: string }) {
  const colors = useChartColors()
  const option = useMemo(() => buildMonitorOption(data, colors), [data, colors])
  return <EChart option={option} ariaLabel={ariaLabel} className="h-[340px] sm:h-[460px]" />
}
