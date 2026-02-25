/**
 * 🔒 Security Configuration
 *
 * SECURITY SETTINGS:
 * - Password protection for platform access
 * - Cookie settings
 * - Rate limiting
 * - Security headers
 */

export const SECURITY_CONFIG = {
  // Password Protection
  PLATFORM_PASSWORD: process.env.NEXT_PUBLIC_PLATFORM_PASSWORD || process.env.PLATFORM_PASSWORD || '',

  // Cookie Settings
  PLATFORM_COOKIE_NAME: 'platform_access_token', // Separate cookie for platform protection
  COOKIE_EXPIRY_DAYS: 7, // Password valid for 7 days
  COOKIE_SECURE: true, // Only send over HTTPS
  COOKIE_SAME_SITE: 'strict', // CSRF protection

  // Rate Limiting
  MAX_ATTEMPTS: 5, // Maximum failed attempts
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes lockout

  // Security Headers
  // Note: X-Frame-Options must be set as HTTP header (see vercel.json), not meta tag
  SECURITY_HEADERS: {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
  },

  // SEO Protection
  SEO_PROTECTION: {
    robots: 'noindex, nofollow, noarchive, nosnippet',
    metaTags: [
      { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet' },
      { name: 'googlebot', content: 'noindex, nofollow, noarchive, nosnippet' },
      { name: 'bingbot', content: 'noindex, nofollow, noarchive, nosnippet' },
    ],
  },

  // Logging
  LOG_ATTEMPTS: true,
  LOG_SUCCESS: true,
  LOG_FAILURES: true,
}

export default SECURITY_CONFIG
