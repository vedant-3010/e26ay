# WindDesk — UI Specification

## 1. Design direction: "calm control room"

A trading-desk tool people trust at 09:00 with a deadline: dense but quiet, numbers first, no decoration. It should feel closer to a well-made terminal than a marketing dashboard.

- **Typography:** IBM Plex Sans (UI) and IBM Plex Mono (numbers, timestamps), loaded from Google Fonts. Use `font-variant-numeric: tabular-nums` everywhere numbers align.
- **Color is semantic and fixed across the whole app** (define as CSS tokens in `styles/globals.css`, with light and dark values):

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--actual` | `#2563EB` | `#3B82F6` | Actual generation (always blue) |
| `--forecast` | `#16A34A` | `#16A34A` | Forecast (always green) |
| `--firm` | `#16A34A` @ 18% | `#16A34A` @ 18% | Firm-wind band |
| `--shortfall` | `#D97706` | `#D97706` | Over-forecast / shortfall |
| `--shortfall-severe` | `#DC2626` | `#DC2626` | Errors beyond P90 |
| `--surplus` | `#64748B` | `#64748B` | Under-forecast / surplus |
| `--cutoff` | `#334155` dashed | `#CBD5E1` dashed | Decision cutoff marker |
| neutrals | slate scale | slate scale | Surfaces, text, grid |

> **Phase 5 change (validated):** the dark values above replace the original 400-level pastels (`#60A5FA`, `#4ADE80`, `#FBBF24`, `#94A3B8`, …). Run through the dataviz palette validator against the real dark surfaces (slate-900/950), those were too light for chart marks (dark lightness band L 0.48–0.67). The chosen set passes the lightness band, chroma floor, CVD separation (actual↔forecast deutan ΔE 27.5; actual↔shortfall protan ΔE 30.2) and ≥ 3:1 contrast. Light mode passes unchanged (actual↔forecast deutan ΔE 30.3). Surplus slate is deliberately low-chroma: shortfall is the emphasised pole, surplus the greyed one, and the bar's side of zero also encodes the sign.

- Surfaces are flat, with 1px borders and 8px radius. There are no gradients and no drop shadows except on popovers.
- **Density:** 14px base text; KPI values 28px mono; 24px section spacing; max content width 1280px.
- **Light theme by default**, with a dark toggle stored in localStorage (wrapped in try/catch). Respect `prefers-color-scheme` on first visit.
- Use the `frontend-design` skill if available for aesthetic decisions not covered here.

### 1.1 Refinement rules (Phase 6, applied app-wide)
- **Figures are readouts:** the value is in Plex Mono, the unit smaller and muted beside it, and the two never wrap apart (`Figure`). `%` stays attached.
- **Readout strips, not floating cards:** related figures share one panel with hairline dividers (`Readout`: the 1px grid gap shows the border colour). A lone last cell on the 2-column mobile grid spans both columns.
- **One chart frame** (`ChartPanel`): a header row (title, one-line description, actions such as CSV), an HTML legend whose keys mirror the marks (line, marker line, dashed, swatch), the plot, and an optional footnote under a hairline. ECharts' canvas legend is off: it wrapped over the plot on mobile.
- **The Decision Desk context strip is a timeline** (run used → gate closure → delivery), and its control bar is sticky on desktop.
- **Copy is short and in trading terms** ("Run used", "Gate closure", "Buffer held back"). InfoTips sit only on terms that need a definition.
- **The brand mark** is two wind strokes in a rounded tile (also the favicon). Header metadata is a quiet mono uppercase line.

