/**
 * Minimal Auth Logger
 *
 * Production-grade logging following Stripe/Auth0 patterns:
 * - Errors only (console.error)
 * - Analytics tracking
 * - Sentry integration (when available)
 * - No verbose logging in production
 */

/**
 * Log authentication error
 * Sends to console and error tracking service
 */
export function logAuthError(message: string, context?: Record<string, any>): void {
  console.error(`[Auth] ${message}`, context || {})

  // Send to Sentry if available
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    ;(window as any).Sentry.captureException(new Error(message), {
      tags: { module: 'auth' },
      extra: context,
    })
  }
}

/**
 * Track authentication success for analytics
 */
export function trackAuthSuccess(userId: string, method: 'cookie' | 'token'): void {
  // Log in development only
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Auth] User authenticated: ${userId} (method: ${method})`)
  }

  // Track in analytics
  if (typeof window !== 'undefined' && (window as any).analytics) {
    ;(window as any).analytics.track('Authentication Success', {
      userId,
      method,
      timestamp: new Date().toISOString(),
    })
  }

  // Track in custom monitoring if available
  if (typeof window !== 'undefined' && (window as any).__AUTH_MONITOR__) {
    ;(window as any).__AUTH_MONITOR__.recordSuccess({
      userId,
      method,
      timestamp: Date.now(),
    })
  }
}

/**
 * Track authentication failure for monitoring
 */
export function trackAuthFailure(error: string, context?: Record<string, any>): void {
  // Always log errors
  logAuthError(error, context)

  // Track in analytics
  if (typeof window !== 'undefined' && (window as any).analytics) {
    ;(window as any).analytics.track('Authentication Failure', {
      error,
      ...context,
      timestamp: new Date().toISOString(),
    })
  }

  // Track in custom monitoring if available
  if (typeof window !== 'undefined' && (window as any).__AUTH_MONITOR__) {
    ;(window as any).__AUTH_MONITOR__.recordFailure({
      error,
      context,
      timestamp: Date.now(),
    })
  }
}

/**
 * Simple auth metrics tracker
 * Provides basic success rate monitoring
 */
class AuthMetrics {
  private successCount = 0
  private failureCount = 0
  private logoutCount = 0
  private startTime = Date.now()

  recordSuccess(): void {
    this.successCount++
  }

  recordFailure(): void {
    this.failureCount++
  }

  recordLogout(): void {
    this.logoutCount++
  }

  getSuccessRate(): number {
    const total = this.successCount + this.failureCount
    return total > 0 ? (this.successCount / total) * 100 : 0
  }

  getMetrics() {
    const uptime = Date.now() - this.startTime
    return {
      successCount: this.successCount,
      failureCount: this.failureCount,
      logoutCount: this.logoutCount,
      successRate: this.getSuccessRate(),
      uptimeMs: uptime,
    }
  }

  reset(): void {
    this.successCount = 0
    this.failureCount = 0
    this.logoutCount = 0
    this.startTime = Date.now()
  }
}

// Singleton metrics instance
export const authMetrics = new AuthMetrics()

// Expose metrics globally for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  ;(window as any).__AUTH_METRICS__ = authMetrics
}
