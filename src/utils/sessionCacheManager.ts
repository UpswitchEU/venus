/**
 * Session Cache Manager
 *
 * Single Responsibility: Manage localStorage cache for session resilience
 * Provides safety net when backend unavailable
 *
 * @module utils/sessionCacheManager
 */

import type { ValuationSession } from '../types/valuation'
import { createContextLogger } from './logger'
import { sanitizeSessionData, validateSessionData } from './sessionValidation'

const cacheLogger = createContextLogger('SessionCache')

const CACHE_PREFIX = 'upswitch_session_cache_'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_CACHE_SIZE = 50 // Limit number of cached sessions

interface CachedSession {
  session: ValuationSession
  cachedAt: number
  expiresAt: number
  version: string // Cache version based on session.updatedAt for staleness detection
}

/**
 * Session Cache Manager
 *
 * Provides localStorage-based caching for session resilience.
 *
 * Features:
 * - 24-hour TTL
 * - Automatic expiry cleanup
 * - Size limits (max 50 sessions)
 * - Validation before storage/retrieval
 *
 * Use Cases:
 * - Offline resilience
 * - Backend unavailable fallback
 * - Network error recovery
 * - Instant load (no API call)
 *
 * @example
 * ```typescript
 * const cache = SessionCacheManager.getInstance()
 *
 * // Save after successful load
 * cache.set('val_123', session)
 *
 * // Retrieve on load failure
 * const cached = cache.get('val_123')
 * if (cached) {
 *   // Use cached session
 * }
 * ```
 */
export class SessionCacheManager {
  private static instance: SessionCacheManager

