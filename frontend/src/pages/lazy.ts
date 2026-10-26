import { lazy } from 'react'

// Pages load on demand: ECharts ships only with the chart pages, not with the app shell.
export const HomePage = lazy(() => import('./Home').then((m) => ({ default: m.HomePage })))
export const DecisionDeskPage = lazy(() =>
  import('./DecisionDesk').then((m) => ({ default: m.DecisionDeskPage })),
)
export const MonitorPage = lazy(() => import('./Monitor').then((m) => ({ default: m.MonitorPage })))
export const AccuracyLabPage = lazy(() =>
  import('./AccuracyLab').then((m) => ({ default: m.AccuracyLabPage })),
)
export const LivePage = lazy(() => import('./Live').then((m) => ({ default: m.LivePage })))
export const MethodologyPage = lazy(() =>
  import('./Methodology').then((m) => ({ default: m.MethodologyPage })),
)
