/**
 * Startup valuation — URL contract for Venus manual flow.
 *
 * Asserts the pre-selected method deep-link lands on the locale-scoped reports
 * shell (same routing contract as `usePreSelectedMethodSessionSync`). When the
 * dev server is healthy, `html[lang]` and layout titles match
 * `locale-nl.spec.ts`. Payload parity is covered by Vitest
 * (`buildManualValuationRequest.test.ts`) and Titan `ValuationRequestSchema`.
 *
 * Manual QA (three personas — run against staging or production preview):
 * - PLG business owner: narrow method nav includes startup_valuation; submit → report.
 * - Standalone advisor (`accountant` role): advisor startup panel; submit → report.
 * - Accountant-for-client: same with client context; credits bill to advisor.
 */

import { expect, test } from '@playwright/test'

test.describe('Startup valuation (pre-select URL)', () => {
  test('en /reports/new?selected_method=startup_valuation stays on reports shell', async ({
    page,
  }) => {
    const response = await page.goto('/en/reports/new?selected_method=startup_valuation', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    })
    expect(response?.status() ?? 0).toBeLessThan(400)
    await expect(page).toHaveURL(/\/en\/reports\/new/)
    const lang = await page.locator('html').getAttribute('lang')
    if (lang != null) {
      expect(lang).toBe('en')
    }
  })

  test('nl /reports/new?selected_method=startup_valuation stays on reports shell', async ({
    page,
  }) => {
    const response = await page.goto('/nl/reports/new?selected_method=startup_valuation', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    })
    expect(response?.status() ?? 0).toBeLessThan(400)
    await expect(page).toHaveURL(/\/nl\/reports\/new/)
    const lang = await page.locator('html').getAttribute('lang')
    if (lang != null) {
      expect(lang).toBe('nl')
    }
  })
})
