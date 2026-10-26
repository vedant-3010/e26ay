import type { EChartsOption } from 'echarts'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import type { ECharts } from './echarts'

type Handler = (params: unknown) => void

interface Props {
  option: EChartsOption
  /** What the chart shows, for screen readers (the CSV download is the data alternative). */
  ariaLabel: string
  /** Size the box with Tailwind height classes; it must include the axis labels. */
  className: string
  onEvents?: Record<string, Handler>
}

/**
 * The one ECharts wrapper: init/dispose, resize, option updates, events (no data fetching).
 * The ECharts runtime (~230 KB gzipped) is imported on first mount rather than with the page,
 * so a page's text and figures render while the charts are still loading (PROGRESS, Phase 8).
 */
export function EChart({ option, ariaLabel, className, onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [chart, setChart] = useState<ECharts | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let instance: ECharts | null = null
    let resize: ResizeObserver | null = null
    let unmounted = false
    void import('./echarts').then(({ init }) => {
      if (unmounted) return
      instance = init(el, undefined, { renderer: 'canvas' })
      const current = instance
      resize = new ResizeObserver(() => current.resize())
      resize.observe(el)
      setChart(instance)
    })
    return () => {
      unmounted = true
      resize?.disconnect()
      instance?.dispose()
      setChart(null)
    }
  }, [])

  useEffect(() => {
    chart?.setOption(option, { notMerge: true })
  }, [chart, option])

  useEffect(() => {
    if (!chart || !onEvents) return
    for (const [name, handler] of Object.entries(onEvents)) chart.on(name, handler)
    return () => {
      for (const [name, handler] of Object.entries(onEvents)) chart.off(name, handler)
    }
  }, [chart, onEvents])

  return <div ref={ref} role="img" aria-label={ariaLabel} className={cn('w-full', className)} />
}
