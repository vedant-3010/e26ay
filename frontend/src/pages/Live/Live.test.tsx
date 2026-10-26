import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { routes } from '@/router'
import { fetchRoutes, HEALTH, liveData, META } from '@/test/fixtures'

vi.mock('@/components/charts/DecisionCharts', () => ({
  DecisionChart: ({ hindsight }: { hindsight: boolean }) => (
    <div role="img" aria-label={`decision chart ${hindsight ? 'hindsight' : 'trader'}`} />
  ),
  VintagesChart: () => <div role="img" aria-label="vintages chart" />,
  WhatIfChart: () => <div role="img" aria-label="what-if chart" />,
}))

let fetchMock: ReturnType<typeof fetchRoutes>

function renderAt(path: string, liveEnabled: boolean) {
  fetchMock = fetchRoutes({
    '/api/health': HEALTH,
    '/api/meta': { ...META, live_enabled: liveEnabled },
    '/api/live': () => liveData(),
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const liveCalls = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
    .filter((u) => u.pathname === '/api/live')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Live page', () => {
  it('explains that live mode is off, without calling /api/live, when the flag is off', async () => {
    renderAt('/live', false)
    expect(await screen.findByText(/Live mode is switched off on this server/)).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByRole('link', { name: 'Live' })).toBeNull()
    expect(liveCalls()).toHaveLength(0)
  })

  it('shows tomorrow in the Trader view, labelled as of the fetch', async () => {
    renderAt('/live', true)
    const strip = await screen.findByRole('region', { name: 'Decision context' })
    expect(strip).toHaveTextContent('As ofWed 14 Jan 10:00latest runs fetched from Elexon')
    expect(screen.getByText(/Fetched from Elexon at/)).toHaveTextContent(
      'Fetched from Elexon at 10:07, re-fetched every 10 minutes · buffers from snapshot ac22a4',
    )
    expect(screen.getByRole('img', { name: 'decision chart trader' })).toBeInTheDocument()
    // Nothing that depends on actuals: the day has not happened yet.
    expect(screen.queryByRole('term', { name: 'Actual energy' })).toBeNull()
    expect(screen.queryByText('Actual energy')).toBeNull()
    expect(
      screen.getByText(/The day has not happened yet, so there is no actual/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Switch to Hindsight/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Procurement what-if' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Live' })).toHaveAttribute('aria-current', 'page')
  })

  it('sends the confidence to the API and keeps it in the URL', async () => {
    const router = renderAt('/live', true)
    await screen.findByRole('region', { name: 'Decision context' })
    expect(liveCalls().at(-1)?.searchParams.get('confidence')).toBe('0.9')
    await userEvent.click(screen.getByRole('radio', { name: '95%' }))
    await waitFor(() => expect(router.state.location.search).toBe('?conf=0.95'))
    await waitFor(() => expect(liveCalls().at(-1)?.searchParams.get('confidence')).toBe('0.95'))
  })
})
