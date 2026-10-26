# WindDesk — Demo video script (≤ 10 min)

The numbers come from `docs/INSIGHTS.md` (snapshot `ac22a4140bca`) and were checked against the app on 2026-10-26. Spoken figures are rounded the way the app shows them. Rehearse once with a timer. Each part must stay **under 5:00**. Aim for 4:30 to leave slack.

**Recording setup:** 1080p, browser at 110% zoom, bookmarks bar hidden, light theme, notifications off. Before recording, open these tabs on https://e26ay-wtpn.vercel.app, in order:

1. `/?date=2026-01-27&auction=epex&conf=0.9&view=trader` (story day 1, Trader view)
2. `/?date=2026-01-28&auction=epex&conf=0.9&view=hindsight` (story day 2)
3. `/accuracy`
4. `/monitor`
5. `/methodology`

Record each part separately and join them. Add YouTube chapters in the description (`0:00 Client overview`, `5:00 Technical walkthrough`). Upload as **Unlisted**.

---

## Part 1 — Client pitch (target 4:30)

**0:00 – 0:30 · The problem in their words**
> "Every morning, before the day-ahead auction closes at 09:20, your desk commits tomorrow's purchases. The biggest unknown is wind. The question you actually need answered isn't 'what's the forecast?' It's 'how much wind can I bank on, and how wrong could that be?' That's what WindDesk answers, using every decision you made in January."

**0:30 – 1:30 · Decision Desk, Tue 27 Jan: the buffer did its job** (tab 1)
1. Start in **Trader view**: "This is exactly what you had at 09:20 on Monday 26 January: the run published at 07:30, 16.5 to 39.5 hours ahead. Nothing published after your cutoff is used."
2. Point at **Wind you can count on**: "The forecast said 477 GWh for Tuesday, about 19.9 GW an hour. At 90% confidence you could count on an average of 14,465 MW. That's the number to plan against, not the headline."
3. Switch to **Hindsight**: "Wind came in 18% below forecast, 394 GWh, with the largest shortfall of 5,914 MW at 23:00. But firm wind held in 23 of 24 hours. The forecast missed, and the buffer absorbed it."

**1:30 – 2:15 · Wed 28 Jan: the honest limit** (tab 2)
1. "Now the worst day of the month. The forecast said 267 GWh and 138 came: 48% below. Firm wind held in none of the 24 hours, and the biggest shortfall was 6,210 MW at 04:00."
2. **How the forecast evolved:** hover over the dashed runs. "Every run that morning, up to 09:30, said the same thing, about 11.1 GW an hour, so an N2EX bidder at 09:50 would have been no better off. The first run to see the drop was 11:30, after both auctions had closed, and even it was too high: 8.8 GW against the 5.8 GW that actually came. No buffer sized on a normal month covers a day like this, which is why the Accuracy Lab shows you the tails."

**2:15 – 3:45 · Accuracy Lab: the numbers you can set policy on** (tab 3)
1. Read the **takeaways** box aloud, briefly: "Typically off by 2,023 MW at your decision point; it runs high by 1,746 MW on average; hold back 4,154 MW to cover 90% of shortfalls."
2. **Error by lead time:** "Error grows from 1,667 MW at an hour and a half ahead to about 1,950 MW a day ahead, and 2,405 MW at two days. That's the price of committing early. The green band is where your decisions sit."
3. **Buffer by wind level:** "The windier the forecast, the bigger the buffer: above 18.1 GW, hold 5,376 MW. We back-tested this one day at a time, never using the day being judged, and firm wind held in 87% of hours against a 90% target. That's close, and honest for one month of data."
4. **Value of the forecast:** "Without a forecast you could only bank 5,380 MW on an average hour. With it, 9,523 MW. That's 4,143 MW more wind you can plan on, every hour."
5. **Auction timing:** "Bidding at 09:50 instead of 09:20 gets you the 09:30 run, and it improves accuracy by only 1.3%: 2,023 MW down to 1,996. The cutoff isn't where the value is."
6. On the bias, use this framing: "The forecast runs high almost everywhere. We read that as a structural gap between the two Elexon datasets, which we quantify and buffer against. It's worth confirming with your data team."

**3:45 – 4:15 · Monitor and trust** (tabs 4 and 5)
- Quick horizon-slider sweep: "Your analysts can explore any window at any lead time."
- Methodology page: "Every definition and data check is here. The numbers are reproducible from Elexon's public data."

**4:15 – 4:30 · Recommendations and next steps**
> "Three recommendations. Plan against P90 firm wind rather than the point forecast; it held in 87% of hours here. Keep your 09:20 bidding: the later run buys you only 1.3%. And let us extend this to your contracted wind portfolio, with buffers weighted by your actual imbalance costs and a live daily feed with alerts."

---

## Part 2 — Technical walkthrough for the tech lead (target 4:30)

**5:00 – 5:30 · Scope and constraints**
React + FastAPI, Docker, Vercel. Two Elexon datasets, January 2026 decisions, a 16 h budget. Show the README file map.

**5:30 – 6:30 · Architecture** (Mermaid diagram in the README)
- The data is a frozen pilot window, so it's an **ingested, validated Parquet snapshot instead of a database** (ADR-0001).
- **One FastAPI app** serves `/api` and the SPA, so there's one origin and identical behaviour in Docker and on Vercel (ADR-0002).
- The layers: ingest → store → **pure analytics** → services (cached) → thin routers.

**6:30 – 7:30 · Data and analytics (show code)**
- `quality.json` checks: 8 runs a day, 73 points per run, 48 periods a day. One off-schedule run (15 Jan 12:25 UTC) is kept as published and never used as a decision run.
- `select_at_horizon` with `merge_asof(by=target_time, direction="backward")`, on screen.
- The **no-look-ahead** test and the BST timezone test.
- Leave-one-day-out buffers and the calibration result (90% target → 87.0% achieved). The notebook imports the same functions, and it writes `INSIGHTS.md` with the same rounding as the app.

**7:30 – 8:15 · API and frontend**
- Contract-first: Pydantic models → OpenAPI → generated TypeScript types; CI fails if they drift.
- Deterministic responses with ETag and CDN cache headers. Warm API responses take 1–11 ms in the production image (budget 300 ms).
- Frontend: TanStack Query, view state in the URL (shareable), one ECharts wrapper that loads ECharts on first chart mount, semantic colour tokens. Slow-4G first load is 1.4–2.1 s LCP (budget 2.5 s).

**8:15 – 9:00 · Quality and delivery**
- `make check` is the single gate. CI runs lint, types, tests (450 backend tests, 99% coverage on analytics; 103 frontend tests), build and docker build, plus Playwright smoke tests at desktop and 375 px.
- Vercel config notes: entrypoint, bundle exclusions, SPA on the CDN (`cdn = true` because of the GZip middleware).
- **AI usage:** planning documents and implementation were done with Claude Code. Say how you steered and reviewed it: phase-by-phase DoD, tests written against hand-computed values, and decisions recorded as ADRs and in `PROGRESS.md`.

**9:00 – 9:30 · Limitations and next steps**
One month of data (small-sample tails), national proxy, LODO vs rolling calibration, embedded wind not visible, and the unexplained over-forecast. Next: rolling calibration, portfolio-level data, a cost-weighted buffer, live ingestion on a schedule.
