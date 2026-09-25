import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/contexts/AuthContextTypes'
import {
  recordManualValuationSaved,
  resetManualValuationSaveReceiptsForTests,
} from '@/features/manual/utils/manualValuationSaveReceipt'
import { UserDropdown } from './UserDropdown'

const SAVED_REPORT_ID = '6f1d2c3b-4a5e-4f60-9b7a-8c9d0e1f2a3b'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

const pageMock = vi.hoisted(() => ({
  pathname: '/reports/report-123',
  returnsToMercury: false,
}))

const sessionStoreMock = vi.hoisted(() => ({
  state: {
    session: {
      reportId: 'report-123',
      name: 'Demo report',
      updatedAt: new Date('2026-06-21T08:00:00.000Z'),
      sessionData: {
        business_type: 'saas',
      },
      valuationResult: null as unknown,
      htmlReport: null,
    },
    hasUnsavedChanges: true,
    isSaving: false,
    saveSession: vi.fn().mockResolvedValue(undefined),
    clearSession: vi.fn(),
  },
}))

const clientContextMock = vi.hoisted(() => ({
  state: {
    isActingAsClient: false,
    client: null,
    relationshipId: null,
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pageMock.pathname,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next-view-transitions', () => ({
  useTransitionRouter: () => routerMock,
}))

vi.mock('../hooks/useEmbeddedMode', () => ({
  useEmbeddedMode: () => ({
    isEmbedded: false,
    closeEmbedded: vi.fn(),
  }),
}))

vi.mock('../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: typeof sessionStoreMock.state) => unknown) =>
    selector(sessionStoreMock.state),
}))

vi.mock('../stores/clientContext', () => {
  const useClientContext = () => clientContextMock.state
  useClientContext.getState = () => clientContextMock.state
  return { useClientContext }
})

vi.mock('@/features/manual/utils/manualMercuryNavigate', () => ({
  hasUsableMercuryHandoffReturnUrl: () => pageMock.returnsToMercury,
  isManualMercuryEmbeddedContext: () => false,
  navigateToMercuryFromManualHandoff: navigateMock,
  readManualMercuryHandoffFromBrowser: () => ({ returnUrl: null, sourceApp: null }),
}))

vi.mock('../utils/getMercuryUrl', () => ({
  getApiUrl: () => 'https://api.upswitch.test',
  getMercuryUrl: () => 'https://app.upswitch.test',
}))

vi.mock('../services/urlGenerator', () => ({
  default: {
    root: () => '/',
  },
}))

vi.mock('../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('./modals/ExitReportConfirmationModal', () => ({
  ExitReportConfirmationModal: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean
    onConfirm: () => void
  }) =>
    isOpen ? (
      <div role="dialog">
        exit-confirmation
        <button type="button" onClick={onConfirm}>
          confirm-exit
        </button>
      </div>
    ) : null,
}))

const accountantUser: User = {
  id: 'user-123',
  email: 'ada@example.com',
  name: 'Ada Accountant',
  role: 'advisor',
}

describe('UserDropdown', () => {
  it('keeps the exit confirmation modal open after the dropdown closes', () => {
    render(<UserDropdown user={accountantUser} onLogout={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByTestId('user-menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'backToHome' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('exit-confirmation')
  })
})

function openMenuAndChoose(item: 'backToHome' | 'backToDashboard') {
  render(<UserDropdown user={accountantUser} onLogout={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByTestId('user-menu'))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

function leaveThroughExitDialog() {
  pageMock.returnsToMercury = false
  openMenuAndChoose('backToHome')
  pageMock.returnsToMercury = true
  fireEvent.click(screen.getByRole('button', { name: 'confirm-exit' }))
}

/** The four ways this menu returns to Mercury. */
const mercuryExits: Array<[string, () => void]> = [
  [
    'Back to dashboard',
    () => {
      pageMock.pathname = '/home'
      openMenuAndChoose('backToDashboard')
    },
  ],
  ['Back to Home', () => openMenuAndChoose('backToHome')],
  ['the exit dialog', leaveThroughExitDialog],
  [
    'the exit dialog after a failed cleanup',
    () => {
      sessionStoreMock.state.clearSession.mockImplementationOnce(() => {
        throw new Error('cleanup failed')
      })
      leaveThroughExitDialog()
    },
  ],
]

// V1: the menu celebrated any session with a result, but Mercury's "Start valuation"
// re-opens the latest report, so reviewing it and leaving here announced "Valuation added"
// for a valuation nobody ran. Only a result saved during this visit counts, as for
// "Exit client view".
describe('UserDropdown return to Mercury', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    resetManualValuationSaveReceiptsForTests()
    pageMock.returnsToMercury = true
    // The report shows an earlier result, as when Mercury re-opens it.
    sessionStoreMock.state.session.reportId = SAVED_REPORT_ID
    sessionStoreMock.state.session.valuationResult = { equity_value_mid: 310_000 }
  })

  afterEach(() => {
    pageMock.pathname = '/reports/report-123'
    pageMock.returnsToMercury = false
    sessionStoreMock.state.session.reportId = 'report-123'
    sessionStoreMock.state.session.valuationResult = null
  })

  it.each(mercuryExits)('%s: an earlier result alone is a plain return', (_exit, leave) => {
    leave()

    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(navigateMock.mock.calls[0]?.[0]).toMatchObject({ hasCompletedValuation: false })
  })

  it.each(mercuryExits)('%s: a result saved this visit names its report', (_exit, leave) => {
    recordManualValuationSaved([SAVED_REPORT_ID])

    leave()

    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(navigateMock.mock.calls[0]?.[0]).toMatchObject({
      hasCompletedValuation: true,
      reportId: SAVED_REPORT_ID,
    })
  })
})
