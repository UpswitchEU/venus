import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ValuationFormData } from '@/components/calculator'
import {
  STARTUP_SUBMIT_REVIEW_REQUEST_EVENT,
  type StartupSubmitReviewRequestDetail,
} from '@/features/startup-studio/utils/startupSubmitReviewRequest'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { useManualAiProposalActions } from './useManualAiProposalActions'

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

const initialManualResultsSnapshot = useManualResultsStore.getState()
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
    const handleManualSubmit = vi.fn()
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

    expect(handleManualSubmit).toHaveBeenCalledWith(submitData)
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
