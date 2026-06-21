import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/contexts/AuthContextTypes'
import { UserDropdown } from './UserDropdown'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
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
      valuationResult: null,
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
  usePathname: () => '/reports/report-123',
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
  hasUsableMercuryHandoffReturnUrl: () => false,
  isManualMercuryEmbeddedContext: () => false,
  navigateToMercuryFromManualHandoff: vi.fn(),
  readManualMercuryHandoffFromBrowser: () => ({ returnUrl: null, sourceApp: null }),
}))

vi.mock('../utils/getMercuryUrl', () => ({
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
  ExitReportConfirmationModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog">exit-confirmation</div> : null,
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