## 2. App shell

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ◢ WindDesk   Decision Desk · Monitor · Accuracy Lab · Methodology    [◐] │
│             Pilot · Jan 2026 decisions · Elexon BMRS · snapshot a1b2c3   │
├───────────────────────────────────────────────────────────────────────────────┤
│  <page>                                                                       │
├───────────────────────────────────────────────────────────────────────────────┤
│ Data: Elexon BMRS FUELHH (WIND) & WINDFOR · All times UK · v1.0.0 · abc1234   │
└───────────────────────────────────────────────────────────────────────────────┘
```
- Nav is tabs on desktop and a horizontally scrollable tab bar on mobile (no hamburger).
- The data badge links to Methodology.

## 3. Pages

### 3.1 Decision Desk (`/`)

```
┌ Controls ────────────────────────────────────────────────────────────────────┐
│ Delivery day [◀ Thu 15 Jan 2026 ▶]  Auction [EPEX 09:20|N2EX 09:50|Custom]   │
│ Confidence [80|90|95%]                       View [Trader view | Hindsight]  │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Context strip ───────────────────────────────────────────────────────────────┐
│ Decision locked Wed 14 Jan 09:20 · Forecast run published 07:30 ·            │
│ 16.5–39.5 h ahead                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
┌ KPI ─────┐┌ KPI ──────┐┌ KPI ─────┐┌ KPI ─────┐┌ KPI ───────┐┌ KPI ──────┐
│Forecast  ││Firm wind  ││Actual    ││Day MAE   ││Largest     ││Firm kept  │
│412 GWh   ││13,100 MW  ││380 GWh   ││1,500 MW  ││shortfall   ││22/24 h    │
│          ││avg @90%   ││−8% vs fc ││          ││2,900 @18:00││           │
└──────────┘└───────────┘└──────────┘└──────────┘└────────────┘└───────────┘
  (Actual, Day MAE, Largest shortfall and Firm kept appear only in Hindsight)
