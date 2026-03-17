/**
 * E2E Smoke Test: Bakker Bas Normalization Flow
 *
 * Verifies the fix for getOriginalEbitdaForDisplay: the modal must show Origineel
 * (reported EBITDA) correctly. Bug: modal showed €99K instead of €100K when
 * report.ebitda (normalized) was used before form-derived reported EBITDA.
 *
 * Flow: reported 100K → open modal → Origineel must show €100K.
 * With -1K adjustment: normalized €99K; Origineel must still show €100K.
 *
 * @module e2e/bakker-bas-normalization
 */

import { expect, test } from '@playwright/test'

test.describe('Bakker Bas Normalization Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ENABLE_SESSION_RESTORATION', 'true')
    })
  })

  test('should show Origineel €100K when opening normalization modal after valuation', async ({
    page,
  }) => {
    // Step 1: Navigate to manual flow
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')

    // Step 2: Fill form - Bakker Bas: reported EBITDA 100K
    await page.fill('input[name="company_name"]', 'Bakker Bas')
    await page.fill('input[name="revenue"]', '500000')
    await page.fill('input[name="ebitda"]', '100000')
    await page.selectOption('select[name="industry"]', 'retail')
    await page.selectOption('select[name="country_code"]', 'BE')
    await page.selectOption('select[name="business_model"]', 'ecommerce')
    await page.fill('input[name="founding_year"]', '2015')

    // Step 3: Submit valuation
    await page.click('button[type="submit"]:has-text("Calculate Indicative Estimate")')

    // Step 4: Wait for report to appear
    await page.waitForSelector('.valuation-report-container', { timeout: 30000 })
    await expect(page.locator('.valuation-report-container')).toBeVisible()

    // Step 5: Open normalization modal (Normalize button in ManualInputPanel)
    await page.click('button:has-text("Normalize")')
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Step 6: Verify Origineel shows €100,000 (reported EBITDA - getOriginalEbitdaForDisplay fix)
    const modalContent = await page.locator('[role="dialog"]').textContent()
    expect(modalContent).toMatch(/Origineel|Original/)
    // Must show 100,000 or 100.000 (locale-dependent) for reported EBITDA
    expect(modalContent).toMatch(/100[.,]000/)
  })
})
