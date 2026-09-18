import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientContextBanner } from './ClientContextBanner'

const navigateMock = vi.hoisted(() => vi.fn())

const sessionStoreMock = vi.hoisted(() => ({
  state: {
    session: null as null | {
      reportId: string
      valuationResult: unknown
      htmlReport: string | null
    },
  },
}))

const clientContextMock = vi.hoisted(() => ({
  state: {
    isActingAsClient: true,
    client: { id: 'client-user-1', fullName: 'Restaurant AB', avatarUrl: null },
    relationshipId: 'relationship-1',
    clearClientContext: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

vi.mock('../lib/auth/persistedClientContext', () => ({
  clearDelegatedClientContext: (clear: () => void) => clear(),
}))

vi.mock('../stores/clientContext', () => ({
  useClientContext: () => clientContextMock.state,
}))

vi.mock('../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: typeof sessionStoreMock.state) => unknown) =>
    selector(sessionStoreMock.state),
}))

vi.mock('@/features/manual/utils/manualMercuryNavigate', () => ({
  navigateToMercuryFromManualHandoff: navigateMock,
}))

vi.mock('@/lib/return-url', () => ({
  navigateToSafeMercuryNavigationUrl: vi.fn(),
}))

describe('ClientContextBanner — Exit Client View', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    sessionStoreMock.state.session = null
  })

  // This exit used to say "no valuation" unconditionally, so an advisor leaving
  // through it right after calculating came back to a dossier that never
  // reconciled the report: no `?from=valuation`, no `?reportId`.
  it('tells Mercury a valuation was calculated, and which report', () => {
    sessionStoreMock.state.session = {
      reportId: 'report-123',
      valuationResult: { equity_value_mid: 310_000 },
      htmlReport: null,
    }
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    expect(navigateMock).toHaveBeenCalledWith({
      currentLocale: 'en',
      clientContextId: 'relationship-1',
      hasCompletedValuation: true,
      reportId: 'report-123',
    })
  })

  it('counts a saved HTML report as a completed valuation too', () => {
    sessionStoreMock.state.session = {
      reportId: 'report-456',
      valuationResult: null,
      htmlReport: '<html></html>',
    }
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ hasCompletedValuation: true, reportId: 'report-456' })
    )
  })

  it('stays a plain exit when nothing was calculated', () => {
    sessionStoreMock.state.session = {
      reportId: 'report-789',
      valuationResult: null,
      htmlReport: null,
    }
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    // No report id either: Mercury must not celebrate or reconcile a draft.
    expect(navigateMock).toHaveBeenCalledWith({
      currentLocale: 'en',
      clientContextId: 'relationship-1',
      hasCompletedValuation: false,
    })
  })

  it('exits cleanly before any session has loaded', () => {
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ hasCompletedValuation: false })
    )
  })
})
