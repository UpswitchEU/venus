import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import type {
  ValuationFormData,
  ValuationRequest,
  ValuationResponse,
} from '../../../types/valuation'
import {
  resetManualValuationSaveReceiptsForTests,
  wasManualValuationSavedThisVisit,
} from '../utils/manualValuationSaveReceipt'
import { useManualCalculationCompletion } from './useManualCalculationCompletion'
import type { ManualSubmitRun } from './useManualSubmitRunGuard'

const saveReportAssets = vi.hoisted(() => vi.fn())
const retryFailedSave = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast }))
vi.mock('../../../services', () => ({ reportAssetService: { saveReportAssets, retryFailedSave } }))
vi.mock('../../../services/audit/ValuationAuditService', () => ({
  valuationAuditService: { logRegeneration: vi.fn() },
}))
vi.mock('../utils/manualVersioningExecutor', () => ({
  runManualCalculationVersioning: vi
    .fn()
    .mockResolvedValue({ aborted: false, versionCreationFailed: false }),
}))
vi.mock('../utils/manualVersionHistorySync', () => ({
  scheduleManualVersionHistorySync: vi.fn(),
}))
vi.mock('../utils/manualReportHtmlRecoveryUtil', () => ({
  applyPostCalculateHtmlRecovery: vi.fn(async ({ result }: { result: unknown }) => result),
  needsManualReportHtmlRecovery: vi.fn(() => false),
}))

const REPORT_ID = '6b0f1f0e-3c1d-4f5a-9b7e-2d4c6a8e0f13'

const submittedForm = {
  company_name: 'Acme BV',
  founding_year: 2001,
  number_of_employees: 12,
  current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 150_000 },
  revenue: 1_000_000,
  ebitda: 150_000,
} as unknown as ValuationFormData

const request = {
  company_name: 'Acme BV',
  current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 150_000 },
} as unknown as ValuationRequest

const valuationResult = {
  valuation_id: 'val_run_1',
  company_name: 'Acme BV',
  html_report: '<main>report</main>',
} as unknown as ValuationResponse

function submitRun(overrides: Partial<ManualSubmitRun> = {}): ManualSubmitRun {
  return {
    id: 1,
    startLookupId: REPORT_ID,
    isCurrent: () => true,
    isStillTarget: () => true,
    endLoading: vi.fn(),
    staleContext: () => ({ startLookupId: REPORT_ID, currentLookupId: REPORT_ID }),
    ...overrides,
  }
}

function renderCompletion() {
  const setIsDirty = vi.fn()
  const setDraftStatus = vi.fn()
  const { result } = renderHook(() =>
    useManualCalculationCompletion({
      createVersion: vi.fn(),
      isAccountantMode: true,
      lastSubmittedFinancialSnapshotRef: { current: null },
      postValuationListingHandoffPendingRef: { current: false },
      sessionName: 'Acme BV valuation',
      durableSaveInFlightRef: { current: false },
      setDraftStatus,
      setIsDirty,
      setLastSaved: vi.fn(),
      setPendingPostValuationAgentPrompt: vi.fn(),
      setResult: vi.fn(),
      translate: (key) => key,
      translateHistory: (key) => key,
      translateReport: (key) => key,
      userId: 'advisor-1',
      versionSyncTimeoutRef: { current: null },
      startProposalVersionLabelRef: { current: null },
    })
  )
  const complete = (run: ManualSubmitRun = submitRun()) =>
    result.current.completeManualCalculation({
      calculationDurationMs: 1200,
      idForApi: REPORT_ID,
      previousVersion: null,
      request,
      retrySubmit: vi.fn(),
      storeSnapshot: submittedForm,
      submitRun: run,
      valuationResult,
    })
  return { complete, setDraftStatus, setIsDirty }
}

function savedSessionData(call = 0): Record<string, unknown> {
  return (saveReportAssets.mock.calls[call][1] as { sessionData: Record<string, unknown> })
    .sessionData
}

