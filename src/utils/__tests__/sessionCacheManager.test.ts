/**
 * SessionCacheManager Tests
 *
 * Tests for cache versioning and completeness validation:
 * - Cache versioning (Phase 3)
 * - Incomplete cache detection
 * - Stale incomplete cache invalidation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../types/valuation'
import { SessionCacheManager } from '../sessionCacheManager'

describe('SessionCacheManager - Cache Versioning & Completeness', () => {
  let cacheManager: SessionCacheManager
  const mockReportId = 'val_test_456'

  const completeSession: ValuationSession = {
    reportId: mockReportId,
    currentView: 'manual',
    dataSource: 'manual',
    sessionData: { company_name: 'Test Corp' },
    partialData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    htmlReport: '<html>Complete Report</html>',
    valuationResult: {
      valuation_id: 'val_123',
      final_valuation_eur: 1000000,
    } as any,
  }

  const incompleteSession: ValuationSession = {
    reportId: mockReportId,
    currentView: 'manual',
    dataSource: 'manual',
    sessionData: { company_name: 'Test Corp' },
    partialData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    // No htmlReport - INCOMPLETE
  }

  beforeEach(() => {
    cacheManager = SessionCacheManager.getInstance()
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Cache Versioning (Phase 3)', () => {
    it('should include version field when caching session', () => {
      cacheManager.set(mockReportId, completeSession)

      const cached = localStorage.getItem(`upswitch_session_cache_${mockReportId}`)
      expect(cached).toBeTruthy()
      if (!cached) throw new Error('Expected cached session')

      const parsed = JSON.parse(cached)
      expect(parsed.version).toBeTruthy()
      expect(parsed.version).toBe(completeSession.updatedAt?.toString())
    })

    it('should use Date.now() as version if updatedAt is missing', () => {
      const sessionWithoutUpdatedAt = {
        ...completeSession,
        updatedAt: undefined,
      } as ValuationSession

      const before = Date.now()
      cacheManager.set(mockReportId, sessionWithoutUpdatedAt)
      const after = Date.now()

      const cached = localStorage.getItem(`upswitch_session_cache_${mockReportId}`)
      expect(cached).toBeTruthy()
      if (!cached) throw new Error('Expected cached session')
      const parsed = JSON.parse(cached)

      const versionMs = Date.parse(parsed.version)
      expect(Number.isFinite(versionMs)).toBe(true)
      // validateSessionData assigns updatedAt inside set(); allow clock slack vs Date.parse
      expect(versionMs).toBeGreaterThanOrEqual(before - 2000)
      expect(versionMs).toBeLessThanOrEqual(after + 2000)
    })
  })

  describe('Cache Completeness Validation', () => {
    it('should return complete session with HTML report', () => {
      cacheManager.set(mockReportId, completeSession)

      const result = cacheManager.get(mockReportId)

      expect(result).toBeTruthy()
      // HTML is stripped from localStorage; valuation data is retained for completeness checks
      expect(result?.htmlReport).toBeUndefined()
      expect(result?.valuationResult).toBeTruthy()
    })

    it('should return incomplete session if cache is fresh (<10 min)', () => {
      cacheManager.set(mockReportId, incompleteSession)

      const result = cacheManager.get(mockReportId)

      // Should return incomplete session if it's fresh
      expect(result).toBeTruthy()
      expect(result?.htmlReport).toBeUndefined()
    })

    it('should INVALIDATE incomplete stale cache (>10 min)', () => {
      // Set cache with old timestamp
      const cached = {
        session: incompleteSession,
        cachedAt: Date.now() - 15 * 60 * 1000, // 15 minutes ago
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        version: incompleteSession.updatedAt?.toString() || Date.now().toString(),
      }

      localStorage.setItem(`upswitch_session_cache_${mockReportId}`, JSON.stringify(cached))

      const result = cacheManager.get(mockReportId)

      // Should return null (cache invalidated)
      expect(result).toBeNull()

      // Cache should be deleted
      const deletedCache = localStorage.getItem(`upswitch_session_cache_${mockReportId}`)
      expect(deletedCache == null).toBe(true)
    })

    it('should NOT invalidate complete stale cache (>10 min)', () => {
      // Set complete cache with old timestamp
      const cached = {
        session: completeSession,
        cachedAt: Date.now() - 15 * 60 * 1000, // 15 minutes ago
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        version: completeSession.updatedAt?.toString() || Date.now().toString(),
      }

      localStorage.setItem(`upswitch_session_cache_${mockReportId}`, JSON.stringify(cached))

      const result = cacheManager.get(mockReportId)

      // Should return complete session even if stale
      expect(result).toBeTruthy()
      expect(result?.valuationResult).toBeTruthy()
    })
  })

  describe('Edge Cases', () => {
    it('should handle corrupted cache gracefully', () => {
      localStorage.setItem(`upswitch_session_cache_${mockReportId}`, 'invalid json')

      const result = cacheManager.get(mockReportId)

      expect(result).toBeNull()

      // Cache should be deleted
      const deletedCache = localStorage.getItem(`upswitch_session_cache_${mockReportId}`)
      expect(deletedCache == null).toBe(true)
    })

    it('should handle expired cache', () => {
      const cached = {
        session: completeSession,
        cachedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        expiresAt: Date.now() - 1 * 60 * 60 * 1000, // Expired 1 hour ago
        version: completeSession.updatedAt?.toString() || Date.now().toString(),
      }

      localStorage.setItem(`upswitch_session_cache_${mockReportId}`, JSON.stringify(cached))

      const result = cacheManager.get(mockReportId)

      // Should return null (expired)
      expect(result).toBeNull()
    })

    it('should handle session with htmlReport', () => {
      const partiallyCompleteSession = {
        ...incompleteSession,
        htmlReport: '<html>Report only</html>',
        valuationResult: { valuation_id: 'v1', final_valuation_eur: 1 } as any,
      }

      cacheManager.set(mockReportId, partiallyCompleteSession)

      const result = cacheManager.get(mockReportId)

      expect(result).toBeTruthy()
      expect(result?.htmlReport).toBeUndefined()
      expect(result?.valuationResult).toBeTruthy()
    })
  })

  describe('Performance', () => {
    it('should retrieve from cache in <5ms', () => {
      cacheManager.set(mockReportId, completeSession)

      const start = performance.now()
      cacheManager.get(mockReportId)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(5)
    })

    it('should set cache in <10ms', () => {
      const start = performance.now()
      cacheManager.set(mockReportId, completeSession)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(10)
    })
  })
})
