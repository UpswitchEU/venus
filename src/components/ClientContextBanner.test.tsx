import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordManualValuationSaved,
  resetManualValuationSaveReceiptsForTests,
} from '@/features/manual/utils/manualValuationSaveReceipt'
import { ClientContextBanner } from './ClientContextBanner'

const SAVED_REPORT_ID = '0c7e2f1a-5b3d-4e6f-8a9b-1c2d3e4f5a6b'

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
  useClientContext: Object.assign(() => clientContextMock.state, {
    getState: () => clientContextMock.state,
  }),
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
    resetManualValuationSaveReceiptsForTests()
  })

  // This exit used to say "no valuation" unconditionally, so an advisor leaving
  // through it right after calculating came back to a dossier that never
  // reconciled the report: no `?from=valuation`, no `?reportId`.
  it('tells Mercury a valuation was calculated and saved, and which report', () => {
    sessionStoreMock.state.session = {
      reportId: SAVED_REPORT_ID,
      valuationResult: { equity_value_mid: 310_000 },
      htmlReport: null,
    }
    recordManualValuationSaved([SAVED_REPORT_ID])
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    expect(navigateMock).toHaveBeenCalledWith({
      currentLocale: 'en',
      clientContextId: 'relationship-1',
      hasCompletedValuation: true,
      reportId: SAVED_REPORT_ID,
    })
  })

  // F-11: Mercury's "Start valuation" re-opens the existing report, so a result on screen
  // is not proof of this visit; celebrating a review-and-exit showed "Valuation added".
  it('stays a plain exit when the report only shows an earlier result', () => {
    sessionStoreMock.state.session = {
      reportId: SAVED_REPORT_ID,
      valuationResult: { equity_value_mid: 310_000 },
      htmlReport: '<html></html>',
    }
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    expect(navigateMock).toHaveBeenCalledWith({
      currentLocale: 'en',
      clientContextId: 'relationship-1',
      hasCompletedValuation: false,
    })
  })

  // F-12: before the save commits the session still holds its `val_*` key, which Mercury
  // cannot match against a report UUID.
  it('does not send a session key as the report id', () => {
    sessionStoreMock.state.session = {
      reportId: 'val_abc12345',
      valuationResult: { equity_value_mid: 310_000 },
      htmlReport: null,
    }
    recordManualValuationSaved(['val_abc12345'])
    render(<ClientContextBanner />)

    fireEvent.click(screen.getByRole('button', { name: /clientContext.exitClientView/ }))

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ hasCompletedValuation: true, reportId: null })
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
