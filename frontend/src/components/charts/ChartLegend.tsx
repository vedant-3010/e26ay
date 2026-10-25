export type LegendKind = 'line' | 'marker-line' | 'dashed' | 'area' | 'thick-line'

export interface LegendItem {
  label: string
  /** A CSS colour built from the tokens, e.g. `var(--forecast)`. */
  color: string
  kind: LegendKind
}

function Key({ color, kind }: Omit<LegendItem, 'label'>) {
  if (kind === 'area') {
    return <span className="inline-block size-2.5 rounded-[2px]" style={{ background: color }} />
  }
  if (kind === 'dashed') {
    return (
      <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
    )
  }
  return (
    <span className="relative inline-flex w-4 items-center">
      <span
        className={
          kind === 'thick-line' ? 'h-[3px] w-full rounded-full' : 'h-0.5 w-full rounded-full'
        }
        style={{ background: color }}
      />
      {kind === 'marker-line' && (
        <span
          className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full ring-2 ring-card"
          style={{ background: color }}
        />
      )}
    </span>
  )
}

/** An HTML legend above the canvas: keys mirror the marks (line, dashed line, swatch), the
 * text stays in text tokens, and it wraps cleanly on small screens. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <Key color={item.color} kind={item.kind} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
