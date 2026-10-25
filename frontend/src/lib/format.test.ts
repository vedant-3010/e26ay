import {
  MISSING,
  fmtAxisMW,
  fmtCount,
  fmtGW,
  fmtGWh,
  fmtHourRange,
  fmtHours,
  fmtMW,
  fmtPct,
  fmtSignedMW,
  fmtSignedPct,
  shortSha,
  shortSnapshotId,
} from './format'

describe('power and energy', () => {
  it('formats MW with a thousands separator and unit', () => {
    expect(fmtMW(13_100)).toBe('13,100 MW')
    expect(fmtMW(1234.6)).toBe('1,235 MW')
  })
  it('keeps the sign of errors with a real minus sign', () => {
    expect(fmtSignedMW(1300)).toBe('+1,300 MW')
    expect(fmtSignedMW(-250.4)).toBe('−250 MW')
    expect(fmtSignedMW(0.3)).toBe('0 MW')
  })
  it('formats GW and GWh', () => {
    expect(fmtGW(13_100)).toBe('13.1 GW')
    expect(fmtGWh(412_000)).toBe('412 GWh')
  })
  it('renders missing values as an em dash', () => {
    for (const f of [fmtMW, fmtSignedMW, fmtGW, fmtGWh, fmtPct, fmtSignedPct, fmtHours, fmtCount]) {
      expect(f(null)).toBe(MISSING)
      expect(f(undefined)).toBe(MISSING)
      expect(f(Number.NaN)).toBe(MISSING)
    }
  })
})

describe('percentages, hours and counts', () => {
  it('uses one decimal for percentages', () => {
    expect(fmtPct(98)).toBe('98.0%')
    expect(fmtSignedPct(7.84)).toBe('+7.8%')
    expect(fmtSignedPct(-3.25)).toBe('−3.3%')
    expect(fmtSignedPct(0.01)).toBe('0.0%')
  })
  it('formats lead times and ranges', () => {
    expect(fmtHours(16.5)).toBe('16.5 h')
    expect(fmtHours(12 + 35 / 60)).toBe('12.58 h')
    expect(fmtHourRange(16.5, 39.5)).toBe('16.5–39.5 h')
    expect(fmtHourRange(null, 39.5)).toBe(MISSING)
  })
  it('formats counts and axis ticks', () => {
    expect(fmtCount(1536)).toBe('1,536')
    expect(fmtAxisMW(12_000)).toBe('12,000')
  })
})

describe('identifiers', () => {
  it('shortens SHAs and snapshot ids', () => {
    expect(shortSha('abc1234def5678')).toBe('abc1234')
    expect(shortSha(null)).toBeNull()
    expect(shortSha('')).toBeNull()
    expect(shortSnapshotId('a1b2c3d4e5f6')).toBe('a1b2c3')
    expect(shortSnapshotId(undefined)).toBeNull()
  })
})
