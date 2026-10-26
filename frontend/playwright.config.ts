import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * End-to-end smoke tests against the production app: FastAPI serving the built SPA from
 * `frontend/dist` (ADR-0002), exactly as in Docker. Run `npm run build` first (`make test-e2e`
 * does both). Two projects: desktop, and a 375 px phone for the overflow checks.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `uv run uvicorn winddesk.main:app --app-dir backend --port ${PORT} --log-level warning`,
    cwd: '..', // app.frontend() resolves frontend/dist from the repo root
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
