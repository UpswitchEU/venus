import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate, resetAuthGateGuard } from './AuthGate'

const mocks = vi.hoisted(() => ({
  auth: {
    loading: true,
    isInitializing: true,
    isRefreshing: false,
    error: null as string | null,
    user: null as { id: string } | null,
  },
  transient: false,
  navigate: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('../hooks/useLanguageSync', () => ({ useLanguageSync: vi.fn() }))
vi.mock('../lib/auth', () => {
  const useAuthStore = (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth)
  useAuthStore.getState = () => mocks.auth
  return {
    useAuthStore,
    clearInitThrottle: vi.fn(),
    clearReloadCounter: vi.fn(),
    getInitTraceId: () => 'test',
    wasLastSessionCheckTransient: () => mocks.transient,
  }
})
vi.mock('../lib/bootstrap/resolvers/AuthResolver', () => ({
  clearLastClientTokenExchangeFailure: vi.fn(),
  getLastClientTokenExchangeFailure: () => null,
}))
vi.mock('../stores/clientContext', () => ({
  useClientContext: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ contextGateResolved: false }),
}))
vi.mock('../lib/return-url', () => ({
  getSafeMercuryReturnUrl: (url: string) => url,
  navigateToSafeMercuryNavigationUrl: mocks.navigate,
}))
vi.mock('../utils/getMercuryUrl', () => ({ getMercuryUrl: () => 'https://www.upswitch.app' }))
vi.mock('@/design-system', () => ({
  GlassCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AuroraButton: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('AuthGate recovery during optimistic Mercury opens', () => {
  beforeEach(() => {
    resetAuthGateGuard()
    mocks.navigate.mockClear()
    mocks.transient = false
    Object.assign(mocks.auth, {
      loading: true,
      isInitializing: true,
      isRefreshing: false,
      error: null,
      user: null,
    })
    sessionStorage.clear()
  })

  afterEach(() => {
    resetAuthGateGuard()
    vi.useRealTimers()
  })

  it('renders the shell immediately while authentication is pending', () => {
    render(<AuthGate optimistic>Report shell</AuthGate>)
    expect(screen.getByText('Report shell')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces the optimistic shell with recovery after an actionable failure', () => {
    Object.assign(mocks.auth, {
      loading: false,
      isInitializing: false,
      error: 'Unable to establish client context. Please try again.',
    })
    render(<AuthGate optimistic>Report shell</AuthGate>)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to establish client context')
    expect(screen.getByRole('button', { name: 'tryAgain' })).toBeInTheDocument()
    expect(screen.queryByText('Report shell')).not.toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('shows retry after a transient auth failure and keeps sign-in available', () => {
    Object.assign(mocks.auth, { loading: false, isInitializing: false })
    mocks.transient = true
    render(<AuthGate optimistic>Report shell</AuthGate>)
    expect(screen.getByRole('alert')).toHaveTextContent('temporarilyUnavailable')
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'logIn' }))
    expect(mocks.navigate).toHaveBeenCalledWith(
      `https://www.upswitch.app/en/auth/login?returnUrl=${encodeURIComponent(window.location.href)}`
    )
  })

  it('shows recovery after the auth deadline instead of leaving an endless shell', () => {
    vi.useFakeTimers()
    render(<AuthGate optimistic>Report shell</AuthGate>)
    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByRole('alert')).toHaveTextContent('timeout')
    expect(screen.queryByText('Report shell')).not.toBeInTheDocument()
  })

  it('honors custom recovery content in optimistic mode', () => {
    Object.assign(mocks.auth, {
      loading: false,
      isInitializing: false,
      error: 'Invalid valuation link',
    })
    render(
      <AuthGate optimistic errorComponent={<div>Custom recovery</div>}>
        Report shell
      </AuthGate>
    )
    expect(screen.getByText('Custom recovery')).toBeInTheDocument()
    expect(screen.queryByText('Report shell')).not.toBeInTheDocument()
  })

  it('keeps confirmed sessions mounted during a background refresh', () => {
    Object.assign(mocks.auth, {
      loading: false,
      isInitializing: false,
      user: { id: 'advisor-1' },
    })
    const view = render(<AuthGate optimistic>Report shell</AuthGate>)
    mocks.auth.isRefreshing = true
    view.rerender(<AuthGate optimistic>Report shell</AuthGate>)
    expect(screen.getByText('Report shell')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
