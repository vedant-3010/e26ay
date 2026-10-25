import { useMemo } from 'react'

import type { DecisionData } from '@/api/client'

import { buildDecisionOption, decisionAriaLabel } from './decisionOption'
import { EChart } from './EChart'
import { useChartColors } from './theme'
import { buildVintagesOption, visibleVintages } from './vintagesOption'

interface Props {
  data: DecisionData
  hindsight: boolean
  confidencePct: number
}

export function DecisionChart({ data, hindsight, confidencePct }: Props) {
  const colors = useChartColors()
  const option = useMemo(
    () => buildDecisionOption(data, colors, { hindsight, confidencePct }),
    [data, colors, hindsight, confidencePct],
  )
  return (
    <EChart
      option={option}
      ariaLabel={decisionAriaLabel(data, hindsight)}
      className="h-[280px] sm:h-[380px]"
    />
  )
}

export function VintagesChart({ data, hindsight }: Omit<Props, 'confidencePct'>) {
  const colors = useChartColors()
  const option = useMemo(
    () => buildVintagesOption(data, colors, { hindsight }),
    [data, colors, hindsight],
  )
  const shown = visibleVintages(data, hindsight).length
  return (
    <EChart
      option={option}
      ariaLabel={`How the forecast for this day evolved: ${shown} runs published in the 48 hours before it, with the decision run highlighted.`}
      className="h-[260px] sm:h-[320px]"
    />
  )
}
