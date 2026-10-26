import { useMemo } from 'react'

import type { DecisionData } from '@/api/client'
import type { WhatIfResult } from '@/lib/whatIf'

import { buildDecisionOption, decisionAriaLabel } from './decisionOption'
import { EChart } from './EChart'
import { useChartColors } from './theme'
import { buildVintagesOption, visibleVintages } from './vintagesOption'
import { buildWhatIfOption, whatIfAriaLabel } from './whatIfOption'

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

export function WhatIfChart({
  result,
  confidencePct,
}: {
  result: WhatIfResult
  confidencePct: number
}) {
  const colors = useChartColors()
  const option = useMemo(
    () => buildWhatIfOption(result, colors, confidencePct),
    [result, colors, confidencePct],
  )
  return (
    <EChart
      option={option}
      ariaLabel={whatIfAriaLabel(result, confidencePct)}
      className="h-[240px] sm:h-[280px]"
    />
  )
}
