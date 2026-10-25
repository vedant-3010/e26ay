import { createBrowserRouter, type RouteObject } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { AccuracyLabPage } from '@/pages/AccuracyLab'
import { DecisionDeskPage } from '@/pages/DecisionDesk'
import { MethodologyPage } from '@/pages/Methodology'
import { MonitorPage } from '@/pages/Monitor'
import { NotFoundPage } from '@/pages/NotFound'

/** Top-level pages. Keep in sync with `NAV_ITEMS` in components/layout/TopNav.tsx. */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DecisionDeskPage /> },
      { path: 'monitor', element: <MonitorPage /> },
      { path: 'accuracy', element: <AccuracyLabPage /> },
      { path: 'methodology', element: <MethodologyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
