import { RadioGroup } from 'radix-ui'

import { cn } from '@/lib/utils'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
}

/** Segmented buttons that are a real radio group (role="radiogroup", arrow keys; UI_SPEC §7). */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      className="inline-flex max-w-full flex-wrap rounded-lg border bg-muted p-0.5"
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors',
            'hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            'data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-xs',
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
