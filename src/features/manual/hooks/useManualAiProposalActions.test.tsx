import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ValuationFormData } from '@/components/calculator'
import {
  STARTUP_SUBMIT_REVIEW_REQUEST_EVENT,
  type StartupSubmitReviewRequestDetail,
} from '@/features/startup-studio/utils/startupSubmitReviewRequest'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { buildManualLiveValuationSubmitData } from '../utils/manualInputData'
import { useManualAiProposalActions } from './useManualAiProposalActions'
import { useManualSubmitController } from './useManualSubmitController'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/analytics', () => ({
  trackReturnToMercury: vi.fn(),
}))

// Only the engine call and what follows it are stubbed: the approved-run tests below
// drive the real submit controller up to the point where it would calculate.
const calculationMocks = vi.hoisted(() => ({
  runManualCalculationExecution: vi.fn(),
  handleManualSubmitError: vi.fn(),
}))

vi.mock('./useManualCalculationExecution', () => ({
  useManualCalculationExecution: () => ({
    runManualCalculationExecution: calculationMocks.runManualCalculationExecution,
  }),
}))

vi.mock('./useManualCalculationCompletion', () => ({
  useManualCalculationCompletion: () => ({ completeManualCalculation: vi.fn() }),
}))

vi.mock('./useManualSubmitErrorHandler', () => ({
  useManualSubmitErrorHandler: () => ({
    handleManualSubmitError: calculationMocks.handleManualSubmitError,
  }),
}))

const initialManualResultsSnapshot = useManualResultsStore.getState()
const initialManualFormSnapshot = useManualFormStore.getState()
const startupSubmitReviewListeners = new Set<EventListener>()

function createChatMessage(): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-25T12:00:00Z'),
    valuationRunRequests: [
      {
        id: 'proposal-1',
        status: 'pending_approval',
        methods: ['startup_valuation'],
      },
    ],
  }
}

function createReportGenerationMessage(): ChatMessage {
  return {
    id: 'message-2',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-05-25T12:00:00Z'),
    reportGenerationRequests: [
      {
        id: 'report-1',
        status: 'pending_approval',
        reportId: 'valuation-1',
      },
    ],
  }
}

function createSubmitData(): ValuationFormData {
  return {
    companyName: 'Acme',
    businessType: 'startup',
    industry: 'technology',
    country: 'BE',
    yearFounded: 2026,
    yearlyFinancials: [],
    ownerManagers: 1,
    fteEmployees: 0,
  } as unknown as ValuationFormData
}

