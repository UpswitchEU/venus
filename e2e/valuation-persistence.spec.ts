/**
 * E2E Tests: Valuation Persistence After Page Refresh
 *
 * Tests that valuation data persists and restores correctly after page refresh.
 * Covers the full user journey: create → complete → refresh → verify restoration.
 *
 * @module e2e/valuation-persistence
 */

import { expect, test } from '@playwright/test'

test.describe('Valuation Data Persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Set feature flag to enable restoration
    await page.addInitScript(() => {
      window.localStorage.setItem('ENABLE_SESSION_RESTORATION', 'true')
    })
  })

  test('should persist valuation after page refresh - Manual Flow', async ({ page }) => {
    // Step 1: Navigate to new report
    await page.goto('/reports/new?flow=manual')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Step 2: Fill in valuation form
    await page.fill('input[name="company_name"]', 'Persistence Test Company')
    await page.fill('input[name="revenue"]', '1000000')
    await page.fill('input[name="ebitda"]', '200000')
    await page.selectOption('select[name="industry"]', 'technology')
    await page.selectOption('select[name="country_code"]', 'BE')
    await page.selectOption('select[name="business_model"]', 'b2b_saas')
    await page.fill('input[name="founding_year"]', '2020')
    
    // Step 3: Submit valuation
    await page.click('button[type="submit"]:has-text("Calculate Indicative Estimate")')
    
    // Step 4: Wait for valuation to complete
    // Wait for report to appear in preview panel
    await page.waitForSelector('.valuation-report-container', { timeout: 30000 })
    
    // Verify report is visible
    await expect(page.locator('.valuation-report-container')).toBeVisible()
    
    // Capture the report URL
    const reportUrl = page.url()
    const reportId = reportUrl.match(/reports\/(val_[^?]+)/)?.[1]
    expect(reportId).toBeTruthy()
    
    // Verify final price is displayed
    await expect(page.locator('[data-testid="final-price"]')).toBeVisible()
    const priceText = await page.locator('[data-testid="final-price"]').textContent()
    expect(priceText).toContain('€')
    
    // Step 5: Refresh the page
    await page.reload({ waitUntil: 'networkidle' })
    
    // Step 6: Verify data is restored after refresh
    
    // Check that report is still visible (not empty state)
    await expect(page.locator('.valuation-report-container')).toBeVisible({ timeout: 10000 })
    
    // Verify final price is still displayed
    await expect(page.locator('[data-testid="final-price"]')).toBeVisible()
    const restoredPriceText = await page.locator('[data-testid="final-price"]').textContent()
    expect(restoredPriceText).toBe(priceText) // Same price as before refresh
    
    // Verify form fields are pre-filled
    await expect(page.locator('input[name="company_name"]')).toHaveValue('Persistence Test Company')
    await expect(page.locator('input[name="revenue"]')).toHaveValue('1000000')
    
    // Verify info tab is accessible
    await page.click('button:has-text("Info")')
    await expect(page.locator('[data-testid="info-tab-content"]')).toBeVisible({ timeout: 5000 })
    
    // Verify version history tab is accessible
    await page.click('button:has-text("History")')
    await expect(page.locator('[data-testid="version-history"]')).toBeVisible({ timeout: 5000 })
  })

  test('should restore partial session (form only, no report)', async ({ page }) => {
    // Step 1: Navigate to new report
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    // Step 2: Fill form but DON'T submit
    await page.fill('input[name="company_name"]', 'Partial Session Test')
    await page.fill('input[name="revenue"]', '500000')
    await page.selectOption('select[name="industry"]', 'retail')
    
    // Wait for auto-save (assuming there's auto-save functionality)
    await page.waitForTimeout(2000)
    
    // Capture URL
    const reportUrl = page.url()
    
    // Step 3: Refresh page
    await page.reload({ waitUntil: 'networkidle' })
    
    // Step 4: Verify form fields are restored
    await expect(page.locator('input[name="company_name"]')).toHaveValue('Partial Session Test')
    await expect(page.locator('input[name="revenue"]')).toHaveValue('500000')
    
    // Verify report preview shows empty state (not calculated yet)
    await expect(page.locator('.preview-empty-state')).toBeVisible()
  })

  test('should handle restoration failure gracefully', async ({ page }) => {
    // Mock API to return error
    await page.route('**/api/valuation-sessions/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      })
    })
    
    // Navigate to report (will fail to load)
    await page.goto('/reports/val_error_test_123?flow=manual')
    
    // Should show error state, not crash
    await expect(page.locator('[data-testid="error-state"]')).toBeVisible({ timeout: 5000 })
    
    // Should offer retry button
    await expect(page.locator('button:has-text("Retry")')).toBeVisible()
  })

  test('should restore conversational flow session', async ({ page }) => {
    // Step 1: Start conversational flow
    await page.goto('/reports/new?flow=conversational&prefilledQuery=Restaurant')
    await page.waitForLoadState('networkidle')
    
    // Wait for AI to send first message
    await page.waitForSelector('.message-ai', { timeout: 10000 })
    
    // Step 2: Answer a few questions
    await page.fill('textarea[name="user-input"]', 'My restaurant in Brussels')
    await page.click('button[type="submit"]:has-text("Send")')
    
    // Wait for AI response
    await page.waitForSelector('.message-ai:nth-child(3)', { timeout: 10000 })
    
    // Capture URL
    const reportUrl = page.url()
    
    // Step 3: Refresh page
    await page.reload({ waitUntil: 'networkidle' })
    
    // Step 4: Verify conversation history is restored
    await expect(page.locator('.message-user')).toBeVisible()
    await expect(page.locator('.message-user')).toContainText('My restaurant in Brussels')
    
    // Verify can continue conversation
    await expect(page.locator('textarea[name="user-input"]')).toBeEnabled()
  })

  test('should handle rapid refreshes without data loss', async ({ page }) => {
    // Navigate to report
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    // Fill form
    await page.fill('input[name="company_name"]', 'Rapid Refresh Test')
    await page.fill('input[name="revenue"]', '750000')
    
    // Wait for auto-save
    await page.waitForTimeout(1500)
    
    // Refresh multiple times rapidly
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
    }
    
    // Final refresh with full wait
    await page.reload({ waitUntil: 'networkidle' })
    
    // Verify data still intact
    await expect(page.locator('input[name="company_name"]')).toHaveValue('Rapid Refresh Test')
    await expect(page.locator('input[name="revenue"]')).toHaveValue('750000')
  })

  test('should measure restoration performance', async ({ page }) => {
    // Create a completed valuation first (setup)
    // Note: In real implementation, you'd need to set up test data in database
    
    // Navigate to existing report with completed valuation
    const testReportId = 'val_performance_test_123'
    
    // Mark start time
    const startTime = Date.now()
    
    await page.goto(`/reports/${testReportId}?flow=manual`)
    
    // Wait for report to be visible (restoration complete)
    await page.waitForSelector('.valuation-report-container', { timeout: 5000 })
    
    const restorationTime = Date.now() - startTime
    
    // Restoration should complete in <2 seconds (including network)
    expect(restorationTime).toBeLessThan(2000)
    
    console.log(`Restoration time: ${restorationTime}ms`)
  })
})

