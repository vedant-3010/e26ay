import { Link, Outlet } from 'react-router'

import { DataBadge } from './DataBadge'
import { Footer } from './Footer'
import { ThemeToggle } from './ThemeToggle'
import { TopNav } from './TopNav'

export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 pt-3 sm:flex-nowrap">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-sm text-base font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <BrandMark />
              WindDesk
            </Link>
            <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <TopNav />
            </div>
            <div className="ml-auto sm:ml-0">
              <ThemeToggle />
            </div>
          </div>
          <div className="pb-2 sm:pt-0">
            <DataBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-content flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}

function BrandMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 text-forecast" aria-hidden="true">
      <path d="M15 1v14H1z" fill="currentColor" />
    </svg>
  )
}
