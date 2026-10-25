# WindDesk — Demo video script (≤ 10 min)

Fill every `[…]` from `docs/INSIGHTS.md` (Phase 8.4). Rehearse once with a timer. Each part must stay **under 5:00**. Aim for 4:30 to leave slack.

**Recording setup:** 1080p, browser at 110% zoom, bookmarks bar hidden, light theme, app pre-loaded on story day 1, notifications off. Record each part separately and join them. Add YouTube chapters in the description (`0:00 Client overview`, `5:00 Technical walkthrough`). Upload as **Unlisted**.

---

## Part 1 — Client pitch (target 4:30)

**0:00 – 0:30 · The problem in their words**
> "Every morning, before the day-ahead auction closes at 09:20, your desk commits tomorrow's purchases. The biggest unknown is wind. The question you actually need answered isn't 'what's the forecast?' It's 'how much wind can I bank on, and how wrong could that be?' That's what WindDesk answers, using every decision you made in January."

**0:30 – 2:15 · Decision Desk on story day 1 ([worst-miss day])**
1. Start in **Trader view**: "This is exactly what you had at 09:20 on [date]: the run published at 07:30, 16.5–39.5 hours ahead. Nothing published after your cutoff is used."
2. Point at **firm wind**: "At 90% confidence you could count on an average of [X] MW, not the [Y] MW headline forecast."
3. Switch to **Hindsight**: "Wind came in [Z]% below forecast, with a [S] MW shortfall at [time]. Firm wind held for [k] of 24 hours."
4. **Forecast evolution:** "The later runs saw it coming. An N2EX bidder at 09:50 would have had the 09:30 run." (Hover to show it.)

**2:15 – 3:45 · Accuracy Lab: the numbers you can set policy on**
1. Read the **takeaways** box aloud. Keep it short.
2. **Lead curve:** "Error grows from [a] MW at a couple of hours ahead to [b] MW at day-ahead. That's the price of committing early."
3. **Buffer and calibration:** "Hold [P90 buffer] MW to cover 90% of shortfalls. We back-tested that band, and it held [achieved]% of hours."
4. **Value of the forecast:** "Without a forecast you could only bank [u] MW. With it, [f] MW. That's [gain] MW of wind you can plan on every hour."
5. **Auction timing:** "Bidding at 09:50 instead of 09:20 cuts error by [p]%."

**3:45 – 4:15 · Monitor and trust**
- Quick horizon-slider sweep: "Your analysts can explore any window at any lead time."
- Methodology page: "Every definition and data check is here. The numbers are reproducible from Elexon's public data."

**4:15 – 4:30 · Recommendations and next steps**
> "Three recommendations: plan against P90 firm wind rather than the point forecast; revisit your bidding cutoff given the fresher 09:30 run; and let us extend this to your contracted wind portfolio, with buffers weighted by your actual imbalance costs and a live daily feed with alerts."

---

## Part 2 — Technical walkthrough for the tech lead (target 4:30)

**5:00 – 5:30 · Scope and constraints**
React + FastAPI, Docker, Vercel. Two Elexon datasets, January 2026 decisions, a 16 h budget. Show the README file map.

**5:30 – 6:30 · Architecture** (Mermaid diagram from ARCHITECTURE.md)
- The data is a frozen pilot window, so it's an **ingested, validated Parquet snapshot instead of a database** (ADR-0001).
- **One FastAPI app** serves `/api` and the SPA, so there's one origin and identical behaviour in Docker and on Vercel (ADR-0002).
- The layers: ingest → store → **pure analytics** → services (cached) → thin routers.

**6:30 – 7:30 · Data and analytics (show code)**
- `quality.json` checks: 8 runs a day, 73 points per run, 48 periods a day.
- `select_at_horizon` with `merge_asof(by=target_time, direction="backward")`, on screen.
- The **no-look-ahead** test and the BST timezone test.
- Leave-one-day-out buffers and the calibration result. The notebook imports the same functions.

**7:30 – 8:15 · API and frontend**
- Contract-first: Pydantic models → OpenAPI → generated TypeScript types; CI fails if they drift.
- Deterministic responses with ETag and CDN cache headers.
- Frontend: TanStack Query, view state in the URL (shareable), one ECharts wrapper, semantic color tokens.

**8:15 – 9:00 · Quality and delivery**
- `make check` is the single gate. CI runs lint, types, tests ([coverage]% on analytics), build and docker build.
- Vercel config notes: entrypoint, bundle exclusions, SPA on the CDN.
- **AI usage:** planning documents and implementation were done with Claude Code. Say how you steered and reviewed it: phase-by-phase DoD, tests written against hand-computed values, and decisions recorded as ADRs.

**9:00 – 9:30 · Limitations and next steps**
One month of data (small-sample tails), national proxy, LODO vs rolling calibration, embedded wind not visible. Next: rolling calibration, portfolio-level data, a cost-weighted buffer, live ingestion on a schedule.
