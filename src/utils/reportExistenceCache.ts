/**
 * Report Existence Cache Utility
 *
 * Single Responsibility: Fast existence check for reports without loading full session data
 * Provides instant "does this report exist?" checks using sessionStorage
 *
 * @module utils/reportExistenceCache
 */

import { createContextLogger } from './logger'
import { reportAccessScope } from './reportAccessScope'

const existenceLogger = createContextLogger('ReportExistenceCache')

const EXISTENCE_PREFIX = 'upswitch_report_exists_'
const EXISTENCE_TTL_MS = 30 * 60 * 1000 // 30 minutes (sessionStorage cleared on tab close)

interface ExistenceCacheEntry {
  exists: boolean
  cachedAt: number
  expiresAt: number
}

/**
 * Get cache key for report existence
 */
function getCacheKey(reportId: string): string {
  return `${EXISTENCE_PREFIX}${reportAccessScope()}:${reportId}`
}

/**
 * Mark that a report exists
 *
 * @param reportId - Report identifier
 */
export function markReportExists(reportId: string): void {
  try {
    const cachedAt = Date.now()
    const entry: ExistenceCacheEntry = {
      exists: true,
      cachedAt,
      expiresAt: cachedAt + EXISTENCE_TTL_MS,
    }

    sessionStorage.setItem(getCacheKey(reportId), JSON.stringify(entry))

    existenceLogger.debug('Marked report as existing', { reportId })
  } catch (error) {
    existenceLogger.error('Failed to mark report existence', {
      reportId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    // Don't throw - caching is optional
  }
}

/**
 * Mark that a report does not exist
 *
 * @param reportId - Report identifier
 */
export function markReportNotExists(reportId: string): void {
  try {
    const cachedAt = Date.now()
    const entry: ExistenceCacheEntry = {
      exists: false,
      cachedAt,
      expiresAt: cachedAt + EXISTENCE_TTL_MS,
    }

    sessionStorage.setItem(getCacheKey(reportId), JSON.stringify(entry))

    existenceLogger.debug('Marked report as not existing', { reportId })
  } catch (error) {
    existenceLogger.error('Failed to mark report non-existence', {
      reportId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    // Don't throw - caching is optional
  }
}

/**
 * Check if report exists in cache
 *
 * @param reportId - Report identifier
 * @returns true if exists, false if doesn't exist, null if unknown/expired
 */
export function checkReportExists(reportId: string): boolean | null {
  try {
    const key = getCacheKey(reportId)
    const cached = sessionStorage.getItem(key)

    if (!cached) {
      return null // Unknown
    }

    const entry: ExistenceCacheEntry = JSON.parse(cached)

    // Check expiry
    if (
      !entry ||
      typeof entry.exists !== 'boolean' ||
      !Number.isFinite(entry.cachedAt) ||
      !Number.isFinite(entry.expiresAt) ||
      entry.cachedAt > Date.now() ||
      entry.expiresAt <= Date.now() ||
      entry.expiresAt <= entry.cachedAt ||
      entry.expiresAt - entry.cachedAt > EXISTENCE_TTL_MS
    ) {
      sessionStorage.removeItem(key)
      existenceLogger.debug('Existence cache expired', { reportId })
      return null // Expired
    }

    existenceLogger.debug('Report existence check from cache', {
      reportId,
      exists: entry.exists,
      cachedAgo_minutes: Math.floor((Date.now() - entry.cachedAt) / (60 * 1000)),
    })

    return entry.exists
  } catch (error) {
    existenceLogger.error('Failed to check report existence', {
      reportId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    // Clean corrupted cache
    try {
      sessionStorage.removeItem(getCacheKey(reportId))
    } catch {
      // Ignore cleanup errors
    }
    return null
  }
}

/**
 * Clear existence cache for a report
 *
 * @param reportId - Report identifier
 */
export function clearReportExistence(reportId: string): void {
  try {
    sessionStorage.removeItem(getCacheKey(reportId))
    existenceLogger.debug('Cleared report existence cache', { reportId })
  } catch (error) {
    existenceLogger.error('Failed to clear report existence cache', {
      reportId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * Clear all existence caches
 */
export function clearAllExistenceCaches(): void {
  try {
    const keys = Object.keys(sessionStorage)
    const existenceKeys = keys.filter((key) => key.startsWith(EXISTENCE_PREFIX))

    for (const key of existenceKeys) {
      sessionStorage.removeItem(key)
    }

    existenceLogger.info('Cleared all existence caches', { count: existenceKeys.length })
  } catch (error) {
    existenceLogger.error('Failed to clear all existence caches', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * Clean expired existence caches
 */
export function cleanExpiredExistenceCaches(): void {
  try {
    const keys = Object.keys(sessionStorage)
    const existenceKeys = keys.filter((key) => key.startsWith(EXISTENCE_PREFIX))

    let cleanedCount = 0

    for (const key of existenceKeys) {
      try {
        const cached = sessionStorage.getItem(key)
        if (!cached) continue

        const entry: ExistenceCacheEntry = JSON.parse(cached)

        if (
          !entry ||
          typeof entry.exists !== 'boolean' ||
          !Number.isFinite(entry.cachedAt) ||
          !Number.isFinite(entry.expiresAt) ||
          entry.cachedAt > Date.now() ||
          entry.expiresAt <= Date.now() ||
          entry.expiresAt <= entry.cachedAt ||
          entry.expiresAt - entry.cachedAt > EXISTENCE_TTL_MS
        ) {
          sessionStorage.removeItem(key)
          cleanedCount++
        }
      } catch {
        // Corrupted cache - remove it
        sessionStorage.removeItem(key)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      existenceLogger.info('Cleaned expired existence caches', { count: cleanedCount })
    }
  } catch (error) {
    existenceLogger.error('Failed to clean expired existence caches', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
