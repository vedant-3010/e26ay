import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
/** A deployed app to test instead of a local server, e.g. the Vercel URL (`make test-e2e-prod`). */
const REMOTE = process.env.E2E_BASE_URL

/**
 * End-to-end smoke tests against the production app: FastAPI serving the built SPA from
 * `frontend/dist` (ADR-0002), exactly as in Docker. Run `npm run build` first (`make test-e2e`
 * does both). Two projects: desktop, and a 375 px phone for the overflow checks.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // A parallel run against a deployment can wake several cold function instances at once;
  // cold-start time is measured separately, not by these assertions.
  expect: { timeout: REMOTE ? 15_000 : 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: REMOTE ?? `http://127.0.0.1:${PORT}` },
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
  webServer: REMOTE
    ? undefined
    : {
        command: `uv run uvicorn winddesk.main:app --app-dir backend --port ${PORT} --log-level warning`,
        cwd: '..', // app.frontend() resolves frontend/dist from the repo root
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
