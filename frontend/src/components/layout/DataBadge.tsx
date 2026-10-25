import { Link } from 'react-router'

import { useHealth } from '@/api/queries'
import { shortSnapshotId } from '@/lib/format'

/** Pilot scope and snapshot id; links to Methodology (UI_SPEC §2). */
export function DataBadge() {
  const { data } = useHealth()
  const snapshot = shortSnapshotId(data?.snapshot_id)

  return (
    <Link
      to="/methodology"
      className="inline-block rounded-sm font-mono text-[11px] tracking-wide text-muted-foreground uppercase hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      Pilot · Jan 2026 decisions · Elexon BMRS ·{' '}
      {snapshot ? (
        <>
          snapshot <span className="normal-case">{snapshot}</span>
        </>
      ) : (
        'snapshot pending'
      )}
    </Link>
  )
}