  private constructor() {
    // Clean expired caches on initialization
    this.cleanExpired()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SessionCacheManager {
    if (!this.instance) {
      this.instance = new SessionCacheManager()
    }
    return this.instance
  }

  /**
   * Cache key for report
   */
  private getCacheKey(reportId: string): string {
    return `${CACHE_PREFIX}${reportId}`
  }

  /**
   * Cache session to localStorage
   *
   * @param reportId - Report identifier
   * @param session - Session to cache
   */
  set(reportId: string, session: ValuationSession): void {
    try {
      // Validate before caching
      validateSessionData(session)

      // ✅ FIX: Exclude large HTML reports from cache to prevent quota errors
      // HTML reports are fetched from backend on demand
      // Use destructuring to completely exclude HTML reports (more efficient than setting to undefined)
      const { htmlReport, infoTabHtml, ...sessionWithoutHtml } = session

      // Note: htmlReport and infoTabHtml are excluded from sessionWithoutHtml
      // They exist in backend and are fetched on demand when needed

      const cached: CachedSession = {
        session: sessionWithoutHtml,
        cachedAt: Date.now(),
        expiresAt: Date.now() + CACHE_TTL_MS,
        version: session.updatedAt?.toString() || Date.now().toString(), // Track version for staleness detection
      }

      const key = this.getCacheKey(reportId)

      try {
        localStorage.setItem(key, JSON.stringify(cached))
      } catch (quotaError: any) {
        // If still hitting quota (shouldn't happen now, but safety check)
        if (quotaError.name === 'QuotaExceededError' || quotaError.code === 22) {
          cacheLogger.warn('Cache quota exceeded, clearing oldest entries and retrying', {
            reportId,
          })
          // Clear some old caches and retry
          this.enforceSizeLimit()
          this.cleanExpired()
          // Retry with reduced data - wrap in try-catch to handle persistent failures
          try {
            localStorage.setItem(key, JSON.stringify(cached))
            cacheLogger.info('Cache retry successful after cleanup', { reportId })
          } catch (retryError: any) {
            // If retry still fails, the session might be too large even after cleanup
            // Try to cache a minimal version (just metadata, no large data)
            cacheLogger.warn('Cache retry failed, attempting minimal cache', {
              reportId,
              error: retryError.message,
            })
            try {
              // Create minimal cache with essential metadata and sessionData (for form restoration)
              // Exclude large fields: htmlReport, infoTabHtml, valuationResult
              const minimalSession: Partial<ValuationSession> = {
                reportId: session.reportId,
                currentView: session.currentView,
                dataSource: session.dataSource,
                name: session.name,
                sessionData: session.sessionData, // ✅ Include sessionData for form field restoration
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                calculatedAt: session.calculatedAt,
                // Exclude large fields: htmlReport, infoTabHtml, valuationResult
              }
              const minimalCached: CachedSession = {
                session: minimalSession as ValuationSession,
                cachedAt: Date.now(),
                expiresAt: Date.now() + CACHE_TTL_MS,
                version: session.updatedAt?.toString() || Date.now().toString(),
              }
              localStorage.setItem(key, JSON.stringify(minimalCached))
              cacheLogger.info('Minimal cache saved successfully', { reportId })
            } catch (minimalError) {
              // Even minimal cache failed - give up gracefully
              cacheLogger.error('Failed to cache session even with minimal data', {
                reportId,
                error: minimalError instanceof Error ? minimalError.message : 'Unknown error',
                note: 'Session will be loaded from backend on next visit',
              })
              // Don't throw - caching is optional
            }
          }
        } else {
          throw quotaError
        }
      }

      cacheLogger.info('Session cached (HTML reports excluded)', {
        reportId,
        expiresIn_hours: CACHE_TTL_MS / (60 * 60 * 1000),
        version: cached.version,
        hasHtmlReportInBackend: !!session.htmlReport,
        hasInfoTabHtmlInBackend: !!session.infoTabHtml,
        note: 'HTML reports excluded from cache, fetched from backend on demand',
      })

      // Check cache size and clean if needed
      this.enforceSizeLimit()
    } catch (error) {
      cacheLogger.error('Failed to cache session', {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      // Don't throw - caching is optional
    }
  }

  /**
   * Get cached session from localStorage
   *
   * @param reportId - Report identifier
   * @returns Cached session or null if not found/expired
   */
  get(reportId: string): ValuationSession | null {
    try {
      const key = this.getCacheKey(reportId)
      const cached = localStorage.getItem(key)

      if (!cached) {
        return null
      }

      const parsed: CachedSession = JSON.parse(cached)

      // Check expiry
      if (Date.now() > parsed.expiresAt) {
        cacheLogger.info('Cached session expired, removing', { reportId })
        this.delete(reportId)
        return null
      }

      // Validate and sanitize
      const sanitized = sanitizeSessionData(parsed.session)

      // ✅ CACHE COMPLETENESS CHECK: Detect incomplete/stale caches
      // Note: HTML reports are excluded from cache, so we check valuationResult instead
      // If session has no valuation result but cache is old (>10 min), invalidate it
      // This prevents stale "empty session" caches from before valuation completion
      const hasValuationResult = !!sanitized.valuationResult
      const cacheAge_minutes = Math.floor((Date.now() - parsed.cachedAt) / (60 * 1000))

      // Note: HTML reports are not cached (too large), so we don't check for them here
      // They will be fetched from backend when needed
      if (!hasValuationResult && cacheAge_minutes > 10) {
        cacheLogger.info('Invalidating incomplete stale cache (no valuation result)', {
          reportId,
          cacheAge_minutes,
          hasValuationResult,
        })
        this.delete(reportId)
        return null
      }

      cacheLogger.info('Session loaded from cache (HTML reports excluded, fetch from backend)', {
        reportId,
        cachedAgo_minutes: cacheAge_minutes,
        hasValuationResult,
        version: parsed.version,
        note: 'HTML reports not cached, will be fetched from backend when needed',
      })

      return sanitized
    } catch (error) {
      cacheLogger.error('Failed to load cached session', {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      // Clean corrupted cache
      this.delete(reportId)
      return null
    }
  }

  /**
   * Delete cached session
   *
   * @param reportId - Report identifier
   */
  delete(reportId: string): void {
    try {
      const key = this.getCacheKey(reportId)
      localStorage.removeItem(key)
      cacheLogger.info('Cached session deleted', { reportId })
    } catch (error) {
      cacheLogger.error('Failed to delete cached session', { reportId, error })
    }
  }

  /**
   * Remove session from cache (alias for delete)
   * Used when cache becomes stale or invalid
   *
   * @param reportId - Report identifier
   */
  remove(reportId: string): void {
    this.delete(reportId)
  }

  /**
   * Check if session is cached and valid
   *
   * @param reportId - Report identifier
   * @returns true if cached and not expired
   */
  has(reportId: string): boolean {
    const session = this.get(reportId)
    return session !== null
  }

  /**
   * Clean expired caches
   */
  cleanExpired(): void {
    try {
      const keys = Object.keys(localStorage)
      const sessionKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))

      let cleanedCount = 0

      for (const key of sessionKeys) {
        try {
          const cached = localStorage.getItem(key)
          if (!cached) continue

          const parsed: CachedSession = JSON.parse(cached)

          if (Date.now() > parsed.expiresAt) {
            localStorage.removeItem(key)
            cleanedCount++
          }
        } catch {
          // Corrupted cache - remove it
          localStorage.removeItem(key)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        cacheLogger.info('Cleaned expired caches', { count: cleanedCount })
      }
    } catch (error) {
      cacheLogger.error('Failed to clean expired caches', { error })
    }
  }

  /**
   * Enforce maximum cache size
   *
   * Removes oldest caches if limit exceeded.
   */
  private enforceSizeLimit(): void {
    try {
      const keys = Object.keys(localStorage)
      const sessionKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))

      if (sessionKeys.length <= MAX_CACHE_SIZE) {
        return
      }

      // Get all caches with timestamps
      const caches: Array<{ key: string; cachedAt: number }> = []

      for (const key of sessionKeys) {
        try {
          const cached = localStorage.getItem(key)
          if (!cached) continue

          const parsed: CachedSession = JSON.parse(cached)
          caches.push({ key, cachedAt: parsed.cachedAt })
        } catch {
          // Corrupted - will be removed
          caches.push({ key, cachedAt: 0 })
        }
      }

      // Sort by age (oldest first)
      caches.sort((a, b) => a.cachedAt - b.cachedAt)

      // Remove oldest to get back to limit
      const toRemove = caches.slice(0, caches.length - MAX_CACHE_SIZE)

      for (const item of toRemove) {
        localStorage.removeItem(item.key)
      }

      cacheLogger.info('Enforced cache size limit', {
        removed: toRemove.length,
        remaining: MAX_CACHE_SIZE,
      })
    } catch (error) {
      cacheLogger.error('Failed to enforce cache size limit', { error })
    }
  }

  /**
   * Clear all session caches
   *
   * @param confirmationKey - Safety key to prevent accidental clear
   */
  clearAll(confirmationKey: string): void {
    if (confirmationKey !== 'CONFIRM_CLEAR_ALL_CACHES') {
      throw new Error('Invalid confirmation key')
    }

    try {
      const keys = Object.keys(localStorage)
      const sessionKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))

      for (const key of sessionKeys) {
        localStorage.removeItem(key)
      }

      cacheLogger.info('Cleared all session caches', { count: sessionKeys.length })
    } catch (error) {
      cacheLogger.error('Failed to clear all caches', { error })
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getStats(): {
    totalCached: number
    totalSize_kb: number
    oldestCache_minutes: number | null
    newestCache_minutes: number | null
  } {
    try {
      const keys = Object.keys(localStorage)
      const sessionKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))

      let totalSize = 0
      let oldestTime: number | null = null
      let newestTime: number | null = null

      for (const key of sessionKeys) {
        const cached = localStorage.getItem(key)
        if (!cached) continue

        totalSize += cached.length

        try {
          const parsed: CachedSession = JSON.parse(cached)

          if (oldestTime === null || parsed.cachedAt < oldestTime) {
            oldestTime = parsed.cachedAt
          }
          if (newestTime === null || parsed.cachedAt > newestTime) {
            newestTime = parsed.cachedAt
          }
        } catch {
          // Skip corrupted cache
        }
      }

      const now = Date.now()

      return {
        totalCached: sessionKeys.length,
        totalSize_kb: Math.floor(totalSize / 1024),
        oldestCache_minutes: oldestTime ? Math.floor((now - oldestTime) / (60 * 1000)) : null,
        newestCache_minutes: newestTime ? Math.floor((now - newestTime) / (60 * 1000)) : null,
      }
    } catch (error) {
      cacheLogger.error('Failed to get cache stats', { error })
      return {
        totalCached: 0,
        totalSize_kb: 0,
        oldestCache_minutes: null,
        newestCache_minutes: null,
      }
    }
  }

