import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { accuracyData, fetchRoutes, META, readoutValue } from '@/test/fixtures'

import { AccuracyLabPage } from '.'

vi.mock('@/components/charts/AccuracyCharts', () => ({
  LeadCurveChart: () => <div role="img" aria-label="lead curve" />,
  DistributionChart: () => <div role="img" aria-label="distribution" />,
  LevelChart: () => <div role="img" aria-label="level" />,
  ByHourChart: () => <div role="img" aria-label="by hour" />,
  DailyChart: ({ onSelectDay }: { onSelectDay: (d: string) => void }) => (
    <button type="button" onClick={() => onSelectDay('2026-01-28')}>
      daily chart
    </button>
  ),
}))

let fetchMock: ReturnType<typeof fetchRoutes>

function renderAt(path: string, data = accuracyData()) {
  fetchMock = fetchRoutes({ '/api/meta': META, '/api/accuracy': () => data })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/accuracy', element: <AccuracyLabPage /> },
      { path: '/', element: <p>desk</p> },
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

function lastQuery(): Record<string, string> {
  const urls = fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
    .filter((u) => u.pathname === '/api/accuracy')
  return Object.fromEntries(urls.at(-1)!.searchParams)
}

describe('Accuracy Lab', () => {
  it('defaults to EPEX decision forecasts over the full pilot', async () => {
    renderAt('/accuracy')
    await screen.findByRole('region', { name: 'Key takeaways' })
    expect(lastQuery()).toEqual({
      population: 'decision',
      auction: 'epex',
      horizon_h: '24',
      start: '2026-01-02',
      end: '2026-02-01',
      confidence: '0.9',
    })
    expect(
      within(screen.getByRole('region', { name: 'Key takeaways' })).getAllByRole('listitem'),
    ).toHaveLength(3)
    expect(readoutValue('MAE')).toBe('2,022 MW')
    expect(readoutValue('Bias')).toBe('+1,746 MW')
    expect(readoutValue('Hours compared')).toBe('744')
  })

  it('shows every Should section for decision forecasts', async () => {
    renderAt('/accuracy')
    await screen.findByRole('region', { name: 'Key takeaways' })
    for (const name of ['Value of the forecast', 'Auction timing', 'Worst hours']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('+4,143')).toBeInTheDocument()
    const level = screen.getByRole('region', { name: 'C · Buffer by wind level' })
    expect(within(level).getByText(/of hours \(target 90%\)/)).toHaveTextContent(
      'Firm wind held 87.0% of hours (target 90%)',
    )
  })

  it('fixed horizon: shows the slider and hides decision-only sections', async () => {
    const horizon = accuracyData({
      params: { ...accuracyData().params, population: 'horizon', horizon_h: 36 },
      calibration: null,
      forecast_value: null,
    })
    renderAt('/accuracy?population=horizon&horizon=36', horizon)
    await screen.findByRole('region', { name: 'Key takeaways' })
    expect(lastQuery()).toMatchObject({ population: 'horizon', horizon_h: '36' })
    expect(screen.getByRole('slider', { name: 'Forecast horizon' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Value of the forecast' })).not.toBeInTheDocument()
  })

  it('switching to N2EX writes the URL and refetches', async () => {
    const router = renderAt('/accuracy')
    await screen.findByRole('region', { name: 'Key takeaways' })
    await userEvent.click(screen.getByRole('radio', { name: 'N2EX 09:50' }))
    await waitFor(() => expect(router.state.location.search).toBe('?auction=n2ex'))
    await waitFor(() => expect(lastQuery().auction).toBe('n2ex'))
  })

  it('a reversed range is blocked before calling the API', async () => {
    renderAt('/accuracy?start=2026-01-20&end=2026-01-10')
    expect(await screen.findByRole('alert')).toHaveTextContent('must not be before the first')
    expect(
      fetchMock.mock.calls.some(([i]) =>
        String(i instanceof Request ? i.url : i).includes('/api/accuracy'),
      ),
    ).toBe(false)
  })

  it('daily chart and worst-hours rows open the day in the Decision Desk', async () => {
    const router = renderAt('/accuracy')
    await screen.findByRole('region', { name: 'Worst hours' })
    await userEvent.click(screen.getByRole('button', { name: 'daily chart' }))
    expect(router.state.location.pathname + router.state.location.search).toBe('/?date=2026-01-28')
  })

  it('worst-hours rows link to the right day', async () => {
    renderAt(
      '/accuracy?auction=n2ex',
      accuracyData({ params: { ...accuracyData().params, auction: 'n2ex' } }),
    )
    const table = await screen.findByRole('region', { name: 'Worst hours' })
    expect(within(table).getByRole('link', { name: 'Mon 12 Jan 01:00' })).toHaveAttribute(
      'href',
      '/?date=2026-01-12&auction=n2ex',
    )
    expect(within(table).getByText('+6,894 MW')).toBeInTheDocument()
    fireEvent.click(within(table).getByText('20,942 MW'))
  })
})

describe('accuracy CSVs', () => {
  it('every chart exports its data', async () => {
    const { accuracyCsv } = await import('./exportCsv')
    const d = accuracyData()
    expect(accuracyCsv.leadCurve(d).build().split('\r\n')[1]).toBe(
      '0.5,248,1669,2000,1455,1500,3430,6000',
    )
    expect(accuracyCsv.distribution(d).build().split('\r\n')[1]).toBe('-500,-250,2')
    expect(accuracyCsv.level(d).filename).toBe(
      'winddesk-accuracy-buffer-by-level_epex_2026-01-02_2026-02-01.csv',
    )
    expect(accuracyCsv.daily(d).build()).toContain('2026-01-28,5329,5329,6210')
    expect(accuracyCsv.byHour(d).build()).toContain('0,31,1950,1900,4000')
  })
})
