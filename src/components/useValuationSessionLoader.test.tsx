import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useValuationSessionLoader } from './useValuationSessionLoader'

const mocks = vi.hoisted(() => ({
  cancelActiveLoad: vi.fn(),
  setState: vi.fn(),
  loadSession: vi.fn().mockResolvedValue(undefined),
  refreshBootstrap: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../store/useSessionStore', () => ({
  useSessionStore: {
    getState: () => ({ status: 'loaded', cancelActiveLoad: mocks.cancelActiveLoad }),
    setState: mocks.setState,
  },
}))
vi.mock('../store/manual/useManualResultsStore', () => ({ useManualResultsStore: {} }))
vi.mock('../services/session/SessionService', () => ({ sessionService: {} }))
vi.mock('../services/session/SessionRestorationService', () => ({
  SessionRestorationService: {
    isPendingRestoration: () => false,
    isRestored: () => true,
  },
}))

const pending = {
  bootstrapComplete: false,
  bootstrapError: null,
  bootstrapHasExistingSession: false,
  bootstrapHasNewReport: false,
  bootstrapHasSession: false,
  bootstrapMismatch: false,
  bootstrapReportHasExistingData: undefined,
  bootstrapReportId: undefined,
  bootstrapReportMode: undefined,
  bootstrapReportReady: undefined,
  detectedFlow: 'manual',
  isBootstrapping: true,
  loadSession: mocks.loadSession,
  prefilledQuery: null,
  refreshBootstrap: mocks.refreshBootstrap,
  reportId: 'val_existing',
  session: null,
  sessionHasAssets: false,
  urlPrefilledQuery: null,
} satisfies Parameters<typeof useValuationSessionLoader>[0]

describe('report retry after bootstrap timeout', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    { reason: 'pending bootstrap past the session deadline', overrides: {} },
    { reason: 'incomplete bootstrap', overrides: { isBootstrapping: false } },
    {
      reason: 'failed bootstrap',
      overrides: { isBootstrapping: false, bootstrapError: '[TIMEOUT] Please try again.' },
    },
  ])('clears the session error before retrying $reason', async ({ overrides }) => {
    const { result } = renderHook(() => useValuationSessionLoader({ ...pending, ...overrides }))
    // Observe the explicit retry independently of the initial session-load effect.
    vi.clearAllMocks()
    await act(() => result.current.handleRetry())
    expect(mocks.cancelActiveLoad).toHaveBeenCalledWith('val_existing')
    expect(mocks.refreshBootstrap).toHaveBeenCalledTimes(1)
    expect(mocks.loadSession).not.toHaveBeenCalled()
    expect(mocks.setState).toHaveBeenCalledWith({
      status: 'idle',
      errorMessage: null,
      renderError: null,
    })
    expect(mocks.setState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshBootstrap.mock.invocationCallOrder[0]
    )
  })

  it('loads the session directly when bootstrap has already completed', async () => {
    const { result } = renderHook(() =>
      useValuationSessionLoader({
        ...pending,
        bootstrapComplete: true,
        isBootstrapping: false,
        bootstrapHasExistingSession: true,
      })
    )
    await act(() => result.current.handleRetry())
    expect(mocks.refreshBootstrap).not.toHaveBeenCalled()
    expect(mocks.loadSession).toHaveBeenCalledWith('val_existing', 'manual', null)
    expect(mocks.setState).toHaveBeenCalledWith({
      status: 'idle',
      errorMessage: null,
      renderError: null,
    })
    expect(mocks.setState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadSession.mock.invocationCallOrder[0]
    )
  })
})
