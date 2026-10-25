import { shortSha, shortSnapshotId } from './format'

describe('shortSha', () => {
  it('keeps the first 7 characters', () => {
    expect(shortSha('abc1234def5678')).toBe('abc1234')
  })
  it('returns null for missing values', () => {
    expect(shortSha(null)).toBeNull()
    expect(shortSha(undefined)).toBeNull()
    expect(shortSha('')).toBeNull()
  })
})

describe('shortSnapshotId', () => {
  it('keeps the first 6 characters', () => {
    expect(shortSnapshotId('a1b2c3d4e5f6')).toBe('a1b2c3')
  })
  it('returns null for missing values', () => {
    expect(shortSnapshotId(null)).toBeNull()
  })
})
