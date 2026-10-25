import { META, monitorData } from '@/test/fixtures'

import { monitorCsv, monitorCsvFilename } from './exportCsv'
import { rangeError } from './range'

describe('monitorCsv', () => {
  it('has one row per period, forecast fields on the hour, and signed errors', () => {
    const lines = monitorCsv(monitorData()).trim().split('\r\n')
    expect(lines[0]).toBe(
      'target_time_utc,target_time_uk,actual_mw,forecast_mw,forecast_publish_time_utc,lead_h,error_mw',
    )
    expect(lines).toHaveLength(1 + 5)
    expect(lines[1]).toBe(
      '2026-01-02T00:00:00Z,Fri 2 Jan 00:00,10000,12000,2025-12-31T22:30:00Z,25.5,2000',
    )
    expect(lines[2]).toBe('2026-01-02T00:30:00Z,Fri 2 Jan 00:30,10100,,,,')
    expect(lines[3]).toContain(',-1000')
    expect(lines[4]).toBe('2026-01-02T01:30:00Z,Fri 2 Jan 01:30,,,,,') // missing actual stays empty
    expect(lines[5]).toBe('2026-01-02T02:00:00Z,Fri 2 Jan 02:00,9500,,,,')
  })

  it('names the file after the window and horizon', () => {
    expect(monitorCsvFilename(monitorData())).toBe(
      'winddesk-monitor_2026-01-02_2026-01-02_H24h.csv',
    )
  })
})

describe('rangeError', () => {
  const bounds = META.bounds
  it('accepts the default week and the whole data window', () => {
    expect(
      rangeError({ start: '2026-01-02T00:00:00Z', end: '2026-01-09T00:00:00Z' }, bounds),
    ).toBeNull()
    expect(rangeError({ start: bounds.target_from, end: bounds.target_to }, bounds)).toBeNull()
  })
  it('rejects windows outside the data, reversed, or empty', () => {
    expect(
      rangeError({ start: '2025-12-31T00:00:00Z', end: '2026-01-02T00:00:00Z' }, bounds),
    ).toMatch(/between Thu 1 Jan 00:00 and Mon 2 Feb 00:00/)
    expect(rangeError({ start: '2026-01-05T00:00:00Z', end: '2026-01-04T00:00:00Z' }, bounds)).toBe(
      'The end must be after the start.',
    )
    expect(rangeError({ start: '2026-01-05T00:00:00Z', end: '2026-01-05T00:00:00Z' }, bounds)).toBe(
      'The end must be after the start.',
    )
  })
  it('enforces the 35-day limit when bounds allow longer windows', () => {
    const wide = { ...bounds, target_to: '2026-03-01T00:00:00Z' }
    expect(rangeError({ start: '2026-01-01T00:00:00Z', end: '2026-02-10T00:00:00Z' }, wide)).toBe(
      'The window can span at most 35 days.',
    )
  })
})
