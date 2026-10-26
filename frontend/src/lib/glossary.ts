/** One-line definitions for InfoTips, from the PRD glossary (PRD §6). Static copy, not generated. */
export const GLOSSARY = {
  targetTime: 'The hour or half-hour the generation refers to.',
  publishTime: 'When a forecast run was issued.',
  leadTime: 'Target time minus publish time, in hours: how far ahead the forecast was made.',
  horizon:
    'For each hour, the app uses the latest forecast published at least this many hours before it.',
  run: 'All forecast values issued at one publish time (about 8 runs a day).',
  cutoff:
    'The moment the purchase is locked: the auction gate closure on the day before delivery (UK time).',
  deliveryDay: '00:00–24:00 UK time, matching the settlement day.',
  error: 'Forecast − actual (MW). Positive means over-forecast, i.e. wind shortfall.',
  shortfall: 'Wind that was expected but did not arrive: max(error, 0).',
  buffer: 'The over-forecast you would need to cover in a chosen share of hours (e.g. 90%).',
  firmWind:
    'Forecast minus the buffer: wind you can count on at the chosen confidence, learned from other days only.',
  mae: 'Mean absolute error: the typical size of a miss, in MW.',
  rmse: 'Root mean squared error: like MAE but weights large misses more.',
  bias: 'Mean error. Positive means the forecast tends to run high.',
  wape: 'Σ|error| ÷ Σ actual: total miss as a share of the wind that blew.',
  p90Abs: 'Nine in ten hours miss by less than this (in either direction).',
  p90Shortfall: 'Nine in ten hours fall short of the forecast by less than this.',
  windShare:
    'The part of national wind output your contracts give you, e.g. 10% if your PPAs track a tenth of GB wind. Illustrative: a real portfolio does not follow national wind exactly.',
  coverage:
    'Share of hours that have a forecast at least this far ahead. Runs only reach about 43 h ahead for late-evening hours.',
} as const
