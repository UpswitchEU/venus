/**
 * Session Error Handlers Tests
 *
 * Test session creation, conflict resolution, and fallback strategies.
 *
 * @module utils/__tests__/sessionErrorHandlers.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkError } from '../errors/ApplicationErrors'
import { createFallbackSession, handle409Conflict } from '../sessionErrorHandlers'

// Mock backend API
vi.mock('../../services/backendApi', () => ({
  backendAPI: {
    getValuationSession: vi.fn(),
    createValuationSession: vi.fn(),
  },
}))

describe('sessionErrorHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handle409Conflict', () => {
    it('should load existing session on conflict', async () => {
      const mockSession = {
        sessionId: 'session_123',
        reportId: 'val_123',
        currentView: 'manual',
        createdAt: '2025-12-13T10:00:00Z',
        updatedAt: '2025-12-13T10:00:00Z',
        partialData: {},
        sessionData: {},
      }

      const { backendAPI } = await import('../../services/backendApi')
      vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
        session: mockSession,
      } as any)

      const result = await handle409Conflict('val_123', null)

      expect(result).toBeDefined()
      expect(result?.reportId).toBe('val_123')
      expect(result?.createdAt).toBeInstanceOf(Date)
      expect(backendAPI.getValuationSession).toHaveBeenCalledWith('val_123')
    })

    it('should merge prefilled query', async () => {
      const mockSession = {
        sessionId: 'session_123',
        reportId: 'val_123',
        currentView: 'conversational',
        createdAt: '2025-12-13T10:00:00Z',
        updatedAt: '2025-12-13T10:00:00Z',
        partialData: {},
        sessionData: {},
      }

      const { backendAPI } = await import('../../services/backendApi')
      vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
        session: mockSession,
      } as any)

      const result = await handle409Conflict('val_123', 'Restaurant')

      expect(result?.partialData).toHaveProperty('_prefilledQuery', 'Restaurant')
    })

    it('should return null if session not found', async () => {
      const { backendAPI } = await import('../../services/backendApi')
      vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
        session: null,
      } as any)

      const result = await handle409Conflict('val_123', null)

      expect(result).toBeNull()
    })

    it('should return null on load error', async () => {
      const { backendAPI } = await import('../../services/backendApi')
      vi.mocked(backendAPI.getValuationSession).mockRejectedValue(
        new NetworkError('Connection failed')
      )

      const result = await handle409Conflict('val_123', null)

      expect(result).toBeNull()
    })
  })

  describe('createFallbackSession', () => {
    it('should create local session', () => {
      const session = createFallbackSession('val_123', 'manual', null, new NetworkError())

      expect(session.reportId).toBe('val_123')
      expect(session.currentView).toBe('manual')
      expect(session.dataSource).toBe('manual')
      expect(session.createdAt).toBeInstanceOf(Date)
      expect(session.updatedAt).toBeInstanceOf(Date)
    })

    it('should include prefilled query', () => {
      const session = createFallbackSession('val_123', 'conversational', 'Restaurant')

      expect(session.partialData).toHaveProperty('_prefilledQuery', 'Restaurant')
    })

    it('should work without error', () => {
      const session = createFallbackSession('val_123', 'manual', null)

      expect(session).toBeDefined()
      expect(session.reportId).toBe('val_123')
    })
  })
})
