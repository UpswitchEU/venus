import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearScopedGlobalBootstrapResult,
  getScopedGlobalBootstrapResult,
  rememberScopedGlobalBootstrapResult,
} from '../lib/bootstrap/BootstrapProviderCache'
import { DEFAULT_BOOTSTRAP_STATE } from '../lib/bootstrap/types'
import { SessionAPI } from '../services/api/session/SessionAPI'
import {
  failedReportAssetSave,
  pendingReportAssetSaves,
  reportAssetService,
} from '../services/report/ReportAssetService'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import type { ValuationSession } from '../types/valuation'
import { REPORT_IDENTITY_PROMOTED_EVENT } from '../utils/reportIdentityPromotion'
import { ValuationFlowSelector } from './ValuationFlowSelector'
import { ValuationSessionManager } from './ValuationSessionManager'

const state = vi.hoisted(() => ({ bootstrap: null as any, mounts: 0, refresh: vi.fn() }))
vi.mock('../lib/bootstrap', async (original) => ({
  ...(await original<typeof import('../lib/bootstrap')>()),
  useBootstrapSafe: () => state.bootstrap,
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('flow=manual'),
  usePathname: () => '/en/reports/test',
}))
vi.mock('next-view-transitions', () => ({
  useTransitionRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('../features/valuation/components/ValuationFlow', () => ({
  ValuationFlow: () => {
    useEffect(() => {
      state.mounts++
    }, [])
    return (
      <article>
        <p>Generated valuation</p>
        <input aria-label="Report note" defaultValue="original" />
      </article>
    )
  },
}))

const sessionKey = 'val_1789304239522_lifecycle'
const uuid = 'e6308cd8-2dbd-4283-988d-7071cfcd9403'
const html = `<html><body><article>${'Verified valuation report '.repeat(20)}</article></body></html>`
const context = {
  reportId: sessionKey,
  flow: 'manual' as const,
  locale: 'en',
  clientId: 'client-a',
  version: 2,
}

function Lifecycle() {
  const [id, setId] = useState(sessionKey)
  useEffect(() => {
    const promote = (event: Event) => setId((event as CustomEvent).detail.reportId)
    window.addEventListener(REPORT_IDENTITY_PROMOTED_EVENT, promote)
    return () => window.removeEventListener(REPORT_IDENTITY_PROMOTED_EVENT, promote)
  }, [])
  return (
    <ValuationSessionManager reportId={id}>
      {(props) => <ValuationFlowSelector {...props} reportId={id} onComplete={() => undefined} />}
    </ValuationSessionManager>
  )
}

describe('calculation → save → UUID → refresh with the real session manager and stores', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    state.mounts = 0
    state.refresh.mockReset().mockResolvedValue(undefined)
    pendingReportAssetSaves.clear()
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    useManualResultsStore.setState({ result: null, htmlReport: null })
    window.localStorage.clear()
    clearScopedGlobalBootstrapResult()
    state.bootstrap = {
      ...DEFAULT_BOOTSTRAP_STATE,
      isBootstrapping: true,
      bootstrapError: null,
      refreshBootstrap: state.refresh,
      report: {
        ...DEFAULT_BOOTSTRAP_STATE.report,
        reportId: sessionKey,
        mode: 'existing',
        hasExistingData: true,
        reportReady: true,
      },
    }
    rememberScopedGlobalBootstrapResult(context, state.bootstrap)
    // The calculator's successful result has already reached the real session store.
    useSessionStore.setState({
      engine: null,
      status: 'loaded',
      errorMessage: null,
      hasUnsavedChanges: false,
      saveErrorMessage: null,
      session: {
        reportId: sessionKey,
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionData: { company_name: 'Incident BV', revenue: 1450000 },
        partialData: {},
        htmlReport: html,
        valuationResult: { equity_value_mid: 1400832, html_report: html },
        reportReady: true,
      } as ValuationSession,
    })
  })

  it('hydrates the saved UUID before navigation and keeps the same report mounted when the next bootstrap fails', async () => {
    let resolveSave!: (value: any) => void
    const save = vi.spyOn(SessionAPI.prototype, 'saveValuationResult').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const view = render(<Lifecycle />)
    await screen.findByText('Generated valuation')
    const note = screen.getByLabelText('Report note')
    fireEvent.change(note, { target: { value: 'keep my edit' } })
    const observed: string[] = []
    const promotion = () => {
      observed.push(requireValue(useSessionStore.getState().session).reportId)
      expect(
        getScopedGlobalBootstrapResult({ ...context, reportId: uuid })?.report.reportReady
      ).toBe(true)
    }
    window.addEventListener(REPORT_IDENTITY_PROMOTED_EVENT, promotion)
    const saving = reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Report note')).toBe(note)
    await act(async () => {
      // Older compatible backends may acknowledge success without returning assets.
      resolveSave({ success: true, reportId: uuid, sessionKey, reportReady: true })
      await saving
    })
    expect(observed).toEqual([uuid])
    expect(useSessionStore.getState().session?.htmlReport).toBe(html)
    state.bootstrap = {
      ...state.bootstrap,
      isBootstrapping: false,
      bootstrapError: 'Loading took too long.',
    }
    view.rerender(<Lifecycle />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Loading took too long.')
    expect(screen.getByLabelText('Report note')).toBe(note)
    expect(note).toHaveValue('keep my edit')
    fireEvent.click(screen.getByRole('button', { name: /tryAgain/i }))
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(state.mounts).toBe(1)
    window.removeEventListener(REPORT_IDENTITY_PROMOTED_EVENT, promotion)
  })

  it('retries a failed asset save inline with the same payload and report still mounted', async () => {
    const save = vi
      .spyOn(SessionAPI.prototype, 'saveValuationResult')
      .mockRejectedValueOnce(new Error('Save temporarily unavailable'))
      .mockResolvedValueOnce({
        success: true,
        message: 'saved',
        reportId: uuid,
        sessionKey,
        reportReady: true,
      })
    render(<Lifecycle />)
    const note = await screen.findByLabelText('Report note')
    fireEvent.change(note, { target: { value: 'preserve unsaved note' } })
    await act(async () => {
      await expect(
        reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
      ).rejects.toThrow()
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Save temporarily unavailable')
    fireEvent.click(screen.getByRole('button', { name: /tryAgain/i }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0])
    expect(state.refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Report note')).toBe(note)
    expect(note).toHaveValue('preserve unsaved note')
    expect(state.mounts).toBe(1)
  })

  it('ignores an old save after switching reports', async () => {
    let resolveSave!: (value: any) => void
    const save = vi.spyOn(SessionAPI.prototype, 'saveValuationResult').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const saving = reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const next = {
      ...requireValue(useSessionStore.getState().session),
      reportId: 'val_other_report',
    }
    useSessionStore.setState({ session: next })
    resolveSave({ success: true, reportId: uuid, sessionKey, reportReady: true })
    await saving
    expect(useSessionStore.getState().session).toBe(next)
  })

  it('does not hydrate an old save after a client switch away and back', async () => {
    let resolveSave!: (value: any) => void
    const save = vi.spyOn(SessionAPI.prototype, 'saveValuationResult').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const previous = useSessionStore.getState().session
    const saving = reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    resolveSave({ success: true, reportId: uuid, sessionKey, reportReady: true })
    await saving
    expect(useSessionStore.getState().session).toBe(previous)
    expect(getScopedGlobalBootstrapResult(context)?.report.reportId).toBe(sessionKey)
    expect(pendingReportAssetSaves.size).toBe(0)
  })

  it('cancels a queued save when client context changes, even if it changes back', async () => {
    let resolveSave!: (value: any) => void
    const save = vi.spyOn(SessionAPI.prototype, 'saveValuationResult').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const first = reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const queued = reportAssetService.saveReportAssets(sessionKey, { name: 'queued edit' })
    const rejected = expect(queued).rejects.toThrow('client context changed')
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    resolveSave({ success: true, reportId: uuid, sessionKey, reportReady: true })
    await first
    await rejected
    expect(save).toHaveBeenCalledTimes(1)
    expect(failedReportAssetSave(sessionKey)).toBeUndefined()
    expect(pendingReportAssetSaves.size).toBe(0)
  })

  it.each([
    'success',
    'failure',
  ])('ignores %s for a save after another version result is selected', async (outcome) => {
    let resolveSave!: (value: any) => void
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(SessionAPI.prototype, 'saveValuationResult').mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          resolveSave = resolve
          rejectSave = reject
        })
    )
    const saving = reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
    const settled = saving.catch(() => undefined)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const selected = { equity_value_mid: 1218800, html_report: html } as any
    useManualResultsStore.getState().setResult(selected)
    const versionSession = {
      ...requireValue(useSessionStore.getState().session),
      valuationResult: selected,
    }
    useSessionStore.setState({ session: versionSession })
    if (outcome === 'success')
      resolveSave({ success: true, reportId: uuid, sessionKey, reportReady: true })
    else rejectSave(new Error('obsolete save failed'))
    await settled
    expect(useSessionStore.getState().session).toBe(versionSession)
    expect(useManualResultsStore.getState().result?.equity_value_mid).toBe(1218800)
    expect(failedReportAssetSave(sessionKey)).toBeUndefined()
  })

  it('coalesces repeated Try Again actions into one pending save request', async () => {
    let resolveRetry!: (value: any) => void
    const save = vi
      .spyOn(SessionAPI.prototype, 'saveValuationResult')
      .mockRejectedValueOnce(new Error('transient save error'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRetry = resolve
          })
      )
    await expect(
      reportAssetService.saveReportAssets(sessionKey, { htmlReport: html })
    ).rejects.toThrow()
    const first = reportAssetService.retryFailedSave(sessionKey)
    const second = reportAssetService.retryFailedSave(sessionKey)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    resolveRetry({ success: true, reportId: uuid, sessionKey, reportReady: true })
    await Promise.all([first, second])
    expect(save).toHaveBeenCalledTimes(2)
    expect(pendingReportAssetSaves.size).toBe(0)
    expect(failedReportAssetSave(uuid)).toBeUndefined()
  })

  it('retries a failed draft save without reloading the report or discarding edits', async () => {
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'lifecycle-advisor' })
    const save = vi
      .spyOn(requireValue(useSessionStore.getState().engine), 'saveSession')
      .mockRejectedValueOnce(new Error('Service Unavailable (503)'))
      .mockResolvedValueOnce(undefined)
    render(<Lifecycle />)
    const note = await screen.findByLabelText('Report note')
    fireEvent.change(note, { target: { value: 'keep unsaved draft' } })
    await act(async () => {
      await useSessionStore
        .getState()
        .saveSession('autosave')
        .catch(() => undefined)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Service Unavailable (503)')
    fireEvent.click(screen.getByRole('button', { name: /tryAgain/i }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(state.refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Report note')).toBe(note)
    expect(note).toHaveValue('keep unsaved draft')
    expect(state.mounts).toBe(1)
  })
})

function requireValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected initialized session state')
  return value
}
