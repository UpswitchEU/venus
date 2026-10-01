import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualNavigationController } from './useManualNavigationController'

const env = vi.hoisted(() => ({
  save: vi.fn(),
  push: vi.fn(),
  confirmNew: vi.fn(),
  state: { session: { reportId: 'report-a' }, engine: {}, engineRevision: 1 },
  actions: Object.fromEntries(
    [
      'handleBack',
      'handleExitClientView',
      'handleContinueImportReview',
      'handleContinueToListing',
      'handleLogout',
      'handleAccountSettings',
      'handleSwitchWorkspace',
      'handleNavigateToDashboard',
      'handleNavigateToBilling',
      'handleNavigateToHelp',
      'handleOpenMercuryClientForInvite',
    ].map((name) => [name, vi.fn()])
  ),
}))
vi.mock('sonner', () => ({ toast: { loading: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }))
vi.mock('next-view-transitions', () => ({ useTransitionRouter: () => ({ push: env.push }) }))
vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: { getState: () => env.state },
}))
vi.mock('../../../utils/reportIdentityPromotion', () => ({
  isSameReportIdentity: (a: unknown, b: unknown) => a === b,
}))
vi.mock('../../../utils/reportAccessScope', () => ({
  watchReportAccessScope: () => ({ isCurrent: () => true, dispose: vi.fn() }),
}))
vi.mock('../utils/saveManualWorkspaceBeforeNavigation', () => ({
  saveManualWorkspaceBeforeNavigation: env.save,
  WorkspaceSaveNotReadyError: class extends Error {},
}))
vi.mock('./useManualMercuryNavigationActions', () => ({
  useManualMercuryNavigationActions: () => ({ mercuryLocale: 'nl', ...env.actions }),
}))
vi.mock('./useManualPdfExportController', () => ({ useManualPdfExportController: () => ({}) }))
vi.mock('./useManualRecentValuations', () => ({
  useManualRecentValuations: () => ({ rawRecentValuations: [], recentValuations: [] }),
}))
vi.mock('./useManualRecentValuationDeletion', () => ({
  useManualRecentValuationDeletion: () => ({}),
}))
vi.mock('./useManualNewValuationFlow', () => ({
  useManualNewValuationFlow: () => ({ handleConfirmNewValuation: env.confirmNew }),
}))

beforeEach(() => vi.resetAllMocks())
const renderNavigation = () =>
  renderHook(() =>
    useManualNavigationController({
      reportId: 'report-a',
      currentLocale: 'nl',
      translate: (key: string) => key,
      translateReport: (key: string) => key,
      flushFormBeforeNavigation: vi.fn(),
      isNavigationBusy: () => false,
    } as never)
  )

describe('workspace exit entry points', () => {
  it.each([
    ...Object.keys(env.actions),
    'handleConfirmNewValuation',
    'handleSelectValuation',
  ])('%s waits before any navigation or state cleanup', async (name) => {
    let finish!: () => void
    env.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const { result } = renderNavigation()
    const action = result.current[name as keyof typeof result.current] as (id?: string) => void
    const effect =
      name === 'handleSelectValuation'
        ? env.push
        : name === 'handleConfirmNewValuation'
          ? env.confirmNew
          : env.actions[name]
    act(() => action('report-b'))
    expect(effect).not.toHaveBeenCalled()
    expect(env.save).toHaveBeenCalledOnce()
    await act(async () => {
      finish()
    })
    await waitFor(() => expect(effect).toHaveBeenCalledOnce())
    if (name === 'handleSelectValuation')
      expect(env.push).toHaveBeenCalledWith('/nl/reports/report-b')
  })
  it('does not reset the workspace or navigate after a failed save', async () => {
    env.save.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderNavigation()
    await act(async () => {
      result.current.handleConfirmNewValuation()
    })
    expect(env.confirmNew).not.toHaveBeenCalled()
    expect(env.push).not.toHaveBeenCalled()
  })
})
