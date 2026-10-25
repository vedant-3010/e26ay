import { useHealth } from '@/api/queries'
import { shortSha } from '@/lib/format'

export function Footer() {
  const { data, isError } = useHealth()
  const sha = shortSha(data?.git_sha)

  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-content flex-wrap gap-x-2 gap-y-1 px-4 py-3 text-xs text-muted-foreground sm:px-6">
        <span>Data: Elexon BMRS FUELHH (WIND) &amp; WINDFOR</span>
        <span aria-hidden="true">·</span>
        <span>All times UK</span>
        {isError && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-destructive">API unavailable</span>
          </>
        )}
        {data && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-mono">v{data.version}</span>
            {sha && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{sha}</span>
              </>
            )}
          </>
        )}
      </div>
    </footer>
  )
}
