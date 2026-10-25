import { Info } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** The `(i)` next to a control or figure: a one-line definition (UI_SPEC §5). A popover rather
 * than a hover tooltip, so it also works by tap and keyboard. */
export function InfoTip({ term, children }: { term: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${term}`}
        className="inline-flex size-5 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs leading-relaxed" side="top">
        <p>
          <span className="font-semibold">{term}.</span> {children}
        </p>
      </PopoverContent>
    </Popover>
  )
}
