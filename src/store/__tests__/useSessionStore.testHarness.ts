import { vi } from 'vitest'
import type { ValuationSession } from '../../types/valuation'
import type { SessionStatus } from '../useSessionStore'

export const mockLoadSession = vi.fn()
export const mockUpdateSession = vi.fn()
export const mockHydrateSession = vi.fn()
export const mockSaveSession = vi.fn()
export const mockClearSession = vi.fn()
export const mockGetSession = vi.fn()

vi.mock('../../services/session/SessionEngineFactory', () => ({
  createSessionEngine: vi.fn(() => ({
    loadSession: mockLoadSession,
    updateSession: mockUpdateSession,
    hydrateSession: mockHydrateSession,
    saveSession: mockSaveSession,
    clearSession: mockClearSession,
    getSession: mockGetSession,
  })),
}))

vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>()
  const generalLoggerMock = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  return {
    ...actual,
    generalLogger: generalLoggerMock,
    storeLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

export const { useSessionStore } = await import('../useSessionStore')
export type { SessionStatus, ValuationSession }

export function resetSessionStoreHarness() {
  vi.clearAllMocks()
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  ) as typeof fetch

  useSessionStore.setState({
    session: null,
    status: 'idle' as SessionStatus,
    errorMessage: null,
    isSaving: false,
    lastSaved: null,
    hasUnsavedChanges: false,
    dirtyVersion: 0,
    restorationProgress: null,
    paywallData: null,
    engine: null,
  })
}
