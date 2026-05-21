/**
 * Registry Cache Implementation
 *
 * LRU cache with TTL for registry requests
 */

import { serviceLogger } from '../../utils/logger'
import type { CachedData } from './types'

export class RegistryCache {
  private cache: Map<string, CachedData>
  private maxSize: number
  private ttl: number
  private accessOrder: string[]

  constructor(maxSize: number = 100, ttl: number = 5 * 60 * 1000) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttl = ttl
    this.accessOrder = []
  }

  /**
   * Get data from cache
   */
  get<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
      serviceLogger.debug('Cache entry expired', { key })
      return null
    }

    // Update access order for LRU
    this.updateAccessOrder(key)
    serviceLogger.debug('Cache hit', { key })
    return entry.data as T
  }

  /**
   * Set data in cache
   */
  set(key: string, data: unknown): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    this.cache.set(key, { data, timestamp: Date.now() })
    this.updateAccessOrder(key)
    serviceLogger.debug('Cache entry set', { key, size: this.cache.size })
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    serviceLogger.debug('Cache cleared')
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.removeFromAccessOrder(key)
    // Add to end (most recently used)
    this.accessOrder.push(key)
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return

    const lruKey = this.accessOrder[0]
    this.cache.delete(lruKey)
    this.accessOrder.shift()
    serviceLogger.debug('LRU entry evicted', { key: lruKey })
  }
}