describe('useManualAiProposalActions', () => {
  afterEach(() => {
    useManualResultsStore.setState(initialManualResultsSnapshot, true)
    for (const listener of startupSubmitReviewListeners) {
      window.removeEventListener(STARTUP_SUBMIT_REVIEW_REQUEST_EVENT, listener)
    }
    startupSubmitReviewListeners.clear()
  })

  it('routes startup valuation approvals through the startup submit review request', () => {
    const handleManualSubmit = vi.fn()
    const buildLiveValuationSubmitData = vi.fn(createSubmitData)
    const lastSubmittedDataRef = { current: null }
    const postValuationListingHandoffPendingRef = { current: false }
    let onWillSubmit: (() => void) | undefined
    const handleReviewRequest = (event: Event) => {
      const detail = (event as CustomEvent<StartupSubmitReviewRequestDetail>).detail
      onWillSubmit = detail.onWillSubmit
      detail.respond?.('opened')
    }
    window.addEventListener(STARTUP_SUBMIT_REVIEW_REQUEST_EVENT, handleReviewRequest)
    startupSubmitReviewListeners.add(handleReviewRequest)

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([createChatMessage()])
      const actions = useManualAiProposalActions({
        activeSessionKey: null,
        buildLiveValuationSubmitData,
        clientContextId: null,
        contextRelationshipId: null,
        handlePdfExport: null,
        handleManualSubmit,
        isStartupAssistantRoute: true,
        lastSubmittedDataRef,
        mercuryLocale: 'nl',
        postValuationListingHandoffPendingRef,
        reportId: null,
        resolvedReportId: null,
        resultValuationId: null,
        session: null,
        setChatMessages: setMessages,
      })
      return { actions, messages }
    })

    act(() => {
      result.current.actions.handleApproveValuationRun('proposal-1', undefined, [
        'startup_valuation',
      ])
    })

    expect(handleManualSubmit).not.toHaveBeenCalled()
    expect(buildLiveValuationSubmitData).not.toHaveBeenCalled()
    expect(postValuationListingHandoffPendingRef.current).toBe(false)
    expect(result.current.messages[0]?.valuationRunRequests?.[0]?.decision).toBeUndefined()

    act(() => {
      onWillSubmit?.()
    })

    expect(postValuationListingHandoffPendingRef.current).toBe(true)
    expect(result.current.messages[0]?.valuationRunRequests?.[0]?.decision).toBe('approved')
  })

  it('keeps the existing direct submit path for non-startup valuation approvals', () => {
    const submitData = createSubmitData()
    // Stands in for the submit controller starting the run.
    const handleManualSubmit = vi.fn(
      (_data: ValuationFormData, options?: { onWillSubmit?: () => void }) => {
        options?.onWillSubmit?.()
      }
    )
    const buildLiveValuationSubmitData = vi.fn(() => submitData)
    const lastSubmittedDataRef = { current: null }
    const postValuationListingHandoffPendingRef = { current: false }

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([createChatMessage()])
      const actions = useManualAiProposalActions({
        activeSessionKey: null,
        buildLiveValuationSubmitData,
        clientContextId: null,
        contextRelationshipId: null,
        handlePdfExport: null,
        handleManualSubmit,
        isStartupAssistantRoute: false,
        lastSubmittedDataRef,
        mercuryLocale: 'nl',
        postValuationListingHandoffPendingRef,
        reportId: null,
        resolvedReportId: null,
        resultValuationId: null,
        session: null,
        setChatMessages: setMessages,
      })
      return { actions, messages }
    })

    act(() => {
      result.current.actions.handleApproveValuationRun('proposal-1', undefined, ['dcf'])
    })

    expect(handleManualSubmit).toHaveBeenCalledWith(submitData, {
      onWillSubmit: expect.any(Function),
    })
    expect(postValuationListingHandoffPendingRef.current).toBe(true)
    expect(result.current.messages[0]?.valuationRunRequests?.[0]?.decision).toBe('approved')
  })

  it('routes report-generation approvals through the manual PDF export controller', async () => {
    const handlePdfExport = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([createReportGenerationMessage()])
      const actions = useManualAiProposalActions({
        activeSessionKey: null,
        buildLiveValuationSubmitData: createSubmitData,
        clientContextId: null,
        contextRelationshipId: null,
        handlePdfExport,
        handleManualSubmit: vi.fn(),
        isStartupAssistantRoute: false,
        lastSubmittedDataRef: { current: null },
        mercuryLocale: 'nl',
        postValuationListingHandoffPendingRef: { current: false },
        reportId: null,
        resolvedReportId: null,
        resultValuationId: null,
        session: null,
        setChatMessages: setMessages,
      })
      return { actions, messages }
    })

    await act(async () => {
      result.current.actions.handleApproveReportGeneration('report-1', 'valuation-1')
      await Promise.resolve()
    })

    expect(handlePdfExport).toHaveBeenCalledTimes(1)
    expect(result.current.messages[0]?.reportGenerationRequests?.[0]?.decision).toBe('approved')
  })

  it('does not mark report-generation proposals approved when PDF export is unavailable', () => {
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([createReportGenerationMessage()])
      const actions = useManualAiProposalActions({
        activeSessionKey: null,
        buildLiveValuationSubmitData: createSubmitData,
        clientContextId: null,
        contextRelationshipId: null,
        handlePdfExport: null,
        handleManualSubmit: vi.fn(),
        isStartupAssistantRoute: false,
        lastSubmittedDataRef: { current: null },
        mercuryLocale: 'nl',
        postValuationListingHandoffPendingRef: { current: false },
        reportId: null,
        resolvedReportId: null,
        resultValuationId: null,
        session: null,
        setChatMessages: setMessages,
      })
      return { actions, messages }
    })

    act(() => {
      result.current.actions.handleApproveReportGeneration('report-1', 'valuation-1')
    })

    expect(result.current.messages[0]?.reportGenerationRequests?.[0]?.decision).toBeUndefined()
  })
})

const identity = (key: string) => key

/** A company the assistant may value: everything known except, per test, the headcount. */
const approvedRunInitialData: Partial<ValuationFormData> = {
  companyName: 'Acme',
  businessType: 'consulting',
  businessStructure: 'bv',
  country: 'BE',
  ownerManagers: 1,
  yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
}

/**
 * The approved run as the workspace wires it: the proposal action builds the live submit
 * data and hands it to the real submit controller, whose shared check runs first.
 */