┌ Summary (one paragraph, from the API `summary`) ─────────────────────────────┐
└──────────────────────────────────────────────────────────────────────────────┘
┌ Chart: Tomorrow's wind — forecast, firm wind, actual ────────────────────────┐
│  green line = forecast; green band = firm→forecast;                          │
│  blue line = actual (Hindsight); amber fill where actual < forecast          │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Chart: How the forecast evolved ─────────────────────────────────────────────┐
│  one line per run (older = lighter gray → decision run bold green);          │
│  runs after cutoff dashed, labelled "not available at decision time";        │
│  actual (blue) shown in Hindsight                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```
- The Trader view hides actual-dependent KPIs and series, and also the after-cutoff vintages. It is the "honest" view. Hindsight shows everything. **Default: Hindsight.** The pitch demo toggles between them.
- Keyboard: ← / → change the delivery day.
- A partial-coverage banner appears when `run.partial`.

### 3.2 Forecast Monitor (`/monitor`)

```
┌ Controls: Start [2 Jan 00:00]  End [9 Jan 00:00]   Horizon ●────── 24 h ─┐
│           presets: [1 week] [2 weeks] [Full month]                        │
└───────────────────────────────────────────────────────────────────────────┘
┌ Metrics strip: n · MAE · RMSE · Bias · P90 |err| · P90 shortfall · WAPE  ┐
│ Coverage 100% (i)                                        [Download CSV]  │
└───────────────────────────────────────────────────────────────────────────┘
┌ Chart (2 grids, shared x-axis + dataZoom) ────────────────────────────────┐
│ Top 70%: actual (blue, 30-min) vs forecast (green, hourly)                │
│ Bottom 30%: error bars (amber = shortfall, slate = surplus)               │
└───────────────────────────────────────────────────────────────────────────┘
```
- Slider: 0–48 h, step 0.5, with tick labels at 0/6/12/24/36/48, debounced 150 ms. Show "Day-ahead decisions are ~15–40 h ahead" as a hint under the slider.

### 3.3 Accuracy Lab (`/accuracy`)

```
┌ Controls: Population [Decision: EPEX|N2EX | Fixed horizon ●── 24 h]       ┐
│           Range [2 Jan – 1 Feb]   Confidence [80|90|95%]                  │
└───────────────────────────────────────────────────────────────────────────┘
┌ Key takeaways (3 bullets from API) ───────────────────────────────────────┐
┌ Headline KPI strip ───────────────────────────────────────────────────────┐
┌ A. Error vs lead time (full width) ───────────────────────────────────────┐
│ MAE line; P90 & P99 |err| lines; shaded band = decision lead window       │
└───────────────────────────────────────────────────────────────────────────┘
┌ B. Error distribution ─────────┐┌ C. Buffer by wind level ────────────────┐
│ histogram; P10/P50/P90 lines   ││ grouped bars P80/P90/P95; dot=achieved% │
└────────────────────────────────┘└─────────────────────────────────────────┘
┌ D. Error by hour of day ───────┐┌ E. Daily MAE & bias (click → Desk) ─────┐
└────────────────────────────────┘└─────────────────────────────────────────┘
┌ F. Auction timing (EPEX vs N2EX)┐┌ G. Value of the forecast ──────────────┐
└────────────────────────────────┘└─────────────────────────────────────────┘
┌ H. Worst 10 hours table (click row → Decision Desk for that day) ─────────┐
```
- Sections with `null` data (Should items not built yet) are hidden, not broken.
- **Built order (Phase 7):** controls → key takeaways → headline readout → A (full width) → C | B → G | F → E | D → H. This is a reordering of the wireframe so the page reads in the demo script's order (lead curve → buffers and calibration → value of the forecast → auction timing).
- G is the page's single hero figure (40px). F is a figure comparison (a small table), not a chart, because the story is two numbers. H rows and E bars open the day in the Decision Desk.

### 3.4 Methodology (`/methodology`)
Long-form, readable page with a max width of 760px and anchored sections: Data sources (with links) · Pilot window · Definitions (glossary from the PRD) · How we pick the forecast (inline SVG timeline: runs ticking along the top, cutoff line, delivery day block, lead-time arrow) · Alignment · Buffers & calibration · Data quality table (from `/api/meta`) · Limitations.

## 4. Chart specifications (ECharts)

| Chart | Type | X | Y | Notes |
|---|---|---|---|---|
| Decision main | line + area band | time (UK) | MW | Band = stacked areas (invisible firm base + (forecast − firm) filled `--forecast` at 18%, 8% in Hindsight so the shortfall reads). **Shortfall = a second stacked pair that fills only the gap from actual up to forecast** (amber), plus the part below firm wind (red); hourly, on the period starting at each hour. Gaps stay gaps. The axis spans exactly the delivery day. |
| Vintages | multi-line | time | MW | Up to 16 runs; color ramp from neutral-300 to neutral-500, decision run `--forecast` at 3px, after-cutoff runs dashed. Legend: "Earlier runs · Decision run · Later runs (not available)". |
| Monitor | 2 grids | time | MW / error MW | Two stacked grids on one shared time axis (small multiples, not a dual axis); `dataZoom` inside + slider linked to both; one crosshair (solid hairline) and one tooltip listing every value at that time; `connectNulls: false`; forecast symbols every hour (size 5, surface ring). Axis names run vertically beside each axis. At a half-hour the tooltip also shows that hour's forecast. Ticks use UTC (`useUTC`), labels UK time (equal in January). |
| Lead curve | line | lead h | MW | `markArea` for the decision window; tooltip shows n. |
| Distribution | bar (histogram) | error MW | count | markLines at P10/P50/P90; bars right of 0 tinted `--shortfall`. |
| Buffer by level | grouped bar, plus a separate achieved-% strip | forecast bin | MW (bars) · % (strip, its own axis) | **No dual axis** (dataviz rule: two scales on one plot invent correlations). Bars show P80/P90/P95 shortfall in MW; achieved % sits in a small aligned chart or row below, with the target line at the chosen confidence. |
| By hour | bar + line | hour UK | MW | Bars MAE, line bias. |
| Daily | bar + line | date | MW | Clickable bars navigate to Decision Desk. |

Common to all charts: animation ≤ 300 ms (off when `prefers-reduced-motion`), a tooltip with the time in UK format `Thu 15 Jan 18:00`, values in MW with a thousands separator, and a grid with 6–8 y-ticks.

## 5. Copy and formatting

- Power: `13,100 MW`; energy: `412 GWh`; errors keep their sign: `+1,300 MW` (over-forecast). Percentages to 1 decimal.
- Time: `Thu 15 Jan 18:00` (UK). Always label "UK time" once per page.
- Write plain language before jargon: "Wind you can count on (90%)" with the tooltip "Firm wind: forecast minus the P90 buffer…".
- Each control and chart has an `(i)` InfoTip with a one-line definition from the glossary.

## 6. States

- **Loading:** skeletons matched to the final layout (KPI blocks, chart box). No spinners in the middle of the page.
- **Empty / coverage gaps:** inline explanation, for example "No forecast run reaches 47 h ahead for evening hours; see Methodology §How we pick the forecast."
- **Error:** card with the message from the error envelope plus a Retry button. A global error boundary per page.
- **Slow network:** keep the previous data visible while refetching (TanStack `keepPreviousData`), with a thin progress bar at the top.

## 7. Responsiveness and accessibility

- Breakpoints: ≥1024 desktop (two-column sections), 640–1023 tablet (single column), <640 mobile (KPI grid 2 × n, charts 280px tall).
- All controls work by keyboard, focus rings are visible, and segmented controls are radio groups (`role="radiogroup"`).
- Charts carry an `aria-label` summarising what they show. A CSV download provides the data alternative.
- Color is never the only signal: the forecast line has hourly markers, after-cutoff runs are dashed, and shortfall bars have a legend.
