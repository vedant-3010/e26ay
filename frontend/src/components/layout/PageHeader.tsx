import { useEffect, type ReactNode } from 'react'

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · WindDesk`
  }, [title])
  return (
    <div className="mb-5">
      <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
      {children && (
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  )
}
