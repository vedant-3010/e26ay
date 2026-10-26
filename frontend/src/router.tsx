import { createBrowserRouter, type RouteObject } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import {
  AccuracyLabPage,
  DecisionDeskPage,
  LivePage,
  MethodologyPage,
  MonitorPage,
} from '@/pages/lazy'
import { NotFoundPage } from '@/pages/NotFound'
import { RouteError } from '@/pages/RouteError'

/** Top-level pages. Keep in sync with `NAV_ITEMS` in components/layout/TopNav.tsx. */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DecisionDeskPage />, errorElement: <RouteError /> },
      { path: 'monitor', element: <MonitorPage />, errorElement: <RouteError /> },
      { path: 'accuracy', element: <AccuracyLabPage />, errorElement: <RouteError /> },
      { path: 'methodology', element: <MethodologyPage />, errorElement: <RouteError /> },
      // Could-have (PRD F8): the page explains itself when the server has live mode off.
      { path: 'live', element: <LivePage />, errorElement: <RouteError /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
