import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Cross-Browser Auth Testing (Valuation Subdomain)
 * Tests auth flows across Chromium, Firefox, WebKit (Safari), and mobile browsers
 * Focus: Cross-subdomain authentication (upswitch.biz → valuation.upswitch.biz)
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Maximum time one test can run for */
  timeout: 60 * 1000,
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/test-results.json' }]
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3001',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },
  
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        locale: 'en-US',
        timezoneId: 'America/New_York',
      },
    },
    
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        locale: 'en-US',
        timezoneId: 'America/New_York',
      },
    },
    
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        locale: 'en-US',
        timezoneId: 'America/New_York',
      },
    },
    
    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        locale: 'en-US',
      },
    },
    
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 13'],
        locale: 'en-US',
      },
    },
  ],
  
  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'pnpm run dev',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
