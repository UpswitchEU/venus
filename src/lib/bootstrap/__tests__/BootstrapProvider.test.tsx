import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BootstrapProvider, resetBootstrapGuard, useBootstrap } from '../BootstrapProvider'
import type { BootstrapContext, SessionBootstrapState } from '../types'

const mocks = vi.hoisted(() => {
  const authState = {
    loading: false,
    isInitializing: false,
    isRefreshing: false,
  }

  return {
    authState,
    bootstrapViaTitan: vi.fn(),
    bootstrapClient: vi.fn(),
    getCachedResult: vi.fn(),
    hasCompletedFor: vi.fn(),
    clearCache: vi.fn(),
    resetCircuitBreaker: vi.fn(),
    setBootstrapState: vi.fn(),
    setEngine: vi.fn(),
    clearInitThrottle: vi.fn(),
    clearReloadCounter: vi.fn(),
  }
})

vi.mock('../../../features/manual/hooks/useNavigationCancellation', () => ({
  useIsMountedRef: () => ({ current: true }),
}))

vi.mock('../../auth', () => {
  const useAuthStore = (selector?: (state: typeof mocks.authState) => unknown) =>
    selector ? selector(mocks.authState) : mocks.authState
  useAuthStore.getState = () => mocks.authState

  return {
    clearInitThrottle: mocks.clearInitThrottle,
    clearReloadCounter: mocks.clearReloadCounter,
    useAuthStore,
  }
})

vi.mock('../../sessionInitialization', () => ({
  setBootstrapState: mocks.setBootstrapState,
}))

vi.mock('../SessionBootstrapService', () => ({
  bootstrapService: {
    bootstrap: mocks.bootstrapClient,
    bootstrapViaTitan: mocks.bootstrapViaTitan,
    clearCache: mocks.clearCache,
    getCachedResult: mocks.getCachedResult,
    hasCompletedFor: mocks.hasCompletedFor,
    resetCircuitBreaker: mocks.resetCircuitBreaker,
  },
  SessionBootstrapService: vi.fn(),
}))

vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      setEngine: mocks.setEngine,
    }),
  },
}))

function makeContext(
  reportId: string,
  overrides: Partial<BootstrapContext> = {}
): BootstrapContext {
  return {
    url: `https://preview.valuation.upswitch.app/nl/reports/${reportId}`,
    reportId,
    locale: 'nl',
    flow: 'manual',
    mode: 'edit',
    sourceApp: 'mercury',
    ...overrides,
  }
}

function makeState(reportId: string): SessionBootstrapState {
  return {
    identity: {
      type: 'authenticated',
      userId: 'user-1',
    },
    report: {
      mode: 'existing',
      reportId,
      hasExistingData: false,
      status: 'active',
    },
    prefillData: {
      sources: [],
      confidence: 0,
      fieldsPopulated: [],
      fieldsRemaining: [],
    },
    ui: {
      suggestedFlow: 'manual',
      showWelcomeBack: false,
      resumableSession: false,
      showKboVerification: false,
      showAccountantBanner: false,
    },
    bootstrapVersion: '2.0.0',
    bootstrappedAt: new Date(),
    bootstrapDurationMs: 1,
  } as SessionBootstrapState
}

function Probe() {
  const { bootstrapError, isBootstrapping, report } = useBootstrap()

  return (
    <div data-testid="report-state">
      {report.reportId}:{isBootstrapping ? 'loading' : 'ready'}:{bootstrapError ?? 'ok'}
    </div>
  )
}

describe('BootstrapProvider', () => {
  beforeEach(() => {
    resetBootstrapGuard()
    mocks.getCachedResult.mockReturnValue(null)
    mocks.hasCompletedFor.mockReturnValue(false)
    mocks.bootstrapViaTitan.mockImplementation(async (context: BootstrapContext) =>
      makeState(context.reportId || 'new')
    )
    mocks.bootstrapClient.mockImplementation(async (context: BootstrapContext) =>
      makeState(context.reportId || 'new')
    )
  })

  afterEach(() => {
    resetBootstrapGuard()
  })

  it('hydrates a same-report remount from the scoped module cache', async () => {
    const first = render(
      <BootstrapProvider context={makeContext('val_same_report')} autoBootstrap={true}>
        <Probe />
      </BootstrapProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('report-state')).toHaveTextContent('val_same_report:ready:ok')
    })

    first.unmount()

    render(
      <BootstrapProvider context={makeContext('val_same_report')} autoBootstrap={true}>
        <Probe />
      </BootstrapProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('report-state')).toHaveTextContent('val_same_report:ready:ok')
    })

    expect(mocks.bootstrapViaTitan).toHaveBeenCalledTimes(1)
  })

  it('does not hydrate a different report from the previous global result', async () => {
    const first = render(
      <BootstrapProvider context={makeContext('val_report_a')} autoBootstrap={true}>
        <Probe />
      </BootstrapProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('report-state')).toHaveTextContent('val_report_a:ready:ok')
    })

    first.unmount()

    render(
      <BootstrapProvider context={makeContext('val_report_b')} autoBootstrap={true}>
        <Probe />
      </BootstrapProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('report-state')).toHaveTextContent('val_report_b:ready:ok')
    })

    expect(mocks.bootstrapViaTitan).toHaveBeenCalledTimes(2)
    expect(mocks.bootstrapViaTitan.mock.calls[1][0]).toMatchObject({
      reportId: 'val_report_b',
    })
  })

  it('does not hydrate the same report across different delegated client contexts', async () => {
    const first = render(
      <BootstrapProvider
        context={makeContext('val_report_a', { clientId: 'client-a' })}
        autoBootstrap={true}
      >
        <Probe />
      </BootstrapProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('report-state')).toHaveTextContent('val_report_a:ready:ok')
    })

    first.unmount()

    render(
      <BootstrapProvider
        context={makeContext('val_report_a', { clientId: 'client-b' })}
        autoBootstrap={true}
      >
        <Probe />
      </BootstrapProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('report-state')).toHaveTextContent('val_report_a:ready:ok')
    })

    expect(mocks.bootstrapViaTitan).toHaveBeenCalledTimes(2)
    expect(mocks.bootstrapViaTitan.mock.calls[1][0]).toMatchObject({
      reportId: 'val_report_a',
      clientId: 'client-b',
    })
  })
})
