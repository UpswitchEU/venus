/**
 * Cookie Health Detection (Simplified)
 *
 * Simple check for cookie accessibility
 * No over-engineering, just basic detection
 */

/**
 * Check if cookies are accessible in the browser
 */
export function checkCookieExists(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes('upswitch_session')
}

/**
 * Simple cookie health status
 */
export interface CookieHealthStatus {
  accessible: boolean
  blocked: boolean
}

/**
 * Basic cookie health check
 */
export async function checkCookieHealth(): Promise<CookieHealthStatus> {
  const accessible = checkCookieExists()

  return {
    accessible,
    blocked: !accessible,
  }
}
