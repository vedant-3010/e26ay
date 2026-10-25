import { PageHeader, PlannedSection } from '@/components/layout/PageHeader'

export function DecisionDeskPage() {
  return (
    <>
      <PageHeader title="Decision Desk">
        The forecast you had at the auction gate closure, and how much of it you could bank on.
      </PageHeader>
      <PlannedSection phase={6}>
        Delivery day, auction and confidence controls; firm-wind chart; forecast evolution.
      </PlannedSection>
    </>
  )
}
