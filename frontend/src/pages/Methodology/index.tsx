import { PageHeader, PlannedSection } from '@/components/layout/PageHeader'

export function MethodologyPage() {
  return (
    <div className="mx-auto max-w-reading">
      <PageHeader title="Methodology">
        Data sources, definitions, how the forecast is picked, and data quality.
      </PageHeader>
      <PlannedSection phase={7}>
        Selection timeline, alignment policy, buffers and calibration, limitations.
      </PlannedSection>
    </div>
  )
}
