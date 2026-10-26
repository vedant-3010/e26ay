# WindDesk — Product Requirements (v1, pilot)

> **One-liner:** WindDesk shows a UK supplier's day-ahead desk the wind forecast they actually had when they had to commit, and how much of that wind they could safely bank on.

Status: Approved for build · Owner: Product · Pilot window: purchase decisions made in January 2026

---

## 1. Problem

The client is a UK electricity supplier. Every morning its day-ahead team must buy, in the day-ahead auction, the power its customers will use tomorrow that renewables won't cover. Wind is the largest and most volatile renewable source, so the volume they buy depends directly on tomorrow's wind forecast.

Three things make this hard:

1. **Timing.** The decision is locked at the auction gate closure on the day before delivery (EPEX SPOT GB day-ahead closes 09:20 UK; Nord Pool N2EX closes 09:50 UK). New wind forecasts are published about 8 times a day. The forecast that matters is the latest one published *before the cutoff*, not the one published just before delivery.
2. **Uncertainty.** A point forecast hides how wrong it can be. If wind under-delivers, the supplier is short and must buy back power closer to real time or settle imbalance, usually at worse prices.
3. **No quantified error.** The team has no trusted, decision-specific measure of forecast error at the lead time they actually trade at (roughly 14–40 hours ahead).

## 2. Users and jobs-to-be-done

| User | Job | What they need from WindDesk |
|---|---|---|
| **Day-ahead trader** (primary) | "Before gate closure, tell me how much wind to expect tomorrow and how much I can rely on." | The forecast available at their cutoff, hour by hour, plus a confidence-based "firm wind" figure. |
| **Desk lead / risk manager** | "How good are the forecasts we rely on, and what buffer policy is justified?" | Error statistics at the trading lead time, buffer sizes by confidence level, evidence the buffer holds. |
| **Analyst** | "Investigate specific misses and patterns." | Flexible horizon/date exploration, worst events, error by hour and by wind level. |

## 3. Goals, non-goals, success criteria

### Goals
- **G1 — Decision clarity.** For any delivery day in scope, a trader sees the forecast that was available at their cutoff in ≤ 2 interactions.
- **G2 — Quantified error.** Forecast error is quantified at the lead times that matter, in MW, with plain-language buffer guidance ("hold X MW to cover 90% of shortfalls").
- **G3 — Trust.** Every number is reproducible, the method is documented in the app, and no future information leaks into a decision view (no look-ahead).

### Non-goals (v1)
Price forecasting · demand data · trade execution · solar or other renewables · regional/farm-level data · user accounts · any dataset other than Elexon FUELHH (WIND) and WINDFOR.

### Success criteria for the pilot
- The client can answer "what did we know at 09:20 on day X?" for every delivery day from 2 Jan to 1 Feb 2026.
- Headline accuracy metrics (MAE, bias, P90 shortfall) are shown for the decision lead time and by lead time from 0–48 h.
- The firm-wind band's achieved coverage is within ±5 percentage points of its target (for example, 85–95% for the 90% band), measured without look-ahead.
- Page loads feel instant (API p95 < 300 ms warm; first load < 2.5 s LCP on the deployed app).

## 4. Scope and data boundaries

- **Actuals:** Elexon BMRS `FUELHH`, `fuelType = WIND`, national, half-hourly.
- **Forecasts:** Elexon BMRS `WINDFOR`, national, hourly, published ~8 times/day.
- **Pilot window:** purchase decisions made 1–31 January 2026, which means **delivery days 2 January – 1 February 2026**. The Monitor also allows 1 January for context.
- Details and exact timestamps: `DATA_AND_ANALYTICS.md` §2.

## 5. Features

Priority uses MoSCoW. "Must" items define v1. Build "Should" items only after all "Must" items pass. "Could" items are stretch work.

### F1 — Decision Desk (Must) — the home page

Answers "what did we know at the cutoff, and what can we bank on?"

**User stories**
- As a trader, I pick a delivery day and my auction, and I see the forecast that was available at that auction's gate closure.
- As a trader, I see a firm-wind line at my chosen confidence: the wind I could count on.
- As a trader, I can switch to hindsight and see what actually happened against what I planned on.
- As a desk lead, I see how the forecast for that day kept changing after the cutoff (forecast evolution).

