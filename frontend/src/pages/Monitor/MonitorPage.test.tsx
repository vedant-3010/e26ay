import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import type * as Csv from '@/lib/csv'
import { fetchRoutes, HEALTH, META, monitorData, readoutValue } from '@/test/fixtures'

import { MonitorPage } from '.'

// ECharts needs a canvas, which jsdom lacks; the chart's option builder is tested separately.
vi.mock('@/components/charts/MonitorChart', () => ({
  MonitorChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}))

const download = vi.fn()
vi.mock('@/lib/csv', async (original) => ({
  ...(await original<typeof Csv>()),
  downloadCsv: (...args: unknown[]) => download(...args),
}))

let fetchMock: ReturnType<typeof fetchRoutes>

function renderAt(path: string) {
  fetchMock = fetchRoutes({
    '/api/health': HEALTH,
    '/api/meta': META,
    '/api/monitor': (url: URL) =>
      monitorData({
        params: {
          start: url.searchParams.get('start')!,
          end: url.searchParams.get('end')!,
          horizon_h: Number(url.searchParams.get('horizon_h')),
        },
      }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/monitor', element: <MonitorPage /> }], {
    initialEntries: [path],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function monitorRequests(): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
    .filter((u) => u.pathname === '/api/monitor')
}

afterEach(() => {
  download.mockReset()
})

describe('Monitor page', () => {
  it('uses the defaults from /api/meta and shows the metrics strip', async () => {
    renderAt('/monitor')
    await screen.findByRole('region', { name: 'Accuracy for this window' })
    expect(readoutValue('MAE')).toBe('1,500 MW')
    const req = monitorRequests()[0]!
    expect(req.searchParams.get('start')).toBe('2026-01-02T00:00:00Z')
    expect(req.searchParams.get('end')).toBe('2026-01-09T00:00:00Z')
    expect(req.searchParams.get('horizon_h')).toBe('24')
    for (const label of ['MAE', 'RMSE', 'Bias', 'P90 |error|', 'P90 shortfall', 'WAPE']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(readoutValue('Bias')).toBe('+500 MW') // bias keeps its sign
    expect(readoutValue('WAPE')).toBe('15.0%')
    expect(
      screen.getByRole('img', { name: /Actual and forecast national wind/ }),
    ).toBeInTheDocument()
  })

  it('explains coverage below 100%', async () => {
    renderAt('/monitor')
    expect(await screen.findByText('Forecast available for 66.7% of hours')).toBeInTheDocument()
    expect(
      screen.getByText(/1 of 3 hours have no forecast published at least 24 h ahead/),
    ).toBeInTheDocument()
  })

  it('reads the view from the URL', async () => {
    renderAt('/monitor?start=2026-01-10T00:00:00Z&end=2026-01-12T00:00:00Z&horizon=36.5')
    await screen.findByRole('region', { name: 'Accuracy for this window' })
    const req = monitorRequests()[0]!
    expect(req.searchParams.get('start')).toBe('2026-01-10T00:00:00Z')
    expect(req.searchParams.get('horizon_h')).toBe('36.5')
    expect(screen.getByText('36.5 h ahead')).toBeInTheDocument()
  })

  it('presets write the window into the URL', async () => {
    const router = renderAt('/monitor')
    await screen.findByRole('region', { name: 'Accuracy for this window' })
    await userEvent.click(screen.getByRole('button', { name: 'Full month' }))
    await waitFor(() =>
      expect(router.state.location.search).toBe(
        '?start=2026-01-01T00%3A00%3A00Z&end=2026-02-02T00%3A00%3A00Z',
      ),
    )
    await waitFor(() =>
      expect(monitorRequests().at(-1)!.searchParams.get('end')).toBe('2026-02-02T00:00:00Z'),
    )
    expect(screen.getByRole('button', { name: 'Full month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('blocks an invalid window without calling the API', async () => {
    renderAt('/monitor?start=2026-01-09T00:00:00Z&end=2026-01-05T00:00:00Z')
    expect(await screen.findByRole('alert')).toHaveTextContent('The end must be after the start.')
    expect(monitorRequests()).toHaveLength(0)
  })

  it('downloads the chart data as CSV', async () => {
    renderAt('/monitor')
    await screen.findByRole('region', { name: 'Accuracy for this window' })
    await userEvent.click(screen.getByRole('button', { name: /CSV/ }))
    expect(download).toHaveBeenCalledOnce()
    const [filename, csv] = download.mock.calls[0] as [string, string]
    expect(filename).toBe('winddesk-monitor_2026-01-02_2026-01-09_H24h.csv')
    expect(csv.startsWith('target_time_utc,')).toBe(true)
  })

  it('shows the error envelope message with a retry', async () => {
    fetchMock = fetchRoutes({ '/api/meta': META })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter([{ path: '/monitor', element: <MonitorPage /> }], {
      initialEntries: ['/monitor'],
    })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('No route /api/monitor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
