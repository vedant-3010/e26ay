import { NavLink } from 'react-router'

import { cn } from '@/lib/utils'

/** Top-level pages. Keep in sync with `routes` in router.tsx. */
const NAV_ITEMS = [
  { to: '/', label: 'Decision Desk' },
  { to: '/monitor', label: 'Monitor' },
  { to: '/accuracy', label: 'Accuracy Lab' },
  { to: '/methodology', label: 'Methodology' },
] as const

/** Tabs on desktop; a horizontally scrollable tab bar on mobile (no hamburger, UI_SPEC §2). */
export function TopNav() {
  return (
    <nav
      aria-label="Main"
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'block rounded-t-sm border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