function renderApprovedRunWiring(liveData: Partial<ValuationFormData> | null) {
  const trySetCalculating = vi.fn(() => true)
  const postValuationListingHandoffPendingRef = { current: false }
  const rendered = renderHook(() => {
    const [messages, setMessages] = useState<ChatMessage[]>([createChatMessage()])
    const { handleManualSubmit, lastSubmittedDataRef } = useManualSubmitController({
      calculationRequestIdentifiers: {},
      createVersion: vi.fn(),
      currentLocale: 'en',
      durableSaveInFlightRef: { current: false },
      getLatestVersion: () => null,
      isAccountantMode: true,
      lastSubmittedFinancialSnapshotRef: { current: null },
      linkedIdentifier: null,
      preSelectedMethod: null,
      reportId: 'val_1_demo',
      resolvedReportId: null,
      restorationComplete: false,
      result: null,
      selectedMethod: 'upswitch_adaptive',
      setCalculating: vi.fn(),
      setCollectedData: vi.fn(),
      setDraftStatus: vi.fn(),
      setIsDirty: vi.fn(),
      setIsGenerating: vi.fn(),
      setLastSaved: vi.fn(),
      setResult: vi.fn(),
      startProposalVersionLabelRef: { current: null },
      synthesisSelection: { preSelectedMethods: [], userWeights: {} },
      translate: identity,
      translateErrors: identity,
      translateHistory: identity,
      translatePreparer: identity,
      translateReport: identity,
      trySetCalculating,
      updateFormData: (updates) => useManualFormStore.getState().updateFormData(updates),
      versionSyncTimeoutRef: { current: null },
      warnIfSubmitSynthesisSkipped: vi.fn(),
    })
    const actions = useManualAiProposalActions({
      activeSessionKey: null,
      buildLiveValuationSubmitData: () =>
        buildManualLiveValuationSubmitData({
          initialData: approvedRunInitialData,
          liveData,
          fallbackYearlyFinancials: [],
        }),
      clientContextId: null,
      contextRelationshipId: null,
      handlePdfExport: null,
      handleManualSubmit,
      isStartupAssistantRoute: false,
      lastSubmittedDataRef,
      mercuryLocale: 'nl',
      postValuationListingHandoffPendingRef,
      reportId: null,
      resolvedReportId: null,
      resultValuationId: null,
      session: null,
      setChatMessages: setMessages,
    })
    return { actions, messages }
  })
  return { ...rendered, postValuationListingHandoffPendingRef, trySetCalculating }
}

describe('useManualAiProposalActions approved valuation run', () => {
  beforeEach(() => {
    vi.mocked(toast.warning).mockClear()
    calculationMocks.runManualCalculationExecution.mockReset().mockResolvedValue({ aborted: true })
    calculationMocks.handleManualSubmitError.mockReset()
  })

  afterEach(() => {
    useManualResultsStore.setState(initialManualResultsSnapshot, true)
    useManualFormStore.setState(initialManualFormSnapshot, true)
  })

  // E-04a: this run skips the panel's field check, and it used to fill an unknown
  // headcount with 0 — with one owner, a sole trader to the engine.
  it('refuses the run with a toast when no source gave a headcount', async () => {
    const { result, postValuationListingHandoffPendingRef, trySetCalculating } =
      renderApprovedRunWiring(null)

    await act(async () => {
      result.current.actions.handleApproveValuationRun('proposal-1', undefined, null)
    })

    expect(toast.warning).toHaveBeenCalledWith('employeeCountMissing', {
      description: 'employeeCountMissingDesc',
    })
    expect(trySetCalculating).not.toHaveBeenCalled()
    expect(calculationMocks.runManualCalculationExecution).not.toHaveBeenCalled()
    // Nothing ran, so the proposal stays open and the next calculation the advisor starts
    // by hand does not inherit the listing handoff.
    expect(result.current.messages[0]?.valuationRunRequests?.[0]?.decision).toBeUndefined()
    expect(postValuationListingHandoffPendingRef.current).toBe(false)
  })

  it('calculates with the headcount the advisor typed, 0 included', async () => {
    const { result, postValuationListingHandoffPendingRef } = renderApprovedRunWiring({
      fteEmployees: 0,
    })

    await act(async () => {
      result.current.actions.handleApproveValuationRun('proposal-1', undefined, null)
    })

    expect(toast.warning).not.toHaveBeenCalled()
    expect(calculationMocks.handleManualSubmitError).not.toHaveBeenCalled()
    expect(calculationMocks.runManualCalculationExecution).toHaveBeenCalledTimes(1)
    expect(calculationMocks.runManualCalculationExecution.mock.calls[0]?.[0].request).toMatchObject(
      { number_of_employees: 0, number_of_owners: 1 }
    )
    expect(result.current.messages[0]?.valuationRunRequests?.[0]?.decision).toBe('approved')
    expect(postValuationListingHandoffPendingRef.current).toBe(true)
  })
})