**Acceptance criteria**
1. Delivery date picker limited to 2 Jan – 1 Feb 2026, with previous/next-day buttons.
2. Auction selector: `EPEX GB DA (09:20)` (default), `N2EX DA (09:50)`, `Custom` (time input, 15-minute steps).
3. Context strip states: decision cutoff (UK time), forecast run used (its publish time, UK), and lead-time range (e.g. "16.5–39.5 h ahead").
4. Main chart: forecast (hourly), firm-wind band at the chosen confidence (80/90/95%, default 90%), and actuals (half-hourly) when hindsight is on. Shortfall periods (actual below forecast) are visibly highlighted.
5. KPI cards: forecast energy (GWh); average firm wind (MW); and in hindsight, actual energy (GWh), day MAE (MW), largest shortfall (MW and time), and firm-wind hours kept (e.g. 22/24).
6. An auto-generated plain-English summary of the day, built from the numbers on screen with a template (no LLM).
7. Forecast evolution chart: every run that covered the day. The decision run is emphasised. Runs published after the cutoff are dashed and labelled "not available at decision time".
8. A **no look-ahead** guarantee: nothing published after the cutoff contributes to the forecast or firm-wind values. This is covered by a test.
9. If the chosen cutoff leaves some hours without forecast coverage, those hours show as gaps with an explanatory note. The app must not substitute another run silently.

### F2 — Forecast Monitor (Must)

Free exploration of actual vs forecast for any window and lead time (the classic "horizon slider" view).

**Acceptance criteria**
1. Start and end date-time pickers within the data range (1 Jan 00:00 – 1 Feb 23:30 UK). Default: 2–9 Jan. Maximum span 35 days.
2. Horizon slider 0–48 h (0.5 h steps, default 24 h). For each target hour the app uses the **latest forecast published at least H hours before it**.
3. Chart: actual (blue, half-hourly) and forecast (green, hourly), zoom/pan, and a synchronized error panel underneath (shortfall amber, surplus slate).
4. Tooltip shows time (UK), actual, forecast, error, publish time of the forecast used, and its exact lead time.
5. Metrics strip for the window: n, MAE, RMSE, bias, P90 absolute error, P90 shortfall, WAPE.
6. Coverage indicator ("forecast available for 98% of hours"), with an explanation when below 100%. Coverage gaps are expected at long horizons; see `DATA_AND_ANALYTICS.md` §5.1.

### F3 — Accuracy Lab (Must core · Should advanced)

Quantifies error for desk leads and analysts.

**Must**
1. Population selector: *Decision forecasts* (EPEX or N2EX cutoff; default EPEX) or *Fixed horizon* (slider). Date range defaults to the full pilot window.
2. Headline KPI strip: MAE, RMSE, bias, P90 shortfall, WAPE, n.
3. **Error vs lead time** chart (0–48 h): MAE, P90 |error| and P99 |error|, with the decision lead window shaded.
4. **Error distribution** histogram (signed error) with P10/P50/P90 markers.
5. **Key takeaways** box: three sentences generated from the numbers.

**Should**
6. **Buffer by wind level:** P80/P90/P95 shortfall per forecast-level bin, plus achieved coverage (calibration).
7. **Error by hour of day:** MAE bars with a bias line.
8. **Daily timeline:** MAE and bias per delivery day. Clicking a day opens the Decision Desk for it.
9. **Worst 10 hours** table. Clicking a row opens the Decision Desk for that day.
10. **Auction timing comparison:** EPEX (09:20) vs N2EX (09:50) cutoff, comparing MAE and P90 shortfall. This quantifies the value of a fresher forecast.
11. **Value of the forecast:** how much wind you can bank at 90% confidence *with* the forecast (average firm wind) vs *without* it (P10 of actual wind). This is the single strongest number for the pitch.

### F4 — Firm wind and buffers (Must, simple → Should, full)

