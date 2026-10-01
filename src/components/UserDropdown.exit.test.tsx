import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserDropdown } from './UserDropdown'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  save: vi.fn(),
  clear: vi.fn(),
  navigate: vi.fn(),
  push: vi.fn(),
  retry: vi.fn(),
  pending: vi.fn(),
  assetFailure: undefined as unknown,
  accessCurrent: true,
  disposeAccess: vi.fn(),
}))
vi.mock('../utils/reportAccessScope', () => ({
  watchReportAccessScope: () => ({
    isCurrent: () => mocks.accessCurrent,
    dispose: mocks.disposeAccess,
  }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/nl/reports/report-a' }))
vi.mock('next-view-transitions', () => ({ useTransitionRouter: () => ({ push: mocks.push }) }))
vi.mock('../store/useSessionStore', () => ({
  useSessionStore: Object.assign((select: (state: any) => unknown) => select(mocks.state), {
    getState: () => mocks.state,
  }),
}))
vi.mock('../hooks/useEmbeddedMode', () => ({
  useEmbeddedMode: () => ({ isEmbedded: true, closeEmbedded: mocks.navigate }),
}))
vi.mock('../hooks/useReportAssetSaveFailure', () => ({
  useReportAssetSaveFailure: () => mocks.assetFailure,
}))
vi.mock('../services/report/ReportAssetService', () => ({
  pendingReportAssetSave: mocks.pending,
  reportAssetService: { retryFailedSave: mocks.retry },
}))
vi.mock('../utils/reportIdentityPromotion', () => ({
  isSameReportIdentity: (a: string, b: string) => a === b,
  getCanonicalReportAlias: (id: string) => id,
}))
vi.mock('../stores/clientContext', () => ({
  useClientContext: Object.assign(() => ({ isActingAsClient: false, client: null }), {
    getState: () => ({ relationshipId: 'client-a' }),
  }),
}))
vi.mock('@/features/manual/utils/manualMercuryNavigate', () => ({
  hasUsableMercuryHandoffReturnUrl: () => true,
  isManualMercuryEmbeddedContext: () => true,
  readManualMercuryHandoffFromBrowser: () => ({
    returnUrl: '/nl/advisor/clients/client-a',
    sourceApp: 'mercury',
  }),
  navigateToMercuryFromManualHandoff: mocks.navigate,
}))
vi.mock('./UserDropdownParts', () => ({
  UserDropdownButton: ({ onClick, buttonRef }: any) => (
    <button ref={buttonRef} onClick={onClick}>
      Account
    </button>
  ),
  UserDropdownMenu: ({ menuItems }: any) => (
    <div>
      {menuItems
        .filter((item: any) => item.action)
        .map((item: any) => (
          <button key={item.key} onClick={item.action}>
            {item.label}
          </button>
        ))}
    </div>
  ),
}))

async function openExit() {
  render(
    <UserDropdown
      user={{ id: 'advisor', name: 'Advisor', email: 'advisor@example.test' } as never}
      onLogout={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  fireEvent.click(screen.getByRole('button', { name: 'backToHome' }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assetFailure = undefined
  mocks.accessCurrent = true
  mocks.pending.mockReturnValue(undefined)
  mocks.retry.mockResolvedValue(false)
  mocks.state = {
    session: { reportId: 'report-a', sessionData: { company_name: 'Company A' } },
    engine: {},
    engineRevision: 1,
    hasUnsavedChanges: true,
    isSaving: false,
    saveErrorMessage: null,
    lastSaved: null,
    saveSession: mocks.save,
    clearSession: mocks.clear,
  }
  mocks.save.mockImplementation(async () => {
    mocks.state.hasUnsavedChanges = false
    mocks.state.lastSaved = new Date()
  })
})

describe('save and exit from a localized embedded report', () => {
  it('offers save while a result is pending even if the draft was already saved', async () => {
    mocks.state.hasUnsavedChanges = false
    mocks.pending.mockReturnValue(Promise.resolve())
    expect(await openExit()).toHaveAccessibleName('titleSave')
    expect(screen.getByRole('button', { name: 'saveAndExit' })).toBeEnabled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('does not exit after the acting user or company changes during a save', async () => {
    mocks.save.mockImplementationOnce(async () => {
      mocks.accessCurrent = false
      mocks.state.hasUnsavedChanges = false
      mocks.state.lastSaved = new Date()
    })
    await openExit()
    fireEvent.click(screen.getByRole('button', { name: 'saveAndExit' }))
    await waitFor(() => expect(mocks.disposeAccess).toHaveBeenCalled())
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('offers save before the Mercury handoff and waits for acknowledgement', async () => {
    let finish!: () => void
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            mocks.state.hasUnsavedChanges = false
            mocks.state.lastSaved = new Date()
            resolve()
          }
        })
    )
    expect(await openExit()).toHaveAccessibleName('titleSave')
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'saveAndExit' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('user'))
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled()
    await act(async () => finish())
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1))
    expect(mocks.clear).toHaveBeenCalledTimes(1)
  })

  it.each([
    'reject',
    'resolved-error',
    'new-edit',
    'missing-engine',
    'result-error',
  ])('keeps the report open after %s and lets the user retry', async (failure) => {
    if (failure === 'reject') mocks.save.mockRejectedValueOnce(new Error('offline'))
    if (failure === 'resolved-error')
      mocks.save.mockImplementationOnce(async () => {
        mocks.state.saveErrorMessage = 'offline'
      })
    if (failure === 'new-edit')
      mocks.save.mockImplementationOnce(async () => {
        mocks.state.lastSaved = new Date()
      })
    if (failure === 'missing-engine') mocks.state.engine = null
    if (failure === 'result-error') mocks.retry.mockRejectedValueOnce(new Error('result failed'))
    await openExit()
    fireEvent.click(screen.getByRole('button', { name: 'saveAndExit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('saveFailed')
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
    mocks.state.engine ??= {}
    mocks.state.saveErrorMessage = null
    fireEvent.click(screen.getByRole('button', { name: 'saveAndExit' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1))
  })

  it('does not clear or navigate a different report after a delayed save resolves', async () => {
    mocks.save.mockImplementationOnce(async () => {
      mocks.state = {
        ...mocks.state,
        engine: {},
        engineRevision: 2,
        session: { reportId: 'report-b' },
        hasUnsavedChanges: false,
        lastSaved: new Date(),
      }
    })
    await openExit()
    fireEvent.click(screen.getByRole('button', { name: 'saveAndExit' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('offers recovery for a failed result even when the draft has no pending edits', async () => {
    mocks.state.hasUnsavedChanges = false
    mocks.assetFailure = { error: 'offline' }
    expect(await openExit()).toHaveAccessibleName('titleSave')
    fireEvent.click(screen.getByRole('button', { name: 'saveAndExit' }))
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('report-a'))
  })
})
