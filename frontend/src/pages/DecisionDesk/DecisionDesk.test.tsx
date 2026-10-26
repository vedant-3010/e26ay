import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { decisionData, fetchRoutes, META, readoutValue } from '@/test/fixtures'

import { decisionCsv } from './exportCsv'

import { DecisionDeskPage } from '.'

vi.mock('@/components/charts/DecisionCharts', () => ({
  DecisionChart: ({ hindsight }: { hindsight: boolean }) => (
    <div role="img" aria-label={`decision chart ${hindsight ? 'hindsight' : 'trader'}`} />
  ),
  VintagesChart: () => <div role="img" aria-label="vintages chart" />,
}))

let fetchMock: ReturnType<typeof fetchRoutes>

function renderAt(path: string, data = decisionData()) {
  fetchMock = fetchRoutes({ '/api/meta': META, '/api/decision': () => data })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/', element: <DecisionDeskPage /> }], {
    initialEntries: [path],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function lastDecisionQuery(): URLSearchParams {
  const urls = fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
    .filter((u) => u.pathname === '/api/decision')
  return urls.at(-1)!.searchParams
}

const kpiLabels = () =>
  within(screen.getByRole('region', { name: 'Key figures' }))
    .getAllByRole('term')
    .map((el) => el.textContent)

describe('Decision Desk', () => {
  it('defaults to the meta defaults and the Hindsight view', async () => {
    renderAt('/')
    await screen.findByRole('region', { name: 'Decision context' })
    expect(Object.fromEntries(lastDecisionQuery())).toEqual({
      delivery_date: '2026-01-15',
      auction: 'epex',
      confidence: '0.9',
    })
    expect(screen.getByRole('radio', { name: 'Hindsight' })).toBeChecked()
    expect(screen.getByText('Thu 15 Jan 2026')).toBeInTheDocument()
  })

  it('shows the context strip: cutoff, run used and lead range', async () => {
    renderAt('/')
    const strip = await screen.findByRole('region', { name: 'Decision context' })
    expect(strip).toHaveTextContent('Run usedWed 14 Jan 07:30')
    expect(strip).toHaveTextContent('Gate closureWed 14 Jan 09:20EPEX SPOT GB Day-Ahead')
    expect(strip).toHaveTextContent('DeliveryThu 15 Jan16.5–18.5 h ahead')
  })

  it('Hindsight shows outcome KPIs; the Trader view hides them and the outcome text', async () => {
    renderAt('/')
    await screen.findByRole('region', { name: 'Decision context' })
    expect(kpiLabels()).toEqual([
      'Forecast energy',
      'Wind you can count on (90%)',
      'Actual energy',
      'Day MAE',
      'Largest shortfall',
      'Firm wind held',
    ])
    expect(readoutValue('Firm wind held')).toBe('2/3 h')
    expect(screen.getByText(/Wind delivered 35 GWh/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Trader view' }))
    expect(kpiLabels()).toEqual([
      'Forecast energy',
      'Wind you can count on (90%)',
      'Buffer held back (90%)',
    ])
    expect(screen.queryByText(/Wind delivered/)).not.toBeInTheDocument()
    expect(screen.getByText(/covered only 3 of 4 hours/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'decision chart trader' })).toBeInTheDocument()
  })

  it('explains partial coverage without substituting another run', async () => {
    renderAt('/')
    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('covers 3 of 4 hours of Thu 15 Jan')
    expect(banner).toHaveTextContent('never substituted')
  })

  it('supports the documented deep link', async () => {
    renderAt('/?date=2026-01-21&auction=n2ex&conf=0.9&view=hindsight')
    await screen.findByRole('region', { name: 'Decision context' })
    expect(Object.fromEntries(lastDecisionQuery())).toEqual({
      delivery_date: '2026-01-21',
      auction: 'n2ex',
      confidence: '0.9',
    })
    expect(screen.getByRole('radio', { name: 'N2EX 09:50' })).toBeChecked()
  })

  it('ignores out-of-range or invalid URL values', async () => {
    renderAt('/?date=2026-03-01&conf=0.5&auction=apx')
    await screen.findByRole('region', { name: 'Decision context' })
    expect(Object.fromEntries(lastDecisionQuery())).toEqual({
      delivery_date: '2026-01-15',
      auction: 'epex',
      confidence: '0.9',
    })
  })

  it('moves day by day with the buttons and the arrow keys, within bounds', async () => {
    const router = renderAt('/?date=2026-01-02')
    await screen.findByRole('region', { name: 'Decision context' })
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(router.state.location.search).toBe('?date=2026-01-03')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(router.state.location.search).toBe('?date=2026-01-04'))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(router.state.location.search).toBe('?date=2026-01-03'))
  })

  it('custom cutoff: sends HH:MM and blocks off-step times', async () => {
    const router = renderAt('/')
    await screen.findByRole('region', { name: 'Decision context' })
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    await waitFor(() => expect(router.state.location.search).toBe('?auction=custom&cutoff=10%3A00'))
    await waitFor(() => expect(lastDecisionQuery().get('cutoff')).toBe('10:00'))
    fireEvent.change(screen.getByLabelText('Custom cutoff time'), { target: { value: '10:07' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('15-minute steps')
  })

  it('confidence choice goes to the API', async () => {
    renderAt('/')
    await screen.findByRole('region', { name: 'Decision context' })
    await userEvent.click(screen.getByRole('radio', { name: '95%' }))
    await waitFor(() => expect(lastDecisionQuery().get('confidence')).toBe('0.95'))
  })
})

describe('decisionCsv', () => {
  it('exports hours with firm wind; actuals only in Hindsight', () => {
    const trader = decisionCsv(decisionData(), false).split('\r\n')
    expect(trader[0]).toBe(
      'target_time_utc,target_time_uk,forecast_mw,firm_mw_p90,lead_h,run_publish_time_utc',
    )
    expect(trader[4]).toBe('2026-01-15T03:00:00Z,Thu 15 Jan 03:00,,,,2026-01-14T07:30:00Z')
    const hindsight = decisionCsv(decisionData(), true).split('\r\n')
    expect(hindsight[0]).toMatch(/,actual_mw$/)
    expect(hindsight[2]).toMatch(/,7000$/)
  })
})
