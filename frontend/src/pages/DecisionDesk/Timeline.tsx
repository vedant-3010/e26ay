import type { DecisionData } from '@/api/client'
import { InfoTip } from '@/components/feedback/InfoTip'
import { fmtHourRange } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { fmtUkDateTime, fmtUkDay } from '@/lib/time'

interface Step {
  label: string
  value: string
  note?: string
}

/** The decision in time order: run published → gate closure → delivery day. The same picture the
 * Methodology timeline draws, in one line. */
export function DecisionTimeline({
  data,
  auctionLabel,
}: {
  data: DecisionData
  auctionLabel: string
}) {
  const day = fmtUkDay(data.forecast[0]?.t ?? `${data.delivery_date}T00:00:00Z`)
  const steps: Step[] = [
    {
      label: 'Run used',
      value: data.run.publish_time ? fmtUkDateTime(data.run.publish_time) : 'None published',
      note: 'latest published before the cutoff',
    },
    { label: 'Gate closure', value: fmtUkDateTime(data.cutoff.utc), note: auctionLabel },
    {
      label: 'Delivery',
      value: day,
      note: `${fmtHourRange(data.run.lead_min_h, data.run.lead_max_h)} ahead`,
    },
  ]
  return (
    <section aria-label="Decision context" className="mb-4 rounded-lg border bg-card px-4 py-3">
      <ol className="grid gap-3 sm:grid-cols-3 sm:gap-0">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 sm:block sm:pr-6">
            <span className="mt-1.5 flex items-center sm:mt-0 sm:mb-2" aria-hidden="true">
              <span className="size-2 shrink-0 rounded-full bg-foreground/70" />
              {i < steps.length - 1 && (
                <span className="ml-2 hidden h-px flex-1 bg-border sm:block" />
              )}
            </span>
            <span className="block">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {s.label}
                {s.label === 'Gate closure' && (
                  <InfoTip term="Decision cutoff">{GLOSSARY.cutoff}</InfoTip>
                )}
              </span>
              <span className="block font-mono text-sm font-medium">{s.value}</span>
              {s.note && <span className="block text-xs text-muted-foreground">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
