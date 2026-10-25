# ADR-0004: Forecast selection, alignment and the no-look-ahead invariant

- Status: Accepted
- Date: 2026-10-25

## Context
WINDFOR publishes about 8 hourly runs a day. FUELHH actuals are half-hourly. Trading decisions lock at the auction gate closure on D−1.

## Decision
1. **Fixed-horizon selection:** for target t and horizon H, use the latest run with `publish_time ≤ t − H` (`merge_asof`, backward, by target).
2. **Decision selection:** use the single latest run with `publish_time ≤ cutoff(D−1, gate closure, Europe/London)` for all hours of D. Never substitute another run for missing hours.
3. **Alignment:** compare forecast hour H with the settlement period starting at H (a direct `startTime` join, as the brief implies). The notebook reports sensitivity against the hourly mean.
4. **Error sign:** `forecast − actual`; positive = over-forecast = shortfall.
5. **Buffers:** leave-one-day-out quantiles of decision-mode errors.

## Consequences
- ✅ Matches how the desk actually trades; no look-ahead (tested).
- ⚠️ At long horizons (> ~43.5 h) some evening hours have no qualifying run. This is shown as a coverage gap rather than hidden.
- ⚠️ LODO uses later days' errors. That's acceptable for a one-month pilot backtest and documented. Production should use rolling windows.
