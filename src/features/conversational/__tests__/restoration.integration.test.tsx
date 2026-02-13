/**
 * Restoration Integration Tests
 *
 * End-to-end tests for session restoration and flow switching.
 *
 * @module features/conversational/__tests__/restoration.integration.test
 */

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationalLayout } from '../components/ConversationalLayout'

// Mock dependencies
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../../services/guestCreditService', () => ({
  guestCreditService: {
    getOrCreateSession: vi.fn().mockResolvedValue({ session_id: 'guest_123' }),
  },
}))

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    getValuationSession: vi.fn(),
    createValuationSession: vi.fn(),
  },
}))

vi.mock('../../../services/api/utility/UtilityAPI', () => ({
  UtilityAPI: vi.fn().mockImplementation(() => ({
    getConversationStatus: vi.fn().mockResolvedValue({ exists: false }),
    getConversationHistory: vi.fn().mockResolvedValue({ exists: false, messages: [] }),
  })),
}))

describe('Restoration Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.innerWidth for mobile detection
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  describe('Fresh Session Flow', () => {
    it('should initialize without restoration for new session', async () => {
      const onComplete = vi.fn()

      render(
        <ConversationalLayout
          reportId="val_new_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(() => {
        // Should render without errors
        expect(screen.queryByText(/Error/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Existing Session Flow', () => {
    it('should restore conversation with existing messages', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockResolvedValue({
        exists: true,
        session_id: 'python_123',
        status: 'active',
        message_count: 2,
      })

      const mockHistory = vi.fn().mockResolvedValue({
        exists: true,
        messages: [
          {
            id: 'msg1',
            role: 'user',
            content: 'What is my business worth?',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg2',
            role: 'assistant',
            content: 'I can help you with that.',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: mockHistory,
          }) as any
      )

      const onComplete = vi.fn()

      render(
        <ConversationalLayout
          reportId="val_existing_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalled()
        expect(mockHistory).toHaveBeenCalled()
      })
    })
  })

  describe('Error Recovery Flow', () => {
    it('should handle restoration failure gracefully', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockRejectedValue(new Error('API unavailable'))

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const onComplete = vi.fn()
      const onError = vi.fn()

      render(
        <ConversationalLayout
          reportId="val_error_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(
        () => {
          // Should still render (graceful degradation)
          expect(screen.queryByText(/conversation/i)).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })
  })

  describe('Flow Switching', () => {
    it('should preserve session when switching flows', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: vi.fn().mockResolvedValue({
              exists: false,
              messages: [],
            }),
          }) as any
      )

      const onComplete = vi.fn()

      const { rerender } = render(
        <ConversationalLayout
          reportId="val_123"
          onComplete={onComplete}
          initialQuery="Restaurant"
          autoSend={false}
        />
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalled()
      })

      // Simulate flow switch (same reportId)
      rerender(
        <ConversationalLayout
          reportId="val_123" // Same ID
          onComplete={onComplete}
          initialQuery="Restaurant"
          autoSend={false}
        />
      )

      // Should not trigger additional restoration
      await waitFor(() => {
        // Status should not be called again
        expect(mockStatus).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('New Report Flow', () => {
    it('should reset and restore for new reportId', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: vi.fn().mockResolvedValue({
              exists: false,
              messages: [],
            }),
          }) as any
      )

      const onComplete = vi.fn()

      const { rerender } = render(
        <ConversationalLayout
          reportId="val_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalledTimes(1)
      })

      // Change to new reportId
      rerender(
        <ConversationalLayout
          reportId="val_456" // Different ID
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      // Should trigger new restoration
      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalledTimes(2)
      })
    })
  })
})

/**
 * Restoration Integration Tests
 *
 * End-to-end tests for session restoration and flow switching.
 *
 * @module features/conversational/__tests__/restoration.integration.test
 */

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationalLayout } from '../components/ConversationalLayout'

// Mock dependencies
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../../services/guestCreditService', () => ({
  guestCreditService: {
    getOrCreateSession: vi.fn().mockResolvedValue({ session_id: 'guest_123' }),
  },
}))

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    getValuationSession: vi.fn(),
    createValuationSession: vi.fn(),
  },
}))

vi.mock('../../../services/api/utility/UtilityAPI', () => ({
  UtilityAPI: vi.fn().mockImplementation(() => ({
    getConversationStatus: vi.fn().mockResolvedValue({ exists: false }),
    getConversationHistory: vi.fn().mockResolvedValue({ exists: false, messages: [] }),
  })),
}))

describe('Restoration Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.innerWidth for mobile detection
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  describe('Fresh Session Flow', () => {
    it('should initialize without restoration for new session', async () => {
      const onComplete = vi.fn()

      render(
        <ConversationalLayout
          reportId="val_new_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(() => {
        // Should render without errors
        expect(screen.queryByText(/Error/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Existing Session Flow', () => {
    it('should restore conversation with existing messages', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockResolvedValue({
        exists: true,
        session_id: 'python_123',
        status: 'active',
        message_count: 2,
      })

      const mockHistory = vi.fn().mockResolvedValue({
        exists: true,
        messages: [
          {
            id: 'msg1',
            role: 'user',
            content: 'What is my business worth?',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg2',
            role: 'assistant',
            content: 'I can help you with that.',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: mockHistory,
          }) as any
      )

      const onComplete = vi.fn()

      render(
        <ConversationalLayout
          reportId="val_existing_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalled()
        expect(mockHistory).toHaveBeenCalled()
      })
    })
  })

  describe('Error Recovery Flow', () => {
    it('should handle restoration failure gracefully', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockRejectedValue(new Error('API unavailable'))

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
          }) as any
      )

      const onComplete = vi.fn()
      const onError = vi.fn()

      render(
        <ConversationalLayout
          reportId="val_error_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(
        () => {
          // Should still render (graceful degradation)
          expect(screen.queryByText(/conversation/i)).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })
  })

  describe('Flow Switching', () => {
    it('should preserve session when switching flows', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: vi.fn().mockResolvedValue({
              exists: false,
              messages: [],
            }),
          }) as any
      )

      const onComplete = vi.fn()

      const { rerender } = render(
        <ConversationalLayout
          reportId="val_123"
          onComplete={onComplete}
          initialQuery="Restaurant"
          autoSend={false}
        />
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalled()
      })

      // Simulate flow switch (same reportId)
      rerender(
        <ConversationalLayout
          reportId="val_123" // Same ID
          onComplete={onComplete}
          initialQuery="Restaurant"
          autoSend={false}
        />
      )

      // Should not trigger additional restoration
      await waitFor(() => {
        // Status should not be called again
        expect(mockStatus).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('New Report Flow', () => {
    it('should reset and restore for new reportId', async () => {
      const { UtilityAPI } = await import('../../../services/api/utility/UtilityAPI')

      const mockStatus = vi.fn().mockResolvedValue({ exists: false })

      vi.mocked(UtilityAPI).mockImplementation(
        () =>
          ({
            getConversationStatus: mockStatus,
            getConversationHistory: vi.fn().mockResolvedValue({
              exists: false,
              messages: [],
            }),
          }) as any
      )

      const onComplete = vi.fn()

      const { rerender } = render(
        <ConversationalLayout
          reportId="val_123"
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalledTimes(1)
      })

      // Change to new reportId
      rerender(
        <ConversationalLayout
          reportId="val_456" // Different ID
          onComplete={onComplete}
          initialQuery={null}
          autoSend={false}
        />
      )

      // Should trigger new restoration
      await waitFor(() => {
        expect(mockStatus).toHaveBeenCalledTimes(2)
      })
    })
  })
})
