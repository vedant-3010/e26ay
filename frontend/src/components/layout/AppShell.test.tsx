import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { routes } from '@/router'
import { fetchRoutes, HEALTH, META } from '@/test/fixtures'

function renderAt(path: string, fetchImpl: (input: RequestInfo | URL) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const healthy = (input: RequestInfo | URL) =>
  fetchRoutes({ '/api/health': HEALTH, '/api/meta': META })(input)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppShell', () => {
  it('renders the four tabs with the current page marked', async () => {
    renderAt('/', healthy)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      'Decision Desk',
      'Monitor',
      'Accuracy Lab',
      'Methodology',
    ])
    expect(within(nav).getByRole('link', { name: 'Decision Desk' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await screen.findByRole('heading', { name: 'Decision Desk' })).toBeInTheDocument()
  })

  it('shows version, short SHA and snapshot from /api/health', async () => {
    renderAt('/', healthy)
    expect(await screen.findByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('a1b2c3')).toBeInTheDocument()
  })

  it('says so when the API is unreachable', async () => {
    renderAt('/', () => Promise.reject(new TypeError('network down')))
    expect(await screen.findByText('API unavailable')).toBeInTheDocument()
    expect(screen.getByText(/snapshot pending/)).toBeInTheDocument()
  })

  it('supports deep links and tab navigation', async () => {
    const router = renderAt('/monitor', healthy)
    expect(await screen.findByRole('heading', { name: 'Forecast Monitor' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Accuracy Lab' }))
    expect(router.state.location.pathname).toBe('/accuracy')
    expect(await screen.findByRole('heading', { name: 'Accuracy Lab' })).toBeInTheDocument()
  })

  it('renders a not-found page for unknown paths', () => {
    renderAt('/nope', healthy)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
