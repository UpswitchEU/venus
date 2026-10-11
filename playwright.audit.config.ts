import { defineConfig, devices } from '@playwright/test'

// Isolated browser gate: every API response is owned by the test fixture.
// Override local deployment settings so even unhandled server requests stay local.
const baseURL = 'http://127.0.0.1:3001'
// Use a normal unbound port: Firefox and WebKit reject reserved ports before
// Playwright can intercept the request, obscuring the actual application flow.
const unavailableBackendURL = 'http://127.0.0.1:39799'
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['manual-company-without-registry.spec.ts'],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/audit' }]],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_BACKEND_URL: unavailableBackendURL,
      NEXT_PUBLIC_API_BASE_URL: unavailableBackendURL,
      NEXT_PUBLIC_API_URL: unavailableBackendURL,
      BACKEND_URL: unavailableBackendURL,
      TITAN_API_URL: unavailableBackendURL,
      NEXT_PUBLIC_MERCURY_URL: baseURL,
      NEXT_PUBLIC_CREDIT_API_URL: `${unavailableBackendURL}/api/credits`,
      NEXT_PUBLIC_PYTHON_ENGINE_URL: unavailableBackendURL,
      NEXT_PUBLIC_VALUATION_ENGINE_URL: unavailableBackendURL,
      NEXT_PUBLIC_POSTHOG_KEY: '',
      NEXT_PUBLIC_POSTHOG_HOST: baseURL,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