describe('useManualCalculationCompletion', () => {
  beforeEach(() => {
    saveReportAssets.mockReset()
    saveReportAssets.mockResolvedValue(undefined)
    retryFailedSave.mockReset()
    retryFailedSave.mockResolvedValue(undefined)
    Object.values(toast).forEach((fn) => fn.mockReset())
    resetManualValuationSaveReceiptsForTests()
    useManualFormStore.setState({ formData: submittedForm })
  })

  afterEach(() => {
    useManualFormStore.getState().resetForm()
  })

  describe('retry after a failed first save (review of #44)', () => {
    it('re-sends the failed save through the service when the error screen replaced the workspace', async () => {
      // A failed first save of a new report swaps the workspace for the session
      // error screen: the run is no longer the target, and the toast's retry
      // used to return without doing anything.
      saveReportAssets.mockRejectedValueOnce(new Error('HTTP 503'))
      let stillTarget = true
      const run = submitRun({ isStillTarget: () => stillTarget })
      const { complete } = renderCompletion()

      await act(async () => {
        await complete(run)
      })
      const retry = toast.warning.mock.calls.at(-1)?.[1]?.action?.onClick as
        | (() => void)
        | undefined
      expect(retry).toBeTypeOf('function')

      stillTarget = false
      await act(async () => {
        retry?.()
        await Promise.resolve()
      })

      expect(retryFailedSave).toHaveBeenCalledWith(REPORT_ID)
    })
  })

  describe('edits made while the calculation runs (F-05)', () => {
    it('saves the submitted inputs and clears "inputs changed" when nothing was edited', async () => {
      const { complete, setIsDirty } = renderCompletion()

      await act(async () => {
        await complete()
      })

      expect(savedSessionData()).toMatchObject({
        company_name: 'Acme BV',
        founding_year: 2001,
        current_year_data: request.current_year_data,
      })
      expect(setIsDirty).toHaveBeenCalledWith(false)
      expect(setIsDirty).not.toHaveBeenCalledWith(true)
    })

    it('does not write the submit-time copy of an edited field back, and keeps the flag armed', async () => {
      const { complete, setIsDirty } = renderCompletion()
      // The advisor corrects the founding year and revenue while the engine is running.
      useManualFormStore.getState().updateFormData({
        founding_year: 1998,
        current_year_data: { year: 2025, revenue: 1_200_000, ebitda: 150_000 },
      })

      await act(async () => {
        await complete()
      })

      const sessionData = savedSessionData()
      // Titan merges this blob over the stored session: these keys would revert the edits.
      expect(sessionData).not.toHaveProperty('founding_year')
      expect(sessionData).not.toHaveProperty('current_year_data')
      expect(sessionData).not.toHaveProperty('revenue')
      // Untouched inputs and the result-bound keys are still saved.
      expect(sessionData).toMatchObject({
        company_name: 'Acme BV',
        number_of_employees: 12,
        _last_valuation_request: request,
      })
      expect(setIsDirty).toHaveBeenCalledWith(true)
      expect(setIsDirty).not.toHaveBeenCalledWith(false)
    })
  })

  describe('result announcement (F-08) and save receipt (F-11)', () => {
    it('announces the new result and records the durable save for the exit to Mercury', async () => {
      const { complete } = renderCompletion()
      const before = useManualResultsStore.getState().resultAnnouncementSeq

      await act(async () => {
        await complete()
      })

      expect(useManualResultsStore.getState().resultAnnouncementSeq).toBe(before + 1)
      expect(wasManualValuationSavedThisVisit([REPORT_ID])).toBe(true)
    })

    it('records no receipt when the result save fails', async () => {
      saveReportAssets.mockRejectedValueOnce(new Error('Request failed with status code 500'))
      const { complete } = renderCompletion()

      await act(async () => {
        await complete()
      })

      expect(wasManualValuationSavedThisVisit([REPORT_ID])).toBe(false)
    })
  })

  describe('failed result save (F-13)', () => {
    async function failFirstSave() {
      saveReportAssets.mockRejectedValueOnce(new Error('Request failed with status code 500'))
      const view = renderCompletion()
      await act(async () => {
        await view.complete()
      })
      expect(toast.error).not.toHaveBeenCalled()
      expect(toast.warning).toHaveBeenCalledTimes(1)
      const [title, options] = toast.warning.mock.calls[0]
      return { ...view, title, options }
    }

    it('explains that the result is kept and offers a retry instead of an alarming error', async () => {
      const { title, options, setDraftStatus } = await failFirstSave()

      expect(title).toBe('saveResultNotSaved')
      expect(options.description).toBe('saveResultRetryDesc')
      expect(options.action.label).toBe('saveRetry')
      expect(setDraftStatus).toHaveBeenLastCalledWith('draft')
    })

    it('re-sends the result on retry and marks it saved', async () => {
      const { options, setDraftStatus } = await failFirstSave()

      await act(async () => {
        options.action.onClick()
        await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('saveRetrySucceeded'))
      })

      expect(saveReportAssets).toHaveBeenCalledTimes(2)
      expect(saveReportAssets.mock.calls[1][0]).toBe(REPORT_ID)
      expect(setDraftStatus).toHaveBeenLastCalledWith('saved')
      expect(wasManualValuationSavedThisVisit([REPORT_ID])).toBe(true)
    })

    it('does not re-send once a newer result owns the report', async () => {
      const { options } = await failFirstSave()
      act(() => {
        useManualResultsStore.getState().announceNewResult()
      })

      await act(async () => {
        options.action.onClick()
      })

      expect(saveReportAssets).toHaveBeenCalledTimes(1)
    })

    it('leaves inputs edited after the failure out of the retried save', async () => {
      const { options } = await failFirstSave()
      useManualFormStore.getState().updateFormData({ founding_year: 1998 })

      await act(async () => {
        options.action.onClick()
        await vi.waitFor(() => expect(saveReportAssets).toHaveBeenCalledTimes(2))
      })

      expect(savedSessionData(0)).toHaveProperty('founding_year', 2001)
      expect(savedSessionData(1)).not.toHaveProperty('founding_year')
    })
  })
})
