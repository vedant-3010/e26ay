import type { EChartsOption } from 'echarts'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { init, type ECharts } from './echarts'

type Handler = (params: unknown) => void

interface Props {
  option: EChartsOption
  /** What the chart shows, for screen readers (the CSV download is the data alternative). */
  ariaLabel: string
  /** Size the box with Tailwind height classes; it must include the axis labels. */
  className: string
  onEvents?: Record<string, Handler>
}

/** The one ECharts wrapper: init/dispose, resize, option updates, events (no data fetching). */
export function EChart({ option, ariaLabel, className, onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<ECharts | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const instance = init(el, undefined, { renderer: 'canvas' })
    chart.current = instance
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(el)
    return () => {
      resize.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  useEffect(() => {
    const instance = chart.current
    if (!instance || !onEvents) return
    for (const [name, handler] of Object.entries(onEvents)) instance.on(name, handler)
    return () => {
      for (const [name, handler] of Object.entries(onEvents)) instance.off(name, handler)
    }
  }, [onEvents])

  return <div ref={ref} role="img" aria-label={ariaLabel} className={cn('w-full', className)} />
}
