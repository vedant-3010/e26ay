import {
  addDays,
  fmtCalendarDate,
  fmtUkDateTime,
  fmtUkDay,
  fmtUkTime,
  hoursBetween,
  londonOffsetMinutes,
  ukLocalToUtcIso,
  utcIsoToUkLocal,
} from './time'

describe('UK formatting', () => {
  it('formats a January instant (GMT = UTC)', () => {
    expect(fmtUkDateTime('2026-01-15T18:00:00Z')).toBe('Thu 15 Jan 18:00')
    expect(fmtUkDay('2026-01-15T18:00:00Z')).toBe('Thu 15 Jan')
    expect(fmtUkTime('2026-01-15T18:00:00Z')).toBe('18:00')
  })
  it('formats a summer instant in BST, one hour ahead of UTC', () => {
    expect(fmtUkDateTime('2026-06-15T08:20:00Z')).toBe('Mon 15 Jun 09:20')
    expect(fmtUkDay('2026-06-15T23:30:00Z')).toBe('Tue 16 Jun') // already the next day in the UK
  })
  it('formats calendar dates without shifting them', () => {
    expect(fmtCalendarDate('2026-01-15')).toBe('Thu 15 Jan 2026')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-02', -1)).toBe('2026-01-01')
  })
})

describe('UK ↔ UTC conversion', () => {
  it('knows the London offset in winter and summer', () => {
    expect(londonOffsetMinutes('2026-01-15T12:00:00Z')).toBe(0)
    expect(londonOffsetMinutes('2026-06-15T12:00:00Z')).toBe(60)
  })
  it('converts UK wall-clock input to UTC', () => {
    expect(ukLocalToUtcIso('2026-01-02T00:00')).toBe('2026-01-02T00:00:00Z')
    expect(ukLocalToUtcIso('2026-06-15T09:20')).toBe('2026-06-15T08:20:00Z')
  })
  it('round-trips through the datetime-local format', () => {
    expect(utcIsoToUkLocal('2026-01-09T00:00:00Z')).toBe('2026-01-09T00:00')
    expect(utcIsoToUkLocal('2026-06-15T08:20:00Z')).toBe('2026-06-15T09:20')
    for (const iso of ['2026-01-31T23:30:00Z', '2026-03-29T00:30:00Z', '2026-10-25T03:00:00Z']) {
      expect(ukLocalToUtcIso(utcIsoToUkLocal(iso))).toBe(iso)
    }
  })
  it('rejects malformed input', () => {
    expect(() => ukLocalToUtcIso('2026-01-02')).toThrow()
  })
  it('measures hours between instants', () => {
    expect(hoursBetween('2026-01-02T00:00:00Z', '2026-01-09T00:00:00Z')).toBe(168)
  })
})