  /**
   * Warm cache for frequently accessed reports
   *
   * World-Class Cache Warming:
   * - Pre-loads recent reports in background
   * - Improves perceived performance
   * - Non-blocking operation
   */
  async warmCache(reportIds: string[]): Promise<void> {
    if (typeof window === 'undefined') return

    try {
      cacheLogger.info('Warming cache for reports', { count: reportIds.length })

      // Warm cache in background (non-blocking)
      Promise.all(
        reportIds.map(async (reportId) => {
          // Only warm if not already cached
          if (this.has(reportId)) {
            return
          }

          try {
            // Fetch session from backend
            const { backendAPI } = await import('../services/backendApi')
            const response = await backendAPI.getValuationSession(reportId)

            if (response?.session) {
              // Cache the session
              this.set(reportId, response.session)
              cacheLogger.debug('Cache warmed for report', { reportId })
            }
          } catch (error) {
            // Non-critical - cache warming is optional
            cacheLogger.debug('Failed to warm cache for report', {
              reportId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })
      ).catch((error) => {
        // Non-critical
        cacheLogger.warn('Cache warming failed', { error })
      })
    } catch (error) {
      cacheLogger.warn('Cache warming initialization failed', { error })
    }
  }

  /**
   * Invalidate cache for a report (mark as stale)
   *
   * World-Class Cache Invalidation:
   * - Marks cache as stale
   * - Forces refresh on next access
   * - Handles partial updates gracefully
   */
  invalidate(reportId: string): void {
    try {
      const key = this.getCacheKey(reportId)
      const cached = localStorage.getItem(key)

      if (!cached) {
        return // Not cached, nothing to invalidate
      }

      try {
        const parsed: CachedSession = JSON.parse(cached)

        // Mark as expired (force refresh)
        parsed.expiresAt = Date.now() - 1

        localStorage.setItem(key, JSON.stringify(parsed))

        cacheLogger.info('Cache invalidated for report', { reportId })
      } catch {
        // Corrupted cache - just delete it
        this.delete(reportId)
      }
    } catch (error) {
      cacheLogger.error('Failed to invalidate cache', { reportId, error })
    }
  }

  /**
   * Invalidate all caches (useful for logout or major updates)
   */
  invalidateAll(): void {
    try {
      const keys = Object.keys(localStorage)
      const sessionKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))

      for (const key of sessionKeys) {
        localStorage.removeItem(key)
      }

      cacheLogger.info('All caches invalidated', { count: sessionKeys.length })
    } catch (error) {
      cacheLogger.error('Failed to invalidate all caches', { error })
    }
  }
}

// Singleton instance
export const globalSessionCache = SessionCacheManager.getInstance()
