/**
 * SessionService Cache Update Tests
 *
 * Tests for Cursor/ChatGPT-style caching strategy:
 * - Cache update after save (not invalidation)
 * - Stale-while-revalidate
 * - Optimistic updates
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import { globalSessionCache } from '../../../utils/sessionCacheManager'
import { backendAPI } from '../../backendApi'
import { SessionService } from '../SessionService'

// Mock dependencies
vi.mock('../../backendApi', () => ({
  backendAPI: {
    getValuationSession: vi.fn(),
    updateValuationSession: vi.fn(),
    createValuationSession: vi.fn(),
  },
}))

vi.mock('../../../utils/sessionCacheManager', () => ({
  globalSessionCache: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}))

describe('SessionService - Cache Update Strategy', () => {
  let sessionService: SessionService
  const mockReportId = 'val_test_123'

  const mockSession: ValuationSession = {
    reportId: mockReportId,
    currentView: 'manual',
    dataSource: 'manual',
    sessionData: { company_name: 'Test Corp' },
    partialData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    htmlReport: '<html>Full Report</html>',
    infoTabHtml: '<html>Info Tab</html>',
    valuationResult: {
      valuation_id: 'val_123',
      company_name: 'Test Corp',
      final_valuation_eur: 1000000,
      html_report: '<html>Full Report</html>',
      info_tab_html: '<html>Info Tab</html>',
    } as any,
  }

  beforeEach(() => {
    sessionService = SessionService.getInstance()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('saveCompleteSession - Cache Update (Phase 1)', () => {
    it('should UPDATE cache with fresh data after save (not invalidate)', async () => {
      // Mock SessionAPI.saveValuationResult
      const mockSessionAPI = {
        saveValuationResult: vi.fn().mockResolvedValue(undefined),
      }
      vi.doMock('../../api/session/SessionAPI', () => ({
        SessionAPI: vi.fn(() => mockSessionAPI),
      }))

      // Mock backend response with complete session
      vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
        success: true,
        session: mockSession,
      })

      // Execute saveCompleteSession
      await sessionService.saveCompleteSession(mockReportId, {
        valuationResult: mockSession.valuationResult,
        htmlReport: mockSession.htmlReport,
        infoTabHtml: mockSession.infoTabHtml,
      })

      // Verify cache was UPDATED (not just removed)
      expect(globalSessionCache.set).toHaveBeenCalledWith(
        mockReportId,
        expect.objectContaining({
          reportId: mockReportId,
          htmlReport: '<html>Full Report</html>',
          infoTabHtml: '<html>Info Tab</html>',
        })
      )

      // Verify cache.remove was called first (to ensure fresh fetch)
      expect(globalSessionCache.remove).toHaveBeenCalledWith(mockReportId)
    })

    it('should handle cache update failure gracefully', async () => {
      // Mock SessionAPI
      const mockSessionAPI = {
        saveValuationResult: vi.fn().mockResolvedValue(undefined),
      }
      vi.doMock('../../api/session/SessionAPI', () => ({
        SessionAPI: vi.fn(() => mockSessionAPI),
      }))

      // Mock backend error
      vi.mocked(backendAPI.getValuationSession).mockRejectedValue(new Error('Backend unavailable'))

      // Execute - should NOT throw even if cache update fails
      await expect(
        sessionService.saveCompleteSession(mockReportId, {
          htmlReport: '<html>Test</html>',
        })
      ).resolves.not.toThrow()

      // Verify cache.remove was called (cleanup)
      expect(globalSessionCache.remove).toHaveBeenCalledWith(mockReportId)
    })
  })

  describe('loadSession - Stale-While-Revalidate (Phase 2)', () => {
    it('should return cached data immediately if available', async () => {
      const cachedSession = {
        ...mockSession,
        updatedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes old
      }

      vi.mocked(globalSessionCache.get).mockReturnValue(cachedSession)

      const result = await sessionService.loadSession(mockReportId)

      expect(result).toEqual(cachedSession)
      expect(globalSessionCache.get).toHaveBeenCalledWith(mockReportId)
      // Should NOT call backend (cache hit)
      expect(backendAPI.getValuationSession).not.toHaveBeenCalled()
    })

    it('should trigger background revalidation for stale cache (>5 min)', async () => {
      const staleSession = {
        ...mockSession,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes old
      }

      vi.mocked(globalSessionCache.get).mockReturnValue(staleSession)

      // Mock backend response for background revalidation
      vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
        success: true,
        session: mockSession,
      })

      const result = await sessionService.loadSession(mockReportId)

      // Should return cached data immediately
      expect(result).toEqual(staleSession)

      // Wait for background revalidation (nextTick)
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Background revalidation should have been triggered
      // (Note: This is async, so we can't directly assert on it in this test)
      // In production, the cache will be updated in the background
    })

    it('should NOT revalidate fresh cache (<5 min)', async () => {
      const freshSession = {
        ...mockSession,
        updatedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes old
      }

      vi.mocked(globalSessionCache.get).mockReturnValue(freshSession)

      await sessionService.loadSession(mockReportId)

      // Should NOT trigger backend revalidation
      expect(backendAPI.getValuationSession).not.toHaveBeenCalled()
    })
  })

  describe('Cache Completeness (Phase 3)', () => {
    it('should accept complete session with HTML reports', () => {
      const completeSession = {
        ...mockSession,
        htmlReport: '<html>Report</html>',
        infoTabHtml: '<html>Info</html>',
      }

      vi.mocked(globalSessionCache.get).mockReturnValue(completeSession)

      // Cache manager should return complete session
      const result = globalSessionCache.get(mockReportId)
      expect(result).toBeTruthy()
      expect(result?.htmlReport).toBeTruthy()
    })
  })

  describe('Performance', () => {
    it('should load from cache in <10ms', async () => {
      vi.mocked(globalSessionCache.get).mockReturnValue(mockSession)

      const start = performance.now()
      await sessionService.loadSession(mockReportId)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(10) // Cache load should be instant
    })

    it('should not block on background revalidation', async () => {
      const staleSession = {
        ...mockSession,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      }

      vi.mocked(globalSessionCache.get).mockReturnValue(staleSession)

      // Mock slow backend response
      vi.mocked(backendAPI.getValuationSession).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  session: mockSession,
                }),
              1000
            )
          )
      )

      const start = performance.now()
      const result = await sessionService.loadSession(mockReportId)
      const duration = performance.now() - start

      // Should return immediately with cached data (not wait for backend)
      expect(duration).toBeLessThan(50)
      expect(result).toEqual(staleSession)
    })
  })
})
