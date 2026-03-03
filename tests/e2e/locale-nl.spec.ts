/**
 * E2E Tests: Dutch Locale Display (Mercury → Venus persistence)
 *
 * Verifies that Venus correctly displays Dutch when:
 * - Navigating directly to /nl/ paths
 * - Redirecting from /reports/:id?locale=nl&source=mercury
 *
 * @module e2e/locale-nl
 */

import { expect, test } from '@playwright/test'

test.describe('Dutch Locale Display', () => {
  test('should display Dutch when navigating to /nl/reports/new', async ({ page }) => {
    await page.goto('/nl/reports/new')
    await page.waitForLoadState('domcontentloaded')

    // html lang must be nl (set by LocaleHtmlSync)
    const htmlLang = await page.locator('html').getAttribute('lang')
    expect(htmlLang).toBe('nl')

    // Page title should contain Dutch text (from layout generateMetadata)
    const title = await page.title()
    expect(title).toContain('Indicatieve bedrijfsschatting')
    expect(title).not.toContain('Indicative business estimate')
  })

  test('should display Dutch when navigating to /nl/ (redirects to reports/new)', async ({
    page,
  }) => {
    await page.goto('/nl')
    await page.waitForLoadState('domcontentloaded')

    // Should redirect to /nl/reports/new
    await expect(page).toHaveURL(/\/nl\/reports\/new/)

    const htmlLang = await page.locator('html').getAttribute('lang')
    expect(htmlLang).toBe('nl')

    const title = await page.title()
    expect(title).toContain('Indicatieve bedrijfsschatting')
  })

  test('should display English when navigating to /en/reports/new', async ({ page }) => {
    await page.goto('/en/reports/new')
    await page.waitForLoadState('domcontentloaded')

    const htmlLang = await page.locator('html').getAttribute('lang')
    expect(htmlLang).toBe('en')

    const title = await page.title()
    expect(title).toContain('Indicative business estimate')
    expect(title).not.toContain('Indicatieve bedrijfsschatting')
  })

  test('should redirect /reports/new?locale=nl to /nl/reports/new and show Dutch', async ({
    page,
  }) => {
    await page.goto('/reports/new?locale=nl&source=mercury')
    await page.waitForLoadState('domcontentloaded')

    // Middleware should redirect to path with locale
    await expect(page).toHaveURL(/\/nl\/reports\/new/)

    const htmlLang = await page.locator('html').getAttribute('lang')
    expect(htmlLang).toBe('nl')

    const title = await page.title()
    expect(title).toContain('Indicatieve bedrijfsschatting')
  })
})
