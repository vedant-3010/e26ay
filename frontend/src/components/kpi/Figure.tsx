import { splitUnit } from '@/lib/format'
import { cn } from '@/lib/utils'

const SIZES = {
  lg: 'text-[22px] leading-7 sm:text-[26px] sm:leading-8',
  md: 'text-lg leading-6',
}

/** A reading: the number in Plex Mono, its unit smaller and muted, never wrapping apart.
 * Proportional digits for standalone values (dataviz: tabular only in columns). */
export function Figure({ text, size = 'lg' }: { text: string; size?: keyof typeof SIZES }) {
  const [value, unit] = splitUnit(text)
  return (
    <span
      className={cn(
        'inline-flex items-baseline whitespace-nowrap',
        unit === '%' ? 'gap-px' : 'gap-1',
      )}
    >
      <span
        className={cn(
          'font-mono font-medium tracking-tight [font-variant-numeric:proportional-nums]',
          SIZES[size],
        )}
      >
        {value}
      </span>
      {/* A real space keeps copy-paste and screen readers at "1,500 MW". */}
      {unit && unit !== '%' && ' '}
      {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
    </span>
  )
}