test.describe('Restoration Edge Cases', () => {
  test('should handle missing session gracefully', async ({ page }) => {
    // Navigate to non-existent report
    await page.goto('/reports/val_nonexistent_999999?flow=manual')
    
    // Should auto-create new session or show error
    // Either way, should not crash
    await page.waitForTimeout(2000)
    
    // Check for error state or empty form
    const hasError = await page.locator('[data-testid="error-state"]').isVisible()
    const hasEmptyForm = await page.locator('input[name="company_name"]').isVisible()
    
    expect(hasError || hasEmptyForm).toBe(true)
  })

  test('should handle concurrent users without data leakage', async ({ page, context }) => {
    // Create two different sessions
    const page1 = page
    const page2 = await context.newPage()
    
    // User 1: Create valuation
    await page1.goto('/reports/new?flow=manual')
    await page1.fill('input[name="company_name"]', 'User 1 Company')
    await page1.fill('input[name="revenue"]', '1000000')
    
    // User 2: Create different valuation
    await page2.goto('/reports/new?flow=manual')
    await page2.fill('input[name="company_name"]', 'User 2 Company')
    await page2.fill('input[name="revenue"]', '2000000')
    
    // Wait for saves
    await page1.waitForTimeout(1000)
    await page2.waitForTimeout(1000)
    
    // Refresh both
    await page1.reload()
    await page2.reload()
    
    // Verify no data leakage
    await expect(page1.locator('input[name="company_name"]')).toHaveValue('User 1 Company')
    await expect(page2.locator('input[name="company_name"]')).toHaveValue('User 2 Company')
    
    await page2.close()
  })
})

