/**
 * Business Types Cache Service for Valuation Tester
 *
 * Handles caching of business types data in localStorage with TTL support.
 * Provides fallback mechanisms and cache invalidation strategies.
 *
 * @author UpSwitch CTO Team
 * @version 1.0.0
 */

import { generalLogger } from '../../utils/logger'
import type { BusinessType } from '../businessTypesApi.helpers'

// Define BusinessCategory interface locally since it's not exported
export interface BusinessCategory {
  id: string
  name: string
  icon: string
}

// ============================================================================
// TYPES
// ============================================================================

export interface CacheEntry<T> {
  data: T
  timestamp: number
  version: string
  ttl: number // Time to live in milliseconds
}

export interface BusinessTypesCacheData {
  businessTypes: BusinessType[]
  categories: BusinessCategory[]
  popularTypes: BusinessType[]
}

export interface CacheStats {
  hitCount: number
  missCount: number
  size: number
  lastUpdated: number
  isExpired: boolean
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_CONFIG = {
  VERSION: '1.5.0', // Bumped: parse Titan Decimal.js envelopes for business-type numeric metadata.
  TTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  KEYS: {
    BUSINESS_TYPES: 'upswitch_valuation_tester_business_types_cache',
    CATEGORIES: 'upswitch_valuation_tester_categories_cache',
    POPULAR_TYPES: 'upswitch_valuation_tester_popular_types_cache',
    STATS: 'upswitch_valuation_tester_cache_stats',
  },
  MAX_SIZE: 5 * 1024 * 1024, // 5MB max cache size
  COMPRESSION_THRESHOLD: 1024 * 1024, // 1MB - compress if larger
}

// ============================================================================
// CACHE SERVICE CLASS
// ============================================================================

export class BusinessTypesCacheService {
  private stats: CacheStats

  constructor() {
    this.stats = this.loadStats()
  }

  // ============================================================================
  // CORE CACHE OPERATIONS
  // ============================================================================

