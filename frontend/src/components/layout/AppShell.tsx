import { Suspense } from 'react'
import { Link, Outlet } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'

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
              className="flex items-center gap-2.5 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <BrandMark />
              <span className="text-[15px] font-semibold tracking-tight">WindDesk</span>
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
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
    </div>
  )
}

/** The WindDesk mark: two wind strokes in a rounded tile (also the favicon). */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true">
      <rect width="24" height="24" rx="6" className="fill-foreground" />
      <path
        d="M5.5 9.5h9a2.5 2.5 0 1 0-2.5-2.5M5.5 14.5h11.5a2.5 2.5 0 1 1-2.5 2.5"
        fill="none"
        className="stroke-forecast"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PageFallback() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <Skeleton className="mb-6 h-12 w-80 max-w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
