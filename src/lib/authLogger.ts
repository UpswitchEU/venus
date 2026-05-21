/**
 * Minimal Auth Logger
 *
 * Production-grade logging following Stripe/Auth0 patterns:
 * - Errors only (console.error)
 * - Analytics tracking
 * - Sentry integration (when available)
 * - No verbose logging in production
 */

type AuthLogContext = Record<string, unknown>

type AuthAnalytics = {
  track: (event: string, properties: AuthLogContext) => void
}

type AuthSentry = {
  captureException: (
    error: Error,
    options: { tags: Record<string, string>; extra?: AuthLogContext }
  ) => void
}

type AuthMonitor = {
  recordSuccess: (event: { userId: string; method: 'cookie' | 'token'; timestamp: number }) => void
  recordFailure: (event: { error: string; context?: AuthLogContext; timestamp: number }) => void
}

type AuthLoggerWindow = Window & {
  Sentry?: AuthSentry
  analytics?: AuthAnalytics
  __AUTH_MONITOR__?: AuthMonitor
  __AUTH_METRICS__?: AuthMetrics
}

function getAuthLoggerWindow(): AuthLoggerWindow | null {
  return typeof window === 'undefined' ? null : (window as AuthLoggerWindow)
}

/**
 * Log authentication error
 * Sends to console and error tracking service
 */
export function logAuthError(message: string, context?: AuthLogContext): void {
  console.error(`[Auth] ${message}`, context || {})

  // Send to Sentry if available
  const authWindow = getAuthLoggerWindow()
  if (authWindow?.Sentry) {
    authWindow.Sentry.captureException(new Error(message), {
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
  const authWindow = getAuthLoggerWindow()
  if (authWindow?.analytics) {
    authWindow.analytics.track('Authentication Success', {
      userId,
      method,
      timestamp: new Date().toISOString(),
    })
  }

  // Track in custom monitoring if available
  if (authWindow?.__AUTH_MONITOR__) {
    authWindow.__AUTH_MONITOR__.recordSuccess({
      userId,
      method,
      timestamp: Date.now(),
    })
  }
}

/**
 * Track authentication failure for monitoring
 */
export function trackAuthFailure(error: string, context?: AuthLogContext): void {
  // Always log errors
  logAuthError(error, context)

  // Track in analytics
  const authWindow = getAuthLoggerWindow()
  if (authWindow?.analytics) {
    authWindow.analytics.track('Authentication Failure', {
      error,
      ...context,
      timestamp: new Date().toISOString(),
    })
  }

  // Track in custom monitoring if available
  if (authWindow?.__AUTH_MONITOR__) {
    authWindow.__AUTH_MONITOR__.recordFailure({
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
  ;(window as AuthLoggerWindow).__AUTH_METRICS__ = authMetrics
}
