import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { accuracyData, fetchRoutes, META } from '@/test/fixtures'

import { MethodologyPage } from '.'

function renderPage() {
  vi.stubGlobal('fetch', fetchRoutes({ '/api/meta': META, '/api/accuracy': accuracyData() }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/', element: <MethodologyPage /> }])
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Methodology', () => {
  it('has every section, reachable from the contents list', async () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(9)
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1)
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('draws the selection timeline with a text alternative', () => {
    renderPage()
    expect(
      screen.getByRole('img', { name: /How the decision forecast is selected/ }),
    ).toBeInTheDocument()
  })

  it('renders the data-quality table from /api/meta', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('runs_per_day')).toBeInTheDocument()
    expect(within(table).getByText('8 runs on every one of 34 publish days')).toBeInTheDocument()
    expect(screen.getByText(/272 forecast runs/)).toBeInTheDocument()
  })

  it('states the findings with live numbers', async () => {
    renderPage()
    expect(await screen.findByText('+1,746 MW')).toBeInTheDocument()
    expect(screen.getByText(/already \+1,455 MW high half an hour ahead/)).toBeInTheDocument()
    expect(screen.getByText(/Thu 15 Jan 12:25/)).toBeInTheDocument()
  })
})
