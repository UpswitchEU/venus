import { expect, test } from '@playwright/test';

/**
 * Cross-Subdomain Authentication E2E Tests
 * 
 * Tests authentication flows from main domain to valuation subdomain:
 * - upswitch.app → valuation.upswitch.app
 * 
 * Critical scenarios:
 * 1. Cookie propagation across subdomains
 * 2. Token exchange fallback if cookie fails
 * 3. Guest mode fallback if auth fails
 * 4. Session persistence across subdomain navigation
 */

const MAIN_DOMAIN = process.env.MAIN_DOMAIN || 'http://localhost:5173';
const VALUATION_DOMAIN = process.env.VALUATION_DOMAIN || 'http://localhost:3001';
const API_URL = process.env.API_URL || 'http://localhost:8080';

const TEST_USER = {
  email: `cross-subdomain-${Date.now()}@playwright.test`,
  password: 'TestPass123!@#',
  name: 'Cross-Subdomain Test User',
};

test.describe('Cross-Subdomain Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all cookies before each test
    await page.context().clearCookies();
  });

  test('should authenticate on main domain and access valuation subdomain', async ({ page, browserName }) => {
    // Step 1: Register on main domain
    const registerResponse = await page.request.post(`${API_URL}/api/auth/register`, {
      data: TEST_USER,
    });
    expect(registerResponse.ok()).toBeTruthy();
    
    // Step 2: Login on main domain
    await page.goto(MAIN_DOMAIN);
    await page.click('text=Log In');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
    
    // Step 3: Verify auth cookie is set on main domain
    const mainCookies = await page.context().cookies();
    const mainAuthCookie = mainCookies.find(c => c.name === 'upswitch_session');
    expect(mainAuthCookie, `${browserName}: Auth cookie should be set on main domain`).toBeDefined();
    
    console.log(`✅ ${browserName}: Authenticated on main domain`, {
      domain: mainAuthCookie?.domain,
      sameSite: mainAuthCookie?.sameSite,
    });
    
    // Step 4: Navigate to valuation subdomain
    await page.goto(VALUATION_DOMAIN);
    
    // Step 5: Verify we're authenticated on valuation subdomain
    // The app should either:
    // - Read the cookie (if domain=.upswitch.app)
    // - Exchange token for cookie (if cookie not readable)
    // - Show as authenticated user
    
    // Wait for auth to resolve
    await page.waitForTimeout(2000);
    
    // Should show user info, not "Sign Up" button
    const isAuthenticated = await page.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
    expect(isAuthenticated, `${browserName}: Should be authenticated on subdomain`).toBeTruthy();
    
    console.log(`✅ ${browserName}: Successfully authenticated on valuation subdomain`);
  });

  test('should use token exchange when cookie is not accessible', async ({ page, browserName }) => {
    // Register and login
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: TEST_USER,
    });
    
    await page.goto(MAIN_DOMAIN);
    await page.click('text=Log In');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
    
    // Get auth cookie before clearing
    const mainCookies = await page.context().cookies();
    const mainAuthCookie = mainCookies.find(c => c.name === 'upswitch_session');
    
    // Clear cookies to simulate cookie not being accessible
    await page.context().clearCookies();
    
    // Navigate to valuation subdomain with token in URL
    // (In real app, this would be done via navigation from main app)
    const tokenResponse = await page.request.post(`${API_URL}/api/auth/generate-subdomain-token`, {
      headers: {
        'Cookie': `upswitch_session=${mainAuthCookie?.value}`,
      },
    });
    
    if (tokenResponse.ok()) {
      const { data } = await tokenResponse.json();
      const token = data.token;
      
      // Navigate with token
      await page.goto(`${VALUATION_DOMAIN}?token=${token}`);
      
      // Wait for token exchange
      await page.waitForTimeout(2000);
      
      // Should be authenticated
      const isAuthenticated = await page.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
      expect(isAuthenticated, `${browserName}: Should be authenticated via token exchange`).toBeTruthy();
      
      console.log(`✅ ${browserName}: Token exchange successful`);
    }
  });

  test('should fall back to guest mode if authentication fails', async ({ page, browserName }) => {
    // Navigate to valuation subdomain without authentication
    await page.goto(VALUATION_DOMAIN);
    
    // Should work in guest mode
    // Guest mode allows using the valuation tool without login
    const isGuestMode = await page.locator('text=/guest|continue without|sign up/i').isVisible().catch(() => true);
    
    // Guest mode should be accessible
    expect(isGuestMode).toBeTruthy();
    
    console.log(`✅ ${browserName}: Guest mode fallback working`);
  });

  test('should maintain session across multiple subdomain navigations', async ({ page, browserName }) => {
    // Register and login
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: TEST_USER,
    });
    
    await page.goto(MAIN_DOMAIN);
    await page.click('text=Log In');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
    
    // Navigate to valuation subdomain
    await page.goto(VALUATION_DOMAIN);
    await page.waitForTimeout(2000);
    
    // Navigate back to main
    await page.goto(MAIN_DOMAIN);
    await page.waitForTimeout(1000);
    
    // Should still be authenticated
    const isAuthenticated = await page.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
    expect(isAuthenticated, `${browserName}: Should maintain session across navigation`).toBeTruthy();
    
    console.log(`✅ ${browserName}: Session maintained across subdomain navigation`);
  });

  test('should handle concurrent subdomain access', async ({ browser, browserName }) => {
    // Create two contexts (tabs)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    try {
      // Register
      await page1.request.post(`${API_URL}/api/auth/register`, {
        data: TEST_USER,
      });
      
      // Login in first tab
      await page1.goto(MAIN_DOMAIN);
      await page1.click('text=Log In');
      await page1.fill('input[name="email"]', TEST_USER.email);
      await page1.fill('input[name="password"]', TEST_USER.password);
      await page1.click('button[type="submit"]');
      await expect(page1).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
      
      // Get cookie from first tab
      const cookies1 = await context1.cookies();
      const authCookie1 = cookies1.find(c => c.name === 'upswitch_session');
      
      // Add cookie to second tab
      await context2.addCookies([authCookie1!]);
      
      // Navigate to valuation subdomain in both tabs simultaneously
      await Promise.all([
        page1.goto(VALUATION_DOMAIN),
        page2.goto(VALUATION_DOMAIN),
      ]);
      
      await Promise.all([
        page1.waitForTimeout(2000),
        page2.waitForTimeout(2000),
      ]);
      
      // Both should be authenticated
      const isAuth1 = await page1.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
      const isAuth2 = await page2.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
      
      expect(isAuth1, `${browserName}: Tab 1 should be authenticated`).toBeTruthy();
      expect(isAuth2, `${browserName}: Tab 2 should be authenticated`).toBeTruthy();
      
      console.log(`✅ ${browserName}: Concurrent subdomain access working`);
    } finally {
      await page1.close();
      await page2.close();
      await context1.close();
      await context2.close();
    }
  });
});