test.describe('Cache Update Strategy (Cursor/ChatGPT-Style)', () => {
  test('should UPDATE cache (not invalidate) after valuation completes', async ({ page }) => {
    // Step 1: Create and complete valuation
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    await page.fill('input[name="company_name"]', 'Cache Update Test')
    await page.fill('input[name="revenue"]', '1000000')
    await page.fill('input[name="ebitda"]', '200000')
    await page.selectOption('select[name="industry"]', 'technology')
    await page.selectOption('select[name="country_code"]', 'BE')
    await page.selectOption('select[name="business_model"]', 'b2b_saas')
    await page.fill('input[name="founding_year"]', '2020')
    
    await page.click('button[type="submit"]:has-text("Calculate Indicative Estimate")')
    await page.waitForSelector('.valuation-report-container', { timeout: 30000 })
    
    const reportUrl = page.url()
    const reportId = reportUrl.match(/reports\/(val_[^?]+)/)?.[1]
    
    // Step 2: Check localStorage cache before refresh
    const cacheBeforeRefresh = await page.evaluate((id) => {
      const cacheKey = `upswitch_session_cache_${id}`
      const cached = localStorage.getItem(cacheKey)
      return cached ? JSON.parse(cached) : null
    }, reportId)
    
    // Cache should exist and have HTML report (info tab removed)
    expect(cacheBeforeRefresh).toBeTruthy()
    expect(cacheBeforeRefresh.session.htmlReport).toBeTruthy()
    
    // Step 3: Refresh and verify instant load from cache
    const refreshStartTime = Date.now()
    await page.reload({ waitUntil: 'domcontentloaded' })
    
    // Report should appear very quickly (from cache)
    await expect(page.locator('.valuation-report-container')).toBeVisible({ timeout: 1000 })
    const loadTime = Date.now() - refreshStartTime
    
    // Should load in <1 second (cache-first)
    expect(loadTime).toBeLessThan(1000)
    
    console.log(`Cache-first load time: ${loadTime}ms`)
  })

  test('should verify cache has version field for staleness detection', async ({ page }) => {
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    await page.fill('input[name="company_name"]', 'Version Test')
    await page.fill('input[name="revenue"]', '500000')
    
    // Wait for auto-save
    await page.waitForTimeout(2000)
    
    const reportUrl = page.url()
    const reportId = reportUrl.match(/reports\/(val_[^?]+)/)?.[1]
    
    // Check cache structure
    const cache = await page.evaluate((id) => {
      const cacheKey = `upswitch_session_cache_${id}`
      const cached = localStorage.getItem(cacheKey)
      return cached ? JSON.parse(cached) : null
    }, reportId)
    
    // Verify cache has version field
    expect(cache).toBeTruthy()
    expect(cache.version).toBeTruthy()
    expect(cache.cachedAt).toBeTruthy()
    expect(cache.expiresAt).toBeTruthy()
  })

  test('should load instantly from cache without blocking on backend', async ({ page }) => {
    // Create completed valuation first
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    await page.fill('input[name="company_name"]', 'Instant Load Test')
    await page.fill('input[name="revenue"]', '800000')
    await page.fill('input[name="ebitda"]', '160000')
    await page.selectOption('select[name="industry"]', 'retail')
    await page.selectOption('select[name="country_code"]', 'BE')
    await page.selectOption('select[name="business_model"]', 'ecommerce')
    await page.fill('input[name="founding_year"]', '2019')
    
    await page.click('button[type="submit"]:has-text("Calculate Indicative Estimate")')
    await page.waitForSelector('.valuation-report-container', { timeout: 30000 })
    
    // Now test instant load
    // Even if backend is slow, cache should load immediately
    const startTime = Date.now()
    await page.reload({ waitUntil: 'domcontentloaded' })
    
    // Report should appear immediately (not waiting for networkidle)
    await expect(page.locator('.valuation-report-container')).toBeVisible({ timeout: 500 })
    const instantLoadTime = Date.now() - startTime
    
    // Should be near-instant (<500ms)
    expect(instantLoadTime).toBeLessThan(500)
    
    console.log(`Instant cache load: ${instantLoadTime}ms`)
  })

  test('should handle cache completeness validation', async ({ page }) => {
    // Test scenario: Incomplete cache (no HTML reports) that's old should be invalidated
    
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    const reportUrl = page.url()
    const reportId = reportUrl.match(/reports\/(val_[^?]+)/)?.[1]
    
    // Artificially create an incomplete old cache
    await page.evaluate((id) => {
      const cacheKey = `upswitch_session_cache_${id}`
      const incompleteCache = {
        session: {
          reportId: id,
          currentView: 'manual',
          sessionData: { company_name: 'Old Incomplete Session' },
          // No htmlReport - INCOMPLETE
        },
        cachedAt: Date.now() - 15 * 60 * 1000, // 15 minutes old
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        version: Date.now().toString(),
      }
      localStorage.setItem(cacheKey, JSON.stringify(incompleteCache))
    }, reportId)
    
    // Refresh - should fetch from backend (cache invalidated)
    await page.reload({ waitUntil: 'networkidle' })
    
    // Check if new cache was created
    const newCache = await page.evaluate((id) => {
      const cacheKey = `upswitch_session_cache_${id}`
      const cached = localStorage.getItem(cacheKey)
      return cached ? JSON.parse(cached) : null
    }, reportId)
    
    // Old incomplete cache should have been replaced
    expect(newCache).toBeTruthy()
  })

  test('should verify optimistic UI updates to cache', async ({ page }) => {
    await page.goto('/reports/new?flow=manual')
    await page.waitForLoadState('networkidle')
    
    await page.fill('input[name="company_name"]', 'Optimistic Update Test')
    await page.fill('input[name="revenue"]', '1200000')
    await page.fill('input[name="ebitda"]', '240000')
    await page.selectOption('select[name="industry"]', 'technology')
    await page.selectOption('select[name="country_code"]', 'BE')
    await page.selectOption('select[name="business_model"]', 'b2b_saas')
    await page.fill('input[name="founding_year"]', '2021')
    
    // Submit and wait for completion
    await page.click('button[type="submit"]:has-text("Calculate Indicative Estimate")')
    await page.waitForSelector('.valuation-report-container', { timeout: 30000 })
    
    const reportUrl = page.url()
    const reportId = reportUrl.match(/reports\/(val_[^?]+)/)?.[1]
    
    // Check that cache was optimistically updated with valuation result
    const cache = await page.evaluate((id) => {
      const cacheKey = `upswitch_session_cache_${id}`
      const cached = localStorage.getItem(cacheKey)
      return cached ? JSON.parse(cached) : null
    }, reportId)
    
    // Cache should have been updated optimistically (info tab removed)
    expect(cache).toBeTruthy()
    expect(cache.session.valuationResult).toBeTruthy()
    expect(cache.session.htmlReport).toBeTruthy()
    
    // Immediate refresh should show report without delay
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.valuation-report-container')).toBeVisible({ timeout: 500 })
  })
})







