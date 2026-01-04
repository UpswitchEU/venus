/**
 * E2E Test: Cross-Subdomain Authentication
 * 
 * Verifies that authentication works seamlessly across
 * upswitch.app and valuation.upswitch.app using the dual-token system
 * 
 * Dual-Token System:
 * - upswitch_access_token: 15 minutes (for API authentication)
 * - upswitch_refresh_token: 7 days (for refreshing access token)
 * - Both tokens are HTTP-only cookies on domain .upswitch.app
 */

import { expect, test } from '@playwright/test'

test.describe('Cross-Subdomain Authentication (Dual-Token)', () => {
  test('should authenticate on subdomain when logged into main domain', async ({ page, context }) => {
    // Skip in CI if not configured
    if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
      test.skip()
    }

    // 1. Login on main domain (Mercury)
    await page.goto('https://upswitch.app/login')
    await page.fill('[name="email"]', process.env.E2E_TEST_EMAIL!)
    await page.fill('[name="password"]', process.env.E2E_TEST_PASSWORD!)
    await page.click('[type="submit"]')

    // Wait for auth to complete
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 5000 })

    // Verify dual-token cookies were set
    const cookies = await context.cookies()
    const accessTokenCookie = cookies.find((c) => c.name === 'upswitch_access_token')
    const refreshTokenCookie = cookies.find((c) => c.name === 'upswitch_refresh_token')
    
    // Access token should exist
    expect(accessTokenCookie).toBeDefined()
    expect(accessTokenCookie?.domain).toBe('.upswitch.app')
    expect(accessTokenCookie?.httpOnly).toBe(true)
    expect(accessTokenCookie?.secure).toBe(true)
    expect(accessTokenCookie?.sameSite).toBe('Lax')
    
    // Refresh token should exist
    expect(refreshTokenCookie).toBeDefined()
    expect(refreshTokenCookie?.domain).toBe('.upswitch.app')
    expect(refreshTokenCookie?.httpOnly).toBe(true)
    expect(refreshTokenCookie?.secure).toBe(true)
    expect(refreshTokenCookie?.sameSite).toBe('Lax')

    // 2. Navigate to subdomain (Venus)
    await page.goto('https://valuation.upswitch.app')

    // 3. Verify authenticated state appears quickly (<1s)
    // Venus should automatically read the cross-subdomain cookies
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('Authenticated', {
      timeout: 1000,
    })

    // 4. Verify user email appears
    await expect(page.locator('[data-testid="auth-status"]')).toContainText(process.env.E2E_TEST_EMAIL!)

    // 5. Verify dual-token cookies are still present on subdomain
    const subdomainCookies = await context.cookies()
    const subdomainAccessToken = subdomainCookies.find((c) => c.name === 'upswitch_access_token')
    const subdomainRefreshToken = subdomainCookies.find((c) => c.name === 'upswitch_refresh_token')
    
    expect(subdomainAccessToken).toBeDefined()
    expect(subdomainRefreshToken).toBeDefined()

    // 6. Verify no console errors related to authentication
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Wait a moment for any errors to surface
    await page.waitForTimeout(500)

    // Should have no auth-related errors
    const authErrors = consoleErrors.filter((err) =>
      err.toLowerCase().includes('auth') || err.toLowerCase().includes('cookie') || err.toLowerCase().includes('token')
    )
    expect(authErrors).toHaveLength(0)
  })

  test('should handle guest mode when not logged in', async ({ page }) => {
    // Navigate directly to subdomain without logging in
    await page.goto('https://valuation.upswitch.app')

    // Verify guest mode
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('guest', {
      timeout: 2000,
    })

    // Verify app still works
    await expect(page.locator('h1')).toBeVisible()
  })

  test('should handle token-based authentication (token exchange)', async ({ page, context }) => {
    // Skip in CI if not configured
    if (!process.env.E2E_TEST_TOKEN) {
      test.skip()
    }

    // Navigate with token (token exchange flow)
    await page.goto(`https://valuation.upswitch.app?token=${process.env.E2E_TEST_TOKEN}`)

    // Wait for token exchange and authentication
    // Backend should exchange token for dual-token cookies
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('Authenticated', {
      timeout: 2000,
    })

    // Verify token removed from URL
    expect(page.url()).not.toContain('token=')
    
    // Verify dual-token cookies were set after exchange
    const cookies = await context.cookies()
    const accessToken = cookies.find((c) => c.name === 'upswitch_access_token')
    const refreshToken = cookies.find((c) => c.name === 'upswitch_refresh_token')
    
    expect(accessToken).toBeDefined()
    expect(refreshToken).toBeDefined()
  })

  test('should maintain authentication across page reloads', async ({ page, context }) => {
    // Skip in CI if not configured
    if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
      test.skip()
    }

    // 1. Login on main domain (Mercury)
    await page.goto('https://upswitch.app/login')
    await page.fill('[name="email"]', process.env.E2E_TEST_EMAIL!)
    await page.fill('[name="password"]', process.env.E2E_TEST_PASSWORD!)
    await page.click('[type="submit"]')
    await page.waitForSelector('[data-testid="user-menu"]')

    // 2. Navigate to subdomain (Venus)
    await page.goto('https://valuation.upswitch.app')
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('Authenticated')

    // 3. Reload page
    await page.reload()

    // 4. Verify still authenticated (should be fast, <500ms)
    // Dual-token system ensures auth persists
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('Authenticated', {
      timeout: 500,
    })
  })

  test('should automatically refresh expired access token', async ({ page, context }) => {
    // Skip in CI if not configured
    if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
      test.skip()
    }

    // 1. Login on main domain
    await page.goto('https://upswitch.app/login')
    await page.fill('[name="email"]', process.env.E2E_TEST_EMAIL!)
    await page.fill('[name="password"]', process.env.E2E_TEST_PASSWORD!)
    await page.click('[type="submit"]')
    await page.waitForSelector('[data-testid="user-menu"]')

    // 2. Navigate to subdomain
    await page.goto('https://valuation.upswitch.app')
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('Authenticated')

    // 3. Clear access token cookie (simulate expiration)
    await context.clearCookies({ name: 'upswitch_access_token' })

    // 4. Reload page - should trigger automatic refresh
    await page.reload()

    // 5. Verify still authenticated (refresh token should get new access token)
    await expect(page.locator('[data-testid="auth-status"]')).toContainText('Authenticated', {
      timeout: 2000,
    })

    // 6. Verify new access token was set
    const cookies = await context.cookies()
    const newAccessToken = cookies.find((c) => c.name === 'upswitch_access_token')
    expect(newAccessToken).toBeDefined()
  })
})

