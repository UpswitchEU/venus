/**
 * Auth Result Caching
 *
 * Caches successful auth results to reduce API calls
 * Implements LRU eviction for memory efficiency
 */

export interface CachedAuthResult {
  user: any
  timestamp: number
  expiresAt: number
}

interface CacheEntry {
  key: string
  value: CachedAuthResult
  lastAccessed: number
}

export class AuthCache {
  private cache: Map<string, CacheEntry> = new Map()
  private maxSize: number
  private ttl: number // Time to live in milliseconds

  constructor(maxSize: number = 10, ttl: number = 5 * 60 * 1000) {
    // Default: 10 entries, 5 minute TTL
    this.maxSize = maxSize
    this.ttl = ttl
  }

  /**
   * Generate cache key
   */
  private getCacheKey(userId?: string): string {
    // Cache key includes timestamp bucket (5 minute buckets)
    // This ensures cache invalidation after TTL
    const bucket = Math.floor(Date.now() / this.ttl)
    return `auth:${userId || 'guest'}:${bucket}`
  }

  /**
   * Get cached auth result
   */
  get(userId?: string): CachedAuthResult | null {
    const key = this.getCacheKey(userId)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check if expired
    if (Date.now() > entry.value.expiresAt) {
      this.cache.delete(key)
      return null
    }

    // Update last accessed time
    entry.lastAccessed = Date.now()
    return entry.value
  }

  /**
   * Set cached auth result
   */
  set(user: any, userId?: string): void {
    const key = this.getCacheKey(userId)
    const now = Date.now()

    // Evict if cache is full (LRU)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    const entry: CacheEntry = {
      key,
      value: {
        user,
        timestamp: now,
        expiresAt: now + this.ttl,
      },
      lastAccessed: now,
    }

    this.cache.set(key, entry)
  }

  /**
   * Invalidate cache for user
   */
  invalidate(userId?: string): void {
    const key = this.getCacheKey(userId)
    this.cache.delete(key)
  }

  /**
   * Invalidate all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.value.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    ttl: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    }
  }
}

// Singleton instance
let authCache: AuthCache | null = null

/**
 * Get auth cache instance
 */
export function getAuthCache(): AuthCache {
  if (!authCache) {
    authCache = new AuthCache()

    // Cleanup expired entries every minute
    setInterval(() => {
      authCache?.cleanup()
    }, 60 * 1000)
  }
  return authCache
}

/**
 * Cleanup auth cache (for testing)
 */
export function destroyAuthCache(): void {
  if (authCache) {
    authCache.clear()
    authCache = null
  }
}
