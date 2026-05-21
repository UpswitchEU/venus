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
const MAX_CACHE_SIZE = 20 // Limit number of cached sessions (reduced to avoid quota pressure)
const SESSION_CACHE_PAYLOAD_CLASSIFICATION = 'session-metadata-only'

function isQuotaExceededError(error: unknown): boolean {
  const candidate =
    error && typeof error === 'object' ? (error as { code?: unknown; name?: unknown }) : {}

  return candidate.name === 'QuotaExceededError' || candidate.code === 22
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface CachedSession {
  session: ValuationSession
  cachedAt: number
  expiresAt: number
  version: string // Cache version based on session.updatedAt for staleness detection
  payloadClassification?: typeof SESSION_CACHE_PAYLOAD_CLASSIFICATION
}

/**
 * Session Cache Manager
 *
 * Provides localStorage-based caching for session resilience.
 *
 * Features:
 * - 24-hour TTL
 * - Automatic expiry cleanup
 * - Size limits (max 20 sessions)
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

  private stripSessionForStorage(session: ValuationSession): ValuationSession {
    const storageSafeSession: ValuationSession = {
      reportId: session.reportId,
      currentView: session.currentView,
      dataSource: session.dataSource,
      status: session.status,
      reportReady: session.reportReady,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
      lastSyncedAt: session.lastSyncedAt,
      calculatedAt: session.calculatedAt,
      completeness: session.completeness,
      partialData: {},
      sessionData: {},
    }

    return storageSafeSession
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

      const sessionMetadataOnly = this.stripSessionForStorage(session)

      const cached: CachedSession = {
        session: sessionMetadataOnly,
        cachedAt: Date.now(),
        expiresAt: Date.now() + CACHE_TTL_MS,
        version: session.updatedAt?.toString() || Date.now().toString(), // Track version for staleness detection
        payloadClassification: SESSION_CACHE_PAYLOAD_CLASSIFICATION,
      }

      const key = this.getCacheKey(reportId)

      try {
        localStorage.setItem(key, JSON.stringify(cached))
      } catch (quotaError: unknown) {
        // If still hitting quota (shouldn't happen now, but safety check)
        if (isQuotaExceededError(quotaError)) {
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
          } catch (retryError: unknown) {
            // If retry still fails, the session might be too large even after cleanup
            // Try to cache a minimal version (just metadata, no large data)
            cacheLogger.warn('Cache retry failed, attempting minimal cache', {
              reportId,
              error: getErrorMessage(retryError),
            })
            try {
              const minimalCached: CachedSession = {
                session: sessionMetadataOnly,
                cachedAt: Date.now(),
                expiresAt: Date.now() + CACHE_TTL_MS,
                version: session.updatedAt?.toString() || Date.now().toString(),
                payloadClassification: SESSION_CACHE_PAYLOAD_CLASSIFICATION,
              }
              localStorage.setItem(key, JSON.stringify(minimalCached))
              cacheLogger.info('Metadata-only cache saved successfully', { reportId })
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

      cacheLogger.info('Session metadata cached (workflow payload excluded)', {
        reportId,
        expiresIn_hours: CACHE_TTL_MS / (60 * 60 * 1000),
        version: cached.version,
        payloadClassification: cached.payloadClassification,
        note: 'Browser cache stores session metadata only; workflow payload is fetched from Titan.',
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

      const isMetadataOnlyCache =
        parsed.payloadClassification === SESSION_CACHE_PAYLOAD_CLASSIFICATION
      const rawSession =
        parsed.session && typeof parsed.session === 'object'
          ? (parsed.session as unknown as Record<string, unknown>)
          : {}
      const rawSessionData =
        rawSession.sessionData && typeof rawSession.sessionData === 'object'
          ? (rawSession.sessionData as Record<string, unknown>)
          : {}
      const rawHasValuationResult = !!(
        rawSession.valuationResult ||
        rawSessionData.valuation_result ||
        rawSessionData.valuationResult ||
        rawSessionData._valuationResult
      )

      const sanitized = sanitizeSessionData(this.stripSessionForStorage(parsed.session))

      const sessionData =
        sanitized.sessionData && typeof sanitized.sessionData === 'object'
          ? (sanitized.sessionData as Record<string, unknown>)
          : {}
      const cacheAge_minutes = Math.floor((Date.now() - parsed.cachedAt) / (60 * 1000))

      if (!isMetadataOnlyCache && !rawHasValuationResult && cacheAge_minutes > 10) {
        cacheLogger.info('Invalidating incomplete stale cache (no valuation result)', {
          reportId,
          cacheAge_minutes,
          hasValuationResult: rawHasValuationResult,
          sessionDataKeys: Object.keys(sessionData).slice(0, 10),
        })
        this.delete(reportId)
        return null
      }

      cacheLogger.info('Session metadata loaded from cache', {
        reportId,
        cachedAgo_minutes: cacheAge_minutes,
        hasValuationResult: false,
        payloadClassification: SESSION_CACHE_PAYLOAD_CLASSIFICATION,
        version: parsed.version,
        note: 'Workflow payload is not cached in browser storage and must be fetched from Titan.',
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
