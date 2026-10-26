import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { accuracyData, decisionData, fetchRoutes, META } from '@/test/fixtures'

import { HomePage } from '.'

vi.mock('@/components/charts/DecisionCharts', () => ({
  DecisionChart: ({ hindsight }: { hindsight: boolean }) => (
    <div role="img" aria-label={`decision chart ${hindsight ? 'hindsight' : 'trader'}`} />
  ),
}))

let fetchMock: ReturnType<typeof fetchRoutes>

function renderAt(path: string, routes: Record<string, unknown> = {}) {
  fetchMock = fetchRoutes({
    '/api/meta': META,
    '/api/accuracy': accuracyData(),
    '/api/decision': decisionData(),
    ...routes,
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/desk', element: <p>desk</p> },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function requested(pathname: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
    .filter((u) => u.pathname === pathname)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Home', () => {
  it('answers the question with the value of the forecast', async () => {
    renderAt('/')
    expect(
      screen.getByRole('heading', { name: 'How much wind can the desk bank on at 09:20?' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/At 90% confidence the answer was/, { exact: false }),
    ).toHaveTextContent(
      'At 90% confidence the answer was 9,523 MW on an average hour: 4,143 MW more than the desk could count on with no forecast at all.',
    )
    expect(document.title).toBe('WindDesk · Day-ahead wind, as the desk saw it')
  })

  it('shows the month as a fact sheet from the Accuracy Lab defaults', async () => {
    renderAt('/')
    const month = await screen.findByRole('region', {
      name: 'January, judged at the 09:20 gate closure',
    })
    expect(await within(month).findByText('2,022')).toBeInTheDocument()
    expect(within(month).getByText('+1,746')).toBeInTheDocument()
    expect(month).toHaveTextContent('87.0%')
    expect(month).toHaveTextContent(
      '744 hours across 31 delivery days, each compared with the run the desk had at gate closure the day before, 16.5–39.5 h ahead.',
    )
    expect(month).toHaveTextContent('The forecast runs high, so the desk is short more often')
    const query = Object.fromEntries(requested('/api/accuracy')[0]!.searchParams)
    expect(query).toEqual({
      population: 'decision',
      auction: 'epex',
      horizon_h: '24',
      start: META.bounds.delivery_from,
      end: META.bounds.delivery_to,
      confidence: '0.9',
    })
  })

  it('draws Fig. 1 from the featured day, captioned with the server summary', async () => {
    renderAt('/')
    expect(await screen.findByRole('img', { name: 'decision chart hindsight' })).toBeInTheDocument()
    expect(screen.getByText(/Wind delivered 35 GWh/)).toBeInTheDocument()
    expect(Object.fromEntries(requested('/api/decision')[0]!.searchParams)).toEqual({
      delivery_date: '2026-01-27',
      auction: 'epex',
      confidence: '0.9',
    })
    expect(
      screen.getByRole('link', { name: 'Open this day in the Decision Desk' }),
    ).toHaveAttribute('href', '/desk?date=2026-01-27')
  })

  it('links to every view', () => {
    renderAt('/')
    const views = screen.getByRole('region', { name: 'Where to look' })
    expect(
      within(views)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/desk', '/accuracy', '/monitor', '/methodology'])
  })

  it('forwards Desk links from before the home page existed', () => {
    const router = renderAt('/?date=2026-01-27&view=trader')
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/desk?date=2026-01-27&view=trader',
    )
    expect(screen.getByText('desk')).toBeInTheDocument()
  })

  it('keeps the page usable when the accuracy request fails', async () => {
    renderAt('/', { '/api/accuracy': undefined })
    const month = await screen.findByRole('region', {
      name: 'January, judged at the 09:20 gate closure',
    })
    expect(await within(month).findByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the Decision Desk' })).toBeInTheDocument()
  })
})
