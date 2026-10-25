/**
 * All user-visible number and identifier formatting lives here (CLAUDE.md conventions).
 * Phase 5 adds MW/GWh/percentage formatters; time formatting lives in `time.ts`.
 */

/** Short git SHA for display (`abc1234def…` → `abc1234`). */
export function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 7) : null
}

/** Snapshot ids are 12 hex chars; the header shows the first 6 (UI_SPEC §2). */
export function shortSnapshotId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 6) : null
}
