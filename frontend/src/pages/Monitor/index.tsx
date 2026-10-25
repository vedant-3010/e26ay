import { PageHeader, PlannedSection } from '@/components/layout/PageHeader'

export function MonitorPage() {
  return (
    <>
      <PageHeader title="Forecast Monitor">
        Actual vs forecast wind for any window, at any forecast horizon from 0 to 48 h.
      </PageHeader>
      <PlannedSection phase={5}>
        Date range, horizon slider, actual vs forecast chart with error panel, metrics strip.
      </PlannedSection>
    </>
  )
}
