import { generalLogger } from '../../utils/logger'

/**
 * SECURITY: Sanitize URL by removing sensitive query parameters.
 * Prevents data leakage through browser history, referers, analytics, and logs.
 */
export function sanitizeUrl(paramsToRemove: string[]): void {
  if (typeof window === 'undefined') return

  try {
    const url = new URL(window.location.href)
    let modified = false

    for (const param of paramsToRemove) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param)
        modified = true
      }
    }

    if (modified) {
      window.history.replaceState({}, '', url.toString())

      if (process.env.NODE_ENV === 'development') {
        generalLogger.debug('[Security] Sanitized URL parameters', { paramsToRemove })
      }
    }
  } catch (error) {
    generalLogger.error('[Security] URL sanitization failed', { error })
  }
}