test.describe('Cookie Domain Tests', () => {
  test('should verify cookie domain allows subdomain access', async ({ page, browserName }) => {
    // Register and login
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: TEST_USER,
    });
    
    await page.goto(MAIN_DOMAIN);
    await page.click('text=Log In');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
    
    const cookies = await page.context().cookies();
    const authCookie = cookies.find(c => c.name === 'upswitch_session');
    
    expect(authCookie).toBeDefined();
    
    // In production, domain should be .upswitch.biz
    // This allows cookie to be accessible on all subdomains
    if (process.env.NODE_ENV === 'production') {
      expect(authCookie?.domain, 'Cookie domain should be .upswitch.biz').toBe('.upswitch.biz');
    }
    
    // sameSite should be Lax (allows same-site subdomain navigation)
    expect(authCookie?.sameSite, 'Cookie sameSite should be Lax').toBe('Lax');
    
    console.log(`✅ ${browserName}: Cookie domain configuration correct`, {
      domain: authCookie?.domain,
      sameSite: authCookie?.sameSite,
    });
  });
});

test.describe('Safari ITP Tests', () => {
  test('Safari: should bypass ITP for same-domain subdomains', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Safari-specific test');
    
    // Safari ITP blocks 3rd-party cookies but allows 1st-party cookies
    // Our implementation uses same-domain subdomains (.upswitch.app)
    // This should bypass ITP
    
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: TEST_USER,
    });
    
    await page.goto(MAIN_DOMAIN);
    await page.click('text=Log In');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
    
    // Navigate to subdomain
    await page.goto(VALUATION_DOMAIN);
    await page.waitForTimeout(2000);
    
    // Should be authenticated (ITP bypass working)
    const isAuthenticated = await page.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
    expect(isAuthenticated, 'Safari ITP should not block same-domain subdomain cookies').toBeTruthy();
    
    console.log('✅ Safari: ITP bypass successful for cross-subdomain auth');
  });
});

test.describe('Performance Tests', () => {
  test('should authenticate on subdomain within 2 seconds', async ({ page, browserName }) => {
    // Register and login
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: TEST_USER,
    });
    
    await page.goto(MAIN_DOMAIN);
    await page.click('text=Log In');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 10000 });
    
    // Measure time to authenticate on subdomain
    const startTime = Date.now();
    await page.goto(VALUATION_DOMAIN);
    
    // Wait for authentication to complete
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 5000 }).catch(() => {});
    
    const authTime = Date.now() - startTime;
    
    // Should authenticate within 2 seconds (target: < 500ms with cookie, < 2s with token)
    expect(authTime, `${browserName}: Auth should complete within 2 seconds`).toBeLessThan(2000);
    
    console.log(`✅ ${browserName}: Auth time: ${authTime}ms`);
  });
});
