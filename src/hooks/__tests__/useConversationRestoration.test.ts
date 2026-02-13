/**
 * useConversationRestoration Hook Tests
 *
 * Test conversation restoration logic with fail-proof features.
 *
 * @module hooks/__tests__/useConversationRestoration.test
 */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConversationRestoration } from '../../features/conversational/hooks/useConversationRestoration'

// Mock UtilityAPI
vi.mock('../../services/api/utility/UtilityAPI', () => ({
  UtilityAPI: vi.fn().mockImplementation(() => ({
    getConversationStatus: vi.fn(),
    getConversationHistory: vi.fn(),
  })),
}))

describe('useConversationRestoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should start with not restored state', () => {
      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
        })
      )

      expect(result.current.state.isRestoring).toBe(false)
      expect(result.current.state.isRestored).toBe(false)
      expect(result.current.state.messages).toEqual([])
      expect(result.current.state.pythonSessionId).toBeNull()
      expect(result.current.state.error).toBeNull()
    })

    it('should not restore when disabled', () => {
      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: false,
        })
      )

      expect(result.current.state.isRestoring).toBe(false)
    })
  })

  describe('restore', () => {
    it('should call restore on mount when enabled', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
        })
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalled()
      })
    })

    it('should not call restore twice', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.isRestored).toBe(true)
      })

      // Manual call should not execute again
      await result.current.restore()

      // Should still be called only once (from auto-restore)
      expect(mockStatus).toHaveBeenCalledTimes(1)
    })
  })

  describe('reset', () => {
    it('should reset restoration state', async () => {
      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: false, // Disable auto-restore
        })
      )

      // Reset should work
      result.current.reset()

      expect(result.current.state.isRestored).toBe(false)
      expect(result.current.state.messages).toEqual([])
      expect(result.current.state.pythonSessionId).toBeNull()
    })
  })

  describe('callbacks', () => {
    it('should call onRestored when messages exist', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockMessages = [
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]

      const mockStatus = vi.fn().mockResolvedValue({
        exists: true,
        session_id: 'python_123',
      })

      const mockHistory = vi.fn().mockResolvedValue({
        exists: true,
        messages: mockMessages,
      })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: mockHistory,
          }) as any
      )

      const onRestored = vi.fn()

      renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
          onRestored,
        })
      )

      await waitFor(() => {
        expect(onRestored).toHaveBeenCalled()
      })

      expect(onRestored).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: 'Hello' })]),
        'python_123'
      )
    })

    it('should call onError when restoration fails', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockRejectedValue(new NetworkError('Connection failed'))

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const onError = vi.fn()

      renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
          onError,
        })
      )

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Connection failed'))
    })
  })

  describe('sessionId changes', () => {
    it('should reset and restore for new sessionId', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const { result, rerender } = renderHook(
        ({ sessionId }) =>
          useConversationRestoration({
            sessionId,
            enabled: true,
          }),
        {
          initialProps: { sessionId: 'val_123' },
        }
      )

      await waitFor(() => {
        expect(result.current.state.isRestored).toBe(true)
      })

      // Change sessionId
      rerender({ sessionId: 'val_456' })

      await waitFor(() => {
        // Should call restore again for new session
        expect(mockStatus).toHaveBeenCalledTimes(2)
      })
    })
  })
})

/**
 * useConversationRestoration Hook Tests
 *
 * Test conversation restoration logic with fail-proof features.
 *
 * @module hooks/__tests__/useConversationRestoration.test
 */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConversationRestoration } from '../../features/conversational/hooks/useConversationRestoration'

// Mock UtilityAPI
vi.mock('../../services/api/utility/UtilityAPI', () => ({
  UtilityAPI: vi.fn().mockImplementation(() => ({
    getConversationStatus: vi.fn(),
    getConversationHistory: vi.fn(),
  })),
}))

describe('useConversationRestoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should start with not restored state', () => {
      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
        })
      )

      expect(result.current.state.isRestoring).toBe(false)
      expect(result.current.state.isRestored).toBe(false)
      expect(result.current.state.messages).toEqual([])
      expect(result.current.state.pythonSessionId).toBeNull()
      expect(result.current.state.error).toBeNull()
    })

    it('should not restore when disabled', () => {
      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: false,
        })
      )

      expect(result.current.state.isRestoring).toBe(false)
    })
  })

  describe('restore', () => {
    it('should call restore on mount when enabled', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
        })
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalled()
      })
    })

    it('should not call restore twice', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
        })
      )

      await waitFor(() => {
        expect(result.current.state.isRestored).toBe(true)
      })

      // Manual call should not execute again
      await result.current.restore()

      // Should still be called only once (from auto-restore)
      expect(mockStatus).toHaveBeenCalledTimes(1)
    })
  })

  describe('reset', () => {
    it('should reset restoration state', async () => {
      const { result } = renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: false, // Disable auto-restore
        })
      )

      // Reset should work
      result.current.reset()

      expect(result.current.state.isRestored).toBe(false)
      expect(result.current.state.messages).toEqual([])
      expect(result.current.state.pythonSessionId).toBeNull()
    })
  })

  describe('callbacks', () => {
    it('should call onRestored when messages exist', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockMessages = [
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]

      const mockStatus = vi.fn().mockResolvedValue({
        exists: true,
        session_id: 'python_123',
      })

      const mockHistory = vi.fn().mockResolvedValue({
        exists: true,
        messages: mockMessages,
      })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: mockHistory,
          }) as any
      )

      const onRestored = vi.fn()

      renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
          onRestored,
        })
      )

      await waitFor(() => {
        expect(onRestored).toHaveBeenCalled()
      })

      expect(onRestored).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: 'Hello' })]),
        'python_123'
      )
    })

    it('should call onError when restoration fails', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockRejectedValue(new NetworkError('Connection failed'))

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const onError = vi.fn()

      renderHook(() =>
        useConversationRestoration({
          sessionId: 'val_123',
          enabled: true,
          onError,
        })
      )

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Connection failed'))
    })
  })

  describe('sessionId changes', () => {
    it('should reset and restore for new sessionId', async () => {
      const { UtilityAPI } = await import('../../services/api/utility/UtilityAPI')
      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const { result, rerender } = renderHook(
        ({ sessionId }) =>
          useConversationRestoration({
            sessionId,
            enabled: true,
          }),
        {
          initialProps: { sessionId: 'val_123' },
        }
      )

      await waitFor(() => {
        expect(result.current.state.isRestored).toBe(true)
      })

      // Change sessionId
      rerender({ sessionId: 'val_456' })

      await waitFor(() => {
        // Should call restore again for new session
        expect(mockStatus).toHaveBeenCalledTimes(2)
      })
    })
  })
})
