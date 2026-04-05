import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NameGenerator } from '../../utils/nameGenerator'

const mockFns = vi.hoisted(() => ({
  updateValuationSession: vi.fn(),
  updateSession: vi.fn(),
  saveSession: vi.fn(),
}))

const storeMock = vi.hoisted(() => {
  const hook = vi.fn()
  ;(hook as any).getState = vi.fn()
  return { hook }
})

type MockSessionState = {
  session: { reportId: string; name?: string } | null
  updateSession: typeof mockFns.updateSession
  saveSession: typeof mockFns.saveSession
  hydrateSession: ReturnType<typeof vi.fn>
}

let mockStoreState: MockSessionState

vi.mock('../../services/backendApi', () => ({
  backendAPI: {
    updateValuationSession: mockFns.updateValuationSession,
  },
}))

vi.mock('../../store/useSessionStore', () => ({
  useSessionStore: storeMock.hook,
}))

vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>()
  return {
    ...actual,
    generalLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import { useValuationToolbarName } from './useValuationToolbarName'

describe('useValuationToolbarName', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockStoreState = {
      session: { reportId: 'val_test_123', name: 'Old Name' },
      updateSession: mockFns.updateSession.mockImplementation((updates: { name?: string }) => {
        mockStoreState.session = {
          ...(mockStoreState.session || { reportId: 'val_test_123' }),
          ...updates,
        }
      }),
      saveSession: mockFns.saveSession.mockResolvedValue(undefined),
      hydrateSession: vi.fn(),
    }

    storeMock.hook.mockImplementation((selector: (state: MockSessionState) => unknown) =>
      selector(mockStoreState)
    )
    ;(storeMock.hook as any).getState.mockImplementation(() => mockStoreState)
  })

  it('uses centralized session save for explicit name edits', async () => {
    const { result } = renderHook(() =>
      useValuationToolbarName({
        initialName: 'Old Name',
        reportId: 'val_test_123',
      })
    )

    act(() => {
      result.current.handleNameEdit()
      result.current.setEditedName('New Name')
    })

    await act(async () => {
      await result.current.handleNameSave()
    })

    expect(mockFns.updateSession).toHaveBeenCalledWith({ name: 'New Name' })
    expect(mockFns.saveSession).toHaveBeenCalledWith('user')
    expect(mockFns.updateValuationSession).not.toHaveBeenCalled()
  })

  it('uses centralized autosave when company name introduces an auto-generated name', async () => {
    mockStoreState.session = { reportId: 'val_test_123' }

    const { rerender } = renderHook(
      ({ companyName }) =>
        useValuationToolbarName({
          reportId: 'val_test_123',
          companyName,
        }),
      {
        initialProps: { companyName: undefined as string | undefined },
      }
    )

    rerender({ companyName: 'Acme BV' })

    await waitFor(() => {
      expect(mockFns.updateSession).toHaveBeenCalledWith({
        name: NameGenerator.generateFromCompany('Acme BV'),
      })
    })

    expect(mockFns.saveSession).toHaveBeenCalledWith('autosave')
    expect(mockFns.updateValuationSession).not.toHaveBeenCalled()
  })
})
