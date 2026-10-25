import { PageHeader, PlannedSection } from '@/components/layout/PageHeader'

export function AccuracyLabPage() {
  return (
    <>
      <PageHeader title="Accuracy Lab">
        How wrong the forecasts are at the lead times you trade at, and which buffer that justifies.
      </PageHeader>
      <PlannedSection phase={7}>
        Error vs lead time, error distribution, buffers by wind level, value of the forecast.
      </PlannedSection>
    </>
  )
}
