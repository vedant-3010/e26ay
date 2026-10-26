import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Smoke tests on the real snapshot: each page loads, one control changes the view, and
 * the charts actually draw. Every page is also checked for console errors and, on the phone
 * project, for horizontal overflow at 375 px.
 */

/** ECharts draws into a canvas: wait until a meaningful share of it is painted. */
async function expectChartDrawn(panel: Locator) {
  const canvas = panel.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await expect
    .poll(() =>
      canvas.evaluate((el: HTMLCanvasElement) => {
        const ctx = el.getContext('2d')
        if (!ctx) return 0
        const { data } = ctx.getImageData(0, 0, el.width, el.height)
        let painted = 0
        for (let i = 3; i < data.length; i += 4 * 16) if ((data[i] ?? 0) > 0) painted++
        return painted
      }),
    )
    .toBeGreaterThan(500)
}

function region(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true })
}

const consoleErrors = new WeakMap<Page, string[]>()

test.beforeEach(({ page }) => {
  const errors: string[] = []
  consoleErrors.set(page, errors)
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
})

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page)).toEqual([])
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(innerWidth)
})

test('Home: the answer, Fig. 1 and the month in figures', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('WindDesk · Day-ahead wind, as the desk saw it')
  await expect(
    page.getByRole('heading', { name: 'How much wind can the desk bank on at 09:20?' }),
  ).toBeVisible()
  await expect(page.getByText(/the answer was 9,523 MW on an average hour/)).toBeVisible()
  await expectChartDrawn(page.locator('figure'))
  await expect(page.locator('figure figcaption')).toContainText('Firm wind held in 23 of 24 hours')
  await expect(region(page, 'January, judged at the 09:20 gate closure')).toContainText('2,023 MW')

  await page.getByRole('link', { name: 'Open the Decision Desk' }).click()
  await expect(page).toHaveURL(/\/desk$/)
  await expect(page).toHaveTitle('Decision Desk · WindDesk')
})

test('Decision Desk: story day, confidence switch, what-if', async ({ page }) => {
  await page.goto('/desk?date=2026-01-27')
  await expect(page).toHaveTitle('Decision Desk · WindDesk')
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(
    'expected 477 GWh of wind for Tue 27 Jan',
  )
  await expectChartDrawn(region(page, 'Wind for Tue 27 Jan'))
  await expectChartDrawn(region(page, 'How the forecast evolved'))

  await page.getByRole('radio', { name: '95%' }).click()
  await expect(page).toHaveURL(/conf=0\.95/)
  await expect(
    page.getByRole('term').filter({ hasText: 'Wind you can count on (95%)' }),
  ).toBeVisible()
  await expectChartDrawn(region(page, 'Wind for Tue 27 Jan'))

  const whatIf = region(page, 'Procurement what-if')
  await whatIf.getByRole('spinbutton', { name: /Your share of national wind/ }).fill('0')
  // With no wind share the whole 3,000 MW × 24 h is bought either way.
  await expect(whatIf.getByRole('definition').filter({ hasText: /^72,000 MWh$/ })).toHaveCount(3)
  await expectChartDrawn(whatIf)
})

test('Monitor: horizon chart and a two-week window', async ({ page }) => {
  await page.goto('/monitor')
  await expect(page).toHaveTitle('Forecast Monitor · WindDesk')
  const readout = region(page, 'Accuracy for this window')
  await expect(readout).toContainText('168')
  await expectChartDrawn(region(page, 'Actual vs forecast'))

  await page.getByRole('button', { name: '2 weeks' }).click()
  await expect(page).toHaveURL(/end=/)
  await expect(readout).toContainText('336')
  await expectChartDrawn(region(page, 'Actual vs forecast'))
})

test('Accuracy Lab: EPEX to N2EX', async ({ page }) => {
  await page.goto('/accuracy')
  await expect(page).toHaveTitle('Accuracy Lab · WindDesk')
  const headline = region(page, 'Headline accuracy')
  await expect(headline).toContainText('2,023 MW')
  await expectChartDrawn(region(page, 'A · Error by lead time'))
  await expectChartDrawn(region(page, 'B · Error distribution'))

  await page.getByRole('radio', { name: 'N2EX 09:50' }).click()
  await expect(page).toHaveURL(/auction=n2ex/)
  await expect(headline).toContainText('1,996 MW')
  await expectChartDrawn(region(page, 'C · Buffer by wind level'))
})

test('Methodology: timeline graphic and data-quality table', async ({ page }) => {
  await page.goto('/methodology')
  await expect(page).toHaveTitle('Methodology · WindDesk')
  await expect(
    page.getByRole('img', { name: 'How the decision forecast is selected' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Data quality' })).toBeVisible()
  await expect(page.getByRole('table').first()).toBeVisible()
})

test('Deep links and unknown paths', async ({ page }) => {
  const api404 = await page.request.get('/api/nope')
  expect(api404.status()).toBe(404)
  expect((await api404.json()).error.code).toBe('not_found')

  // Desk links from before the home page existed still open the Desk.
  await page.goto('/?date=2026-01-27&view=trader')
  await expect(page).toHaveURL(/\/desk\?date=2026-01-27&view=trader$/)
  await expect(page).toHaveTitle('Decision Desk · WindDesk')

  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  // Live mode (F8) is off unless WINDDESK_ENABLE_LIVE=true: the page says so, the API is a 404.
  expect((await page.request.get('/api/live')).status()).toBe(404)
  await page.goto('/live')
  await expect(page.getByText(/Live mode is switched off on this server/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Live' })).toHaveCount(0)
})