  /**
   * Safely set localStorage item with quota error handling
   */
  private setItemWithQuotaHandling(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        generalLogger.warn(
          '[BusinessTypesCache] Storage quota exceeded, clearing cache and retrying'
        )
        this.clearAll()
        try {
          localStorage.setItem(key, value)
        } catch (retryError) {
          generalLogger.error('[BusinessTypesCache] Failed to cache even after clearing storage', {
            error: retryError,
          })
          throw retryError
        }
      } else {
        throw error
      }
    }
  }

  /**
   * Store business types data in cache
   */
  public async setBusinessTypes(data: BusinessTypesCacheData): Promise<void> {
    try {
      const cacheEntry: CacheEntry<BusinessTypesCacheData> = {
        data,
        timestamp: Date.now(),
        version: CACHE_CONFIG.VERSION,
        ttl: CACHE_CONFIG.TTL,
      }

      const serialized = JSON.stringify(cacheEntry)

      // Check size before storing
      if (serialized.length > CACHE_CONFIG.MAX_SIZE) {
        generalLogger.warn(
          '[BusinessTypesCache] Data too large for cache, storing without some metadata'
        )
        // Store without some optional fields to reduce size
        const compressedEntry = {
          data: {
            businessTypes: data.businessTypes,
            categories: data.categories,
            popularTypes: data.popularTypes,
          },
          timestamp: cacheEntry.timestamp,
          version: cacheEntry.version,
          ttl: cacheEntry.ttl,
        }
        this.setItemWithQuotaHandling(
          CACHE_CONFIG.KEYS.BUSINESS_TYPES,
          JSON.stringify(compressedEntry)
        )
      } else {
        this.setItemWithQuotaHandling(CACHE_CONFIG.KEYS.BUSINESS_TYPES, serialized)
      }

      this.updateStats(true)
      generalLogger.debug('[BusinessTypesCache] Data cached successfully', {
        businessTypes: data.businessTypes.length,
        categories: data.categories.length,
        popularTypes: data.popularTypes.length,
      })
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Failed to cache data', { error })
      this.updateStats(false)
    }
  }

  /**
   * Retrieve business types data from cache
   */
  public async getBusinessTypes(): Promise<BusinessTypesCacheData | null> {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.KEYS.BUSINESS_TYPES)

      if (!cached) {
        this.updateStats(false)
        return null
      }

      const cacheEntry: CacheEntry<BusinessTypesCacheData> = JSON.parse(cached)

      // Check if cache is expired
      if (this.isExpired(cacheEntry)) {
        generalLogger.debug('[BusinessTypesCache] Cache expired, removing')
        this.clearBusinessTypes()
        this.updateStats(false)
        return null
      }

      // Check version compatibility
      if (cacheEntry.version !== CACHE_CONFIG.VERSION) {
        generalLogger.debug('[BusinessTypesCache] Version mismatch, clearing cache')
        this.clearBusinessTypes()
        this.updateStats(false)
        return null
      }

      this.updateStats(true)

      // Enhanced monitoring metrics
      const cacheAge = Date.now() - cacheEntry.timestamp
      const hitRate = this.stats.hitCount / (this.stats.hitCount + this.stats.missCount)
      const cacheSize = this.getCacheSize()

      generalLogger.debug('[BusinessTypesCache] Cache hit', {
        businessTypes: cacheEntry.data.businessTypes.length,
        categories: cacheEntry.data.categories.length,
        popularTypes: cacheEntry.data.popularTypes.length,
        age: cacheAge,
        size: cacheSize,
        hitRate: hitRate.toFixed(2),
        totalHits: this.stats.hitCount,
        totalMisses: this.stats.missCount,
      })

      return cacheEntry.data
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Failed to retrieve cached data', { error })
      this.clearBusinessTypes()
      this.updateStats(false)
      return null
    }
  }

  /**
   * Synchronous lookup for UI display helpers that need cached metadata during render.
   * Keeps cache envelope/version/TTL parsing owned by the cache service.
   */
  public getBusinessTypeById(businessTypeId: string): BusinessType | null {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.KEYS.BUSINESS_TYPES)
      if (!cached) return null

      const cacheEntry: CacheEntry<BusinessTypesCacheData> = JSON.parse(cached)
      if (this.isExpired(cacheEntry) || cacheEntry.version !== CACHE_CONFIG.VERSION) {
        return null
      }

      return (
        cacheEntry.data.businessTypes.find((businessType) => businessType.id === businessTypeId) ??
        null
      )
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Failed to read business type by id', {
        error,
        businessTypeId,
      })
      return null
    }
  }

  /**
   * Check if cache exists and is valid
   */
  public hasValidCache(): boolean {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.KEYS.BUSINESS_TYPES)
      if (!cached) return false

      const cacheEntry: CacheEntry<BusinessTypesCacheData> = JSON.parse(cached)
      return !this.isExpired(cacheEntry) && cacheEntry.version === CACHE_CONFIG.VERSION
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Error checking cache validity', { error })
      return false
    }
  }

  /**
   * Clear business types cache
   */
  public clearBusinessTypes(): void {
    try {
      localStorage.removeItem(CACHE_CONFIG.KEYS.BUSINESS_TYPES)
      generalLogger.debug('[BusinessTypesCache] Business types cache cleared')
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Error clearing business types cache', { error })
    }
  }

  /**
   * Clear all cache
   */
  public clearAll(): void {
    try {
      Object.values(CACHE_CONFIG.KEYS).forEach((key) => {
        localStorage.removeItem(key)
      })
      generalLogger.debug('[BusinessTypesCache] All cache cleared')
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Error clearing all cache', { error })
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Get cache size in bytes
   */
  public getCacheSize(): number {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.KEYS.BUSINESS_TYPES)
      return cached ? new Blob([cached]).size : 0
    } catch (error) {
      console.error('[BusinessTypesCache] Error getting cache size:', error)
      return 0
    }
  }

  /**
   * Get cache age in milliseconds
   */
  public getCacheAge(): number {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.KEYS.BUSINESS_TYPES)
      if (!cached) return 0

      const cacheEntry: CacheEntry<BusinessTypesCacheData> = JSON.parse(cached)
      return Date.now() - cacheEntry.timestamp
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Error getting cache age', { error })
      return 0
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private isExpired(cacheEntry: CacheEntry<BusinessTypesCacheData>): boolean {
    const now = Date.now()
    return now - cacheEntry.timestamp > cacheEntry.ttl
  }

  private loadStats(): CacheStats {
    const defaultStats: CacheStats = {
      hitCount: 0,
      missCount: 0,
      size: 0,
      lastUpdated: Date.now(),
      isExpired: true,
    }

    // localStorage is only available in browser; skip during SSG/build (Node.js)
    if (typeof window === 'undefined') {
      return defaultStats
    }

    try {
      const stats = localStorage.getItem(CACHE_CONFIG.KEYS.STATS)
      if (stats) {
        return JSON.parse(stats)
      }
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Error loading stats', { error })
    }

    return defaultStats
  }

  private saveStats(): void {
    try {
      localStorage.setItem(CACHE_CONFIG.KEYS.STATS, JSON.stringify(this.stats))
    } catch (error) {
      generalLogger.error('[BusinessTypesCache] Failed to save stats', { error })
    }
  }

  private updateStats(hit: boolean): void {
    if (hit) {
      this.stats.hitCount++
    } else {
      this.stats.missCount++

      // Log cache miss with monitoring data
      const totalRequests = this.stats.hitCount + this.stats.missCount
      const hitRate = totalRequests > 0 ? this.stats.hitCount / totalRequests : 0

      generalLogger.debug('[BusinessTypesCache] Cache miss', {
        reason: 'No cache or expired',
        hitRate: hitRate.toFixed(2),
        totalHits: this.stats.hitCount,
        totalMisses: this.stats.missCount,
        cacheSize: this.getCacheSize(),
      })
    }

    this.stats.size = this.getCacheSize()
    this.stats.lastUpdated = Date.now()
    this.stats.isExpired = !this.hasValidCache()

    this.saveStats()
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const businessTypesCache = new BusinessTypesCacheService()

export default businessTypesCache
