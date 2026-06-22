/**
 * Response Cache with TTL
 *
 * Caches API responses with Time-To-Live (TTL) expiration.
 * Reduces network calls for repeated requests.
 *
 * Benefits:
 * - Fast subsequent loads (cache hits)
 * - Reduced server load
 * - Configurable TTL per request type
 * - Automatic cache cleanup
 *
 * @module services/cache/ResponseCache
 */

import { generalLogger } from '../../utils/logger'
import {
  createManagedInterval,
  type ManagedIntervalStartOptions,
  type ManagedIntervalStopOptions,
} from '../../utils/managedInterval'

const RESPONSE_CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  key: string
}

/**
 * Response cache with TTL and LRU eviction
 */
export class ResponseCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private readonly maxSize: number
  private hitCount = 0
  private missCount = 0

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize
  }

  /**
   * Fetch with caching
   * Returns cached data if fresh, otherwise fetches and caches
   *
   * @param key - Unique cache key
   * @param fn - Function that fetches the data
   * @param ttl - Time-to-live in milliseconds (default: 60000 = 1 minute)
   * @returns Cached or fresh data
   */
  async cachedFetch<T>(key: string, fn: () => Promise<T>, ttl: number = 60000): Promise<T> {
    const cached = this.cache.get(key)
    const now = Date.now()

    // Check if cached data exists and is fresh
    if (cached && now - cached.timestamp < cached.ttl) {
      this.hitCount++
      const age = now - cached.timestamp

      generalLogger.debug('[ResponseCache] Cache HIT', {
        key,
        age_ms: age,
        ttl_remaining_ms: cached.ttl - age,
        hit_rate: this.getHitRate(),
      })

      return cached.data as T
    }

    // Cache miss - fetch fresh data
    this.missCount++

    generalLogger.debug('[ResponseCache] Cache MISS', {
      key,
      was_expired: cached ? now - cached.timestamp >= cached.ttl : false,
      hit_rate: this.getHitRate(),
    })

    try {
      const data = await fn()

      // Store in cache
      this.set(key, data, ttl)

      return data
    } catch (error) {
      // Remove stale cache entry on error
      if (cached) {
        this.cache.delete(key)
      }

      throw error
    }
  }

  /**
   * Set cache entry manually
   */
  set<T>(key: string, data: T, ttl: number = 60000): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      key,
    })

    generalLogger.debug('[ResponseCache] Entry cached', {
      key,
      ttl_ms: ttl,
      cache_size: this.cache.size,
    })
  }

  /**
   * Get cached entry (returns undefined if expired or missing)
   */
  get<T>(key: string): T | undefined {
    const cached = this.cache.get(key)

    if (!cached) {
      return undefined
    }

    const now = Date.now()

    // Check if expired
    if (now - cached.timestamp >= cached.ttl) {
      this.cache.delete(key)
      generalLogger.debug('[ResponseCache] Entry expired and removed', { key })
      return undefined
    }

    return cached.data as T
  }

  /**
   * Invalidate (remove) a cache entry
   */
  invalidate(key: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
      generalLogger.debug('[ResponseCache] Entry invalidated', { key })
    }
  }

  /**
   * Invalidate multiple entries by prefix
   * Useful for invalidating all entries related to a resource
   */
  invalidatePrefix(prefix: string): number {
    let count = 0

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        count++
      }
    }

    if (count > 0) {
      generalLogger.info('[ResponseCache] Entries invalidated by prefix', {
        prefix,
        count,
      })
    }

    return count
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size

    this.cache.clear()
    this.hitCount = 0
    this.missCount = 0

    if (size > 0) {
      generalLogger.info('[ResponseCache] Cache cleared', { entries_removed: size })
    }
  }

  /**
   * Evict oldest (LRU) cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      generalLogger.debug('[ResponseCache] Oldest entry evicted (LRU)', {
        key: oldestKey,
        age_ms: Date.now() - oldestTimestamp,
      })
    }
  }

  /**
   * Clean up expired entries
   * Should be called periodically (e.g., every 5 minutes)
   */
  cleanupExpired(): number {
    const now = Date.now()
    let count = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key)
        count++
      }
    }

    if (count > 0) {
      generalLogger.info('[ResponseCache] Expired entries cleaned up', {
        count,
        remaining: this.cache.size,
      })
    }

    return count
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    hitCount: number
    missCount: number
    hitRate: number
    totalRequests: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate(),
      totalRequests: this.hitCount + this.missCount,
    }
  }

  /**
   * Calculate cache hit rate (0-1)
   */
  private getHitRate(): number {
    const total = this.hitCount + this.missCount
    return total > 0 ? this.hitCount / total : 0
  }

  /**
   * Check if key is cached and fresh
   */
  has(key: string): boolean {
    const cached = this.cache.get(key)

    if (!cached) {
      return false
    }

    const now = Date.now()
    return now - cached.timestamp < cached.ttl
  }
}

// Export singleton instance
export const responseCache = new ResponseCache(100)

function cleanupResponseCache(): void {
  responseCache.cleanupExpired()
}

const responseCacheCleanupInterval = createManagedInterval(
  cleanupResponseCache,
  RESPONSE_CACHE_CLEANUP_INTERVAL_MS
)

export function startResponseCacheCleanup(options?: ManagedIntervalStartOptions): void {
  responseCacheCleanupInterval.start(options)
}

export function stopResponseCacheCleanup(options?: ManagedIntervalStopOptions): void {
  responseCacheCleanupInterval.stop(options)
}

// Auto cleanup expired entries every 5 minutes
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  startResponseCacheCleanup()
}
