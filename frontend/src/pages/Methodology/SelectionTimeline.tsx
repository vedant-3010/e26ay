/**
 * How the decision forecast is picked, drawn to scale (UI_SPEC §3.4): WINDFOR runs tick along the
 * top for the two days before delivery, the gate closure on D−1 splits them into "available" and
 * "too late", and the decision run reaches 16.5–39.5 h ahead into the delivery day.
 * Colours come from the design tokens via Tailwind classes; text uses text tokens.
 */
const W = 760
const LEFT = 24
const RIGHT = 24
const HOURS = 72 // D−2 00:00 → D+1 00:00
const RUN_TIMES = [2.5, 4.5, 7.5, 9.5, 11.5, 15.5, 18.5, 22.5]
const CUTOFF = 24 + 9 + 20 / 60 // D−1 09:20
const DECISION_RUN = 24 + 7.5 // D−1 07:30

const x = (h: number) => LEFT + ((W - LEFT - RIGHT) * h) / HOURS

export function SelectionTimeline() {
  const runs = [0, 24].flatMap((day) => RUN_TIMES.map((t) => day + t))
  const deliveryStart = x(48)
  const deliveryEnd = x(72)
  return (
    <svg
      viewBox={`0 0 ${W} 190`}
      role="img"
      aria-labelledby="timeline-title timeline-desc"
      className="h-auto w-full"
    >
      <title id="timeline-title">How the decision forecast is selected</title>
      <desc id="timeline-desc">
        Forecast runs are published eight times a day. For delivery day D, the EPEX gate closure is
        09:20 on D−1; the latest run published before it, at 07:30, is the decision run. It reaches
        from 16.5 to 39.5 hours ahead into day D. Runs published after the cutoff are not used.
      </desc>

      {/* Day bands */}
      {['D−2', 'D−1', 'D (delivery)'].map((label, i) => (
        <g key={label}>
          <rect
            x={x(i * 24)}
            y={30}
            width={x((i + 1) * 24) - x(i * 24)}
            height={120}
            className={i === 2 ? 'fill-forecast/10' : i % 2 ? 'fill-muted/60' : 'fill-transparent'}
          />
          <text x={x(i * 24) + 6} y={168} className="fill-muted-foreground text-[11px]">
            {label}
          </text>
        </g>
      ))}
      <line x1={x(0)} x2={x(72)} y1={150} y2={150} className="stroke-border" />
      {[0, 24, 48, 72].map((h) => (
        <line key={h} x1={x(h)} x2={x(h)} y1={146} y2={154} className="stroke-muted-foreground" />
      ))}

      {/* Runs */}
      <text x={x(0) + 6} y={22} className="fill-muted-foreground text-[11px]">
        WINDFOR runs (8 a day)
      </text>
      {runs.map((h) => {
        const after = h > CUTOFF
        const decision = h === DECISION_RUN
        return (
          <g key={h}>
            <line
              x1={x(h)}
              x2={x(h)}
              y1={44}
              y2={60}
              strokeWidth={decision ? 3 : 1.5}
              strokeDasharray={after ? '3 3' : undefined}
              className={
                decision
                  ? 'stroke-forecast'
                  : after
                    ? 'stroke-vintage-late'
                    : 'stroke-vintage-late/70'
              }
            />
          </g>
        )
      })}

      {/* Cutoff */}
      <line
        x1={x(CUTOFF)}
        x2={x(CUTOFF)}
        y1={36}
        y2={150}
        strokeDasharray="4 3"
        className="stroke-cutoff"
      />
      <text x={x(CUTOFF) + 6} y={86} className="fill-foreground text-[11px] font-medium">
        Gate closure 09:20
      </text>
      <text x={x(CUTOFF) + 6} y={100} className="fill-muted-foreground text-[11px]">
        later runs not available
      </text>

      {/* Decision run → delivery day */}
      <circle
        cx={x(DECISION_RUN)}
        cy={52}
        r={5}
        className="fill-forecast stroke-card"
        strokeWidth={2}
      />
      <text
        x={x(DECISION_RUN) - 6}
        y={76}
        textAnchor="end"
        className="fill-forecast text-[11px] font-semibold"
      >
        Decision run 07:30
      </text>
      <path
        d={`M ${x(DECISION_RUN)} 118 H ${deliveryEnd - 2}`}
        className="stroke-forecast"
        strokeWidth={1.5}
        markerEnd="url(#arrow)"
      />
      <line x1={deliveryStart} x2={deliveryStart} y1={112} y2={124} className="stroke-forecast" />
      <text
        x={(x(DECISION_RUN) + deliveryStart) / 2}
        y={136}
        textAnchor="middle"
        className="fill-muted-foreground text-[11px]"
      >
        16.5 h ahead
      </text>
      <text
        x={(deliveryStart + deliveryEnd) / 2}
        y={136}
        textAnchor="middle"
        className="fill-muted-foreground text-[11px]"
      >
        … to 39.5 h ahead
      </text>
      <text
        x={(deliveryStart + deliveryEnd) / 2}
        y={84}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-medium"
      >
        24 hourly forecasts for day D
      </text>
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 z" className="fill-forecast" />
        </marker>
      </defs>
    </svg>
  )
}