- **Must:** buffer at confidence c = c-quantile of over-forecast error (`forecast − actual`) across decision-mode pairs, excluding the day being viewed (leave-one-day-out). Firm wind = max(forecast − buffer, 0).
- **Should:** buffer conditional on forecast level (quintile bins), with the same leave-one-day-out rule. Achieved coverage is reported.
- Method: `DATA_AND_ANALYTICS.md` §5.7–5.8.

### F5 — Methodology and data quality (Must)

- Data sources with links, the pilot window, definitions (glossary below), and the selection rules, illustrated by a simple timeline graphic (publish → cutoff → delivery day).
- Alignment policy (hourly forecast vs half-hourly actual), calibration method, limitations.
- Data quality table from the ingest report: rows, runs, missing periods, duplicates removed, anomalies.

### F6 — Shareable views and export (Should)

- All view state lives in URL query params (date, auction, cutoff, confidence, horizon, range, population). Copying the URL reproduces the view.
- "Download CSV" for the current chart data (client-side).

### F7 — Procurement what-if (Could)

- The user enters an expected demand (flat MW, or 24 hourly values pasted) and a wind exposure share (%). The app shows the residual volume to procure at P50 (forecast) and at the chosen confidence (firm). It is clearly labelled as illustrative.

### F8 — Live mode (Could)

- Optional `/api/live` endpoint fetches the latest WINDFOR run from Elexon (cached 10 minutes) and shows "tomorrow's wind as of now" in the same Decision Desk visual. It is behind a feature flag and off by default, because the brief limits data to the pilot window.

## 6. Glossary (shown in-app)

| Term | Meaning |
|---|---|
| **Target time** | The hour/half-hour the generation refers to (`startTime`). |
| **Publish time** | When a forecast run was issued (`publishTime`). |
| **Lead time / horizon** | Target time − publish time, in hours. |
| **Run / vintage** | All forecast values issued at one publish time. |
| **Decision cutoff** | The moment the purchase is locked: auction gate closure on the day before delivery (UK time). |
| **Delivery day** | 00:00–24:00 UK local time (matches settlement date). |
| **Error** | Forecast − actual (MW). Positive = over-forecast = wind shortfall. |
| **Shortfall** | max(error, 0). Wind that was expected but did not arrive. |
| **Buffer (P90)** | The over-forecast you'd need to cover in 90% of hours. |
| **Firm wind (P90)** | Forecast − P90 buffer. Wind you can count on 90% of the time. |
| **MAE / RMSE / bias / WAPE** | Mean absolute error / root mean squared error / mean error / Σ\|error\| ÷ Σ actual. |

## 7. Assumptions (stated in the app and the pitch)

1. National wind is the proxy for the client's renewable position (as the brief specifies).
2. The default decision cutoff is EPEX GB day-ahead gate closure (09:20 UK). N2EX (09:50 UK) and custom times are supported.
3. Delivery day = UK settlement day (00:00–24:00 local). Note: the N2EX hourly product day runs 23:00–23:00 UK. This is a documented simplification.
4. Forecast hour H is compared with the settlement period starting at H. A sensitivity check against the hourly mean is in the analysis notebook.
5. FUELHH and WINDFOR both reflect transmission-metered national wind; embedded (distribution-connected) wind is not visible. To be confirmed against Elexon's dataset descriptions and stated on the Methodology page.
6. Buffers are calibrated on the pilot month only (~744 decision-hours), so P95 is shown with a "small sample" caveat and P99 is not offered as a buffer.

## 8. Open questions for the client (good to raise in the pitch)

- Which auction(s) do you bid into, and what is your internal cutoff before gate closure?
- What is your wind exposure: national proxy, or specific contracted farms?
- Is under-procurement or over-procurement more costly for you? This would let us move from symmetric metrics to a cost-weighted buffer.
- Would you want alerts (e.g. "today's forecast spread is unusually wide")?

## 9. Release checklist (from the brief)

- [x] React frontend, Python backend, Docker
- [x] Deployed on Vercel (Heroku fallback), public URL works in incognito
- [x] Public GitHub repo with an anonymous name; README with files/directories, how to start, live link, AI-tools disclosure
- [ ] Unlisted YouTube video ≤ 10 min: Part 1 client pitch ≤ 5 min, Part 2 tech-lead walkthrough ≤ 5 min
- [ ] Submission form filled; every URL checked in incognito
