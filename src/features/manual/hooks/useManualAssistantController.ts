import {
  type ComponentProps,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
} from 'react'
import {
  type AgentChoiceSelection,
  ChatAssistantDrawer,
  type ChatMessage,
  type FieldContext,
  type ValuationFormData,
} from '../../../components/calculator'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import { useStartupAssistantSurface } from '../../../lib/methods'
import { useManualResultsStore } from '../../../store/manual/useManualResultsStore'
import { usePreparerMultipleStore } from '../../../store/manual/usePreparerMultipleStore'
import type {
  ManualValuationFormData,
  ValuationFormData as StoreValuationFormData,
  ValuationMethodResult,
  ValuationResponse,
} from '../../../types/valuation'
import type { ManualStarterPaywallReason } from '../components/ManualStarterPaywallModal'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import {
  buildAgentChoiceFollowUpPrompt,
  METHOD_WEIGHT_CHOICE_PATH,
  parseAgentMethodWeightChoice,
  parseAgentValuationScenarioChoice,
  VALUATION_SCENARIO_CHOICE_PATH,
} from '../utils/manualAgentChoiceActions'
import { canonicalAgentMethodSelection } from '../utils/manualAiValuationMethods'
import type { ManualPendingFieldUpdate } from '../utils/manualChatCommandHandling'
import {
  buildManualInputInitialData,
  buildManualLiveValuationSubmitData,
} from '../utils/manualInputData'
import type { ManualLiveYearlyFinancial } from '../utils/manualLiveYearlyFinancials'
import type { ManualMercuryLocale } from '../utils/manualMercuryNavigation'
import {
  buildManualQualityWarnings,
  type ManualQualityWarningTranslator,
} from '../utils/manualQualityWarnings'
import { formatManualStartupAssistantPrompt } from '../utils/manualStartupAssistantPrompt'
import { getManualStartupLauncherScopeId } from '../utils/manualStartupAssistantSurface'
import { useManualAiProposalActions } from './useManualAiProposalActions'
import { useManualAssistantIssueActions } from './useManualAssistantIssueActions'

type ChatDrawerProps = ComponentProps<typeof ChatAssistantDrawer>
type ManualInputProps = ComponentProps<typeof StartupAwareInputPanel>
type ChatSendHandler = (
  ...args: Parameters<ChatDrawerProps['onSendMessage']>
) => void | Promise<void>

const CHOICE_FOLLOW_UP_PATHS = new Set([
  '/api/valuations/years',
  '/api/valuations/scenario',
  '/api/profile/buyer-profile',
])

export interface UseManualAssistantControllerParams {
  acknowledgedQualityWarnings: Set<string>
  acknowledgedStartupIssues: Set<string>
  activeSessionKey?: string | null
  autoAdvancePastPrefilledSteps: boolean
  chatDrawerOpen: boolean
  chatMessages: ChatMessage[]
  clientContextId?: string | null
  collectedData: CollectedData
  contextRelationshipId?: string | null
  currentLocale: string
  fieldContext?: FieldContext
  formActivityCode?: string | null
  formNaceCode?: string | null
  formStoreData: Partial<StoreValuationFormData>
  handlePdfExport?: (() => Promise<unknown>) | null
  getLiveYearlyFinancials: () => ManualLiveYearlyFinancial[]
  handleAcceptNormalisation: NonNullable<ChatDrawerProps['onAcceptNormalisation']>
  handleAcceptUpdate: NonNullable<ChatDrawerProps['onAcceptUpdate']>
  handleApplyFieldUpdate: NonNullable<ChatDrawerProps['onApplyFieldUpdate']>
  handleCSVImportComplete: ManualInputProps['onCSVImportComplete']
  handleChatMessage: ChatSendHandler
  handleFieldHelpRequest: ManualInputProps['onFieldHelpRequest']
  handleFormDataChange: ManualInputProps['onFormDataChange']
  handleManualSubmit: (data: ValuationFormData) => void | Promise<void>
  handleNewConversation: NonNullable<ChatDrawerProps['onNewConversation']>
  handleShowNormalisationReview: ManualInputProps['onViewAllNormalizations']
  handleRejectNormalisation: NonNullable<ChatDrawerProps['onRejectNormalisation']>
  handleRejectUpdate: NonNullable<ChatDrawerProps['onRejectUpdate']>
  handleRetry: NonNullable<ChatDrawerProps['onRetry']>
  hasReport: boolean
  isAccountantMode: boolean
  isCalculating: boolean
  isChatGenerating: boolean
  isGenerating: boolean
  isLoadingHistory: boolean
  isStartupAssistantRoute: boolean
  lastSubmittedDataRef: MutableRefObject<ValuationFormData | null>
  latestFormDataRef: MutableRefObject<Partial<ManualValuationFormData> | null>
  manualChatReportId: string
  mercuryLocale: ManualMercuryLocale
  openStarterPaywall: (reason: ManualStarterPaywallReason) => void
  pendingNormalizationCount: number
  pendingUpdates: ManualPendingFieldUpdate[]
  postValuationListingHandoffPendingRef: MutableRefObject<boolean>
  readOnlyKbo: boolean
  reportId: string
  resolvedReportId?: string | null
  restoredYearlyFinancials?: ManualLiveYearlyFinancial[]
  result: ValuationResponse | null
  session: unknown
  setAcknowledgedQualityWarnings: Dispatch<SetStateAction<Set<string>>>
  setAcknowledgedStartupIssues: Dispatch<SetStateAction<Set<string>>>
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setUserWeightJustification: (justification: string) => void
  setUserWeights: (weights: Record<string, number>) => void
  startupToolInProgress?: string | null
  synthesisUnlocked: boolean
  synthesisValuationResults: Record<string, ValuationMethodResult> | null
  translateQualityWarningCta: ManualQualityWarningTranslator
  userWeightJustification: string
  userWeights: Record<string, number>
  wrappedOnSubmit: ManualInputProps['onSubmit']
}

export interface UseManualAssistantControllerResult {
  assistantOpenTasksCount: number
  chatDrawerProps: ChatDrawerProps
  manualInputProps: ManualInputProps
}

export function useManualAssistantController({
  acknowledgedQualityWarnings,
  acknowledgedStartupIssues,
  activeSessionKey,
  autoAdvancePastPrefilledSteps,
  chatDrawerOpen,
  chatMessages,
  clientContextId,
  collectedData,
  contextRelationshipId,
  currentLocale,
  fieldContext,
  formActivityCode,
  formNaceCode,
  formStoreData,
  handlePdfExport,
  getLiveYearlyFinancials,
  handleAcceptNormalisation,
  handleAcceptUpdate,
  handleApplyFieldUpdate,
  handleCSVImportComplete,
  handleChatMessage,
  handleFieldHelpRequest,
  handleFormDataChange,
  handleManualSubmit,
  handleNewConversation,
  handleShowNormalisationReview,
  handleRejectNormalisation,
  handleRejectUpdate,
  handleRetry,
  hasReport,
  isAccountantMode,
  isCalculating,
  isChatGenerating,
  isGenerating,
  isLoadingHistory,
  isStartupAssistantRoute,
  lastSubmittedDataRef,
  latestFormDataRef,
  manualChatReportId,
  mercuryLocale,
  openStarterPaywall,
  pendingNormalizationCount,
  pendingUpdates,
  postValuationListingHandoffPendingRef,
  readOnlyKbo,
  reportId,
  resolvedReportId,
  restoredYearlyFinancials,
  result,
  session,
  setAcknowledgedQualityWarnings,
  setAcknowledgedStartupIssues,
  setChatDrawerOpen,
  setChatMessages,
  setUserWeightJustification,
  setUserWeights,
  startupToolInProgress,
  synthesisUnlocked,
  synthesisValuationResults,
  translateQualityWarningCta,
  userWeightJustification,
  userWeights,
  wrappedOnSubmit,
}: UseManualAssistantControllerParams): UseManualAssistantControllerResult {
  const hasEbitda = useMemo(() => {
    const currentYear = formStoreData?.current_year_data as { ebitda?: number } | undefined
    const historicalYears = (formStoreData?.historical_years_data || []) as Array<{
      ebitda?: number
    }>
    return (
      Boolean(currentYear && (currentYear.ebitda ?? 0) !== 0) ||
      historicalYears.some((year) => (year.ebitda ?? 0) !== 0)
    )
  }, [formStoreData?.current_year_data, formStoreData?.historical_years_data])

  const assistantLocale: 'en' | 'nl' = currentLocale === 'nl' ? 'nl' : 'en'
  const formatStartupAssistantPrompt = useCallback(
    (prompt: string) => formatManualStartupAssistantPrompt(prompt, assistantLocale),
    [assistantLocale]
  )

  const { startupIssues, startupLauncherIssues, startupIssueById } = useStartupAssistantSurface({
    isStartupAssistantRoute,
    acknowledgedStartupIssues,
    assistantLocale,
    formatStartupAssistantPrompt,
  })

  const startupLauncherScopeId = useMemo(() => {
    return getManualStartupLauncherScopeId({ session, resolvedReportId, reportId })
  }, [reportId, resolvedReportId, session])

  const {
    handleResolveStartupLauncherIssue,
    handleResolveQualityWarning,
    handleDismissQualityWarning,
    handleResolveStartupIssue,
    handleApplyStartupIssueQuickFix,
    handleDismissStartupIssue,
    handleJumpToStartupIssue,
  } = useManualAssistantIssueActions({
    assistantLocale,
    formatStartupAssistantPrompt,
    handleChatMessage,
    setAcknowledgedQualityWarnings,
    setAcknowledgedStartupIssues,
    setChatDrawerOpen,
    startupIssueById,
  })

  const initialData = useMemo(
    () =>
      buildManualInputInitialData({
        collectedData,
        formStoreData,
        formActivityCode,
        formNaceCode,
        restoredYearlyFinancials,
      }),
    [collectedData, formActivityCode, formNaceCode, formStoreData, restoredYearlyFinancials]
  )

  const manualInputProps: ManualInputProps = {
    onSubmit: wrappedOnSubmit,
    onCSVImportComplete: handleCSVImportComplete,
    isCalculating: isGenerating || isCalculating,
    onFieldHelpRequest: handleFieldHelpRequest,
    onViewAllNormalizations: handleShowNormalisationReview,
    onFormDataChange: handleFormDataChange,
    formDataRef: latestFormDataRef as MutableRefObject<Record<string, unknown> | null>,
    readOnlyKbo,
    autoAdvancePastPrefilledSteps,
    synthesisWeights: userWeights,
    synthesisJustification: userWeightJustification,
    onSynthesisWeightsChange: setUserWeights,
    onSynthesisJustificationChange: setUserWeightJustification,
    synthesisUnlocked,
    synthesisValuationResults,
    onSynthesisPaywall: () => openStarterPaywall('synthesis'),
    initialData,
    isAssistantOpen: chatDrawerOpen,
    onOpenAssistant: () => setChatDrawerOpen(true),
    onResolveIssueWithAssistant: handleResolveStartupLauncherIssue,
    startupLauncherIssues,
    startupLauncherScopeId,
  }

  const buildLiveValuationSubmitData = useCallback((): ValuationFormData => {
    return buildManualLiveValuationSubmitData({
      initialData,
      liveData: latestFormDataRef.current,
      fallbackYearlyFinancials: getLiveYearlyFinancials(),
    })
  }, [initialData, getLiveYearlyFinancials, latestFormDataRef.current])

  const qualityWarnings = useMemo(() => {
    return buildManualQualityWarnings({
      result,
      acknowledgedTypes: acknowledgedQualityWarnings,
      translateCta: translateQualityWarningCta,
    })
  }, [result, acknowledgedQualityWarnings, translateQualityWarningCta])

  const {
    handleApproveValuationRun,
    handleRejectValuationRun,
    handleApproveReportGeneration,
    handleRejectReportGeneration,
    handleApproveSellabilityRun,
    handleRejectSellabilityRun,
    handleApproveListingCreate,
    handleRejectListingCreate,
  } = useManualAiProposalActions({
    activeSessionKey,
    buildLiveValuationSubmitData,
    clientContextId,
    contextRelationshipId,
    handlePdfExport,
    handleManualSubmit,
    isStartupAssistantRoute,
    lastSubmittedDataRef,
    mercuryLocale,
    postValuationListingHandoffPendingRef,
    reportId,
    resolvedReportId,
    resultValuationId: result?.valuation_id,
    session,
    setChatMessages,
  })

  const handleApplyAgentChoice = useCallback(
    async (choice: AgentChoiceSelection): Promise<boolean> => {
      const submitPath = choice.submitPath?.trim()
      const selectedValues =
        choice.kind === 'multi_select' ? (choice.values ?? []) : choice.value ? [choice.value] : []

      if (submitPath === '/api/valuations/methods') {
        const methods = canonicalAgentMethodSelection(selectedValues)
        if (methods.length === 0) {
          throw new Error('No supported valuation methods selected.')
        }
        useManualResultsStore.getState().setPreSelectedMethods(methods)
        return true
      }

      if (submitPath === METHOD_WEIGHT_CHOICE_PATH) {
        const state = useManualResultsStore.getState()
        const parsed = parseAgentMethodWeightChoice(choice, state.preSelectedMethods)
        if (parsed) {
          state.setPreSelectedMethods(parsed.methods)
          useManualResultsStore.getState().setUserWeights(parsed.weights)
          if (parsed.justification) {
            useManualResultsStore.getState().setUserWeightJustification(parsed.justification)
          }
          return true
        }
        await Promise.resolve(
          handleChatMessage(buildAgentChoiceFollowUpPrompt(choice, currentLocale))
        )
        return true
      }

      if (submitPath === VALUATION_SCENARIO_CHOICE_PATH) {
        const state = usePreparerMultipleStore.getState()
        const parsed = parseAgentValuationScenarioChoice(choice, state.benchmarkMedian)
        if (parsed) {
          if (parsed.reasonKey === '') {
            state.resetToBenchmark()
          } else {
            state.setAppliedMedian(parsed.appliedMedian)
            state.setReasonKey(parsed.reasonKey)
          }
          return true
        }
      }

      if (submitPath && CHOICE_FOLLOW_UP_PATHS.has(submitPath)) {
        await Promise.resolve(
          handleChatMessage(buildAgentChoiceFollowUpPrompt(choice, currentLocale))
        )
        return true
      }

      return false
    },
    [currentLocale, handleChatMessage]
  )

  const chatDrawerProps: ChatDrawerProps = {
    open: chatDrawerOpen,
    onOpenChange: setChatDrawerOpen,
    messages: chatMessages,
    onSendMessage: handleChatMessage,
    isGenerating: isChatGenerating || isLoadingHistory,
    companyName: collectedData.companyName,
    fieldContext,
    hasReport,
    hasEbitda,
    pendingNormalizationsCount: pendingNormalizationCount,
    onApplyFieldUpdate: handleApplyFieldUpdate,
    pendingUpdates,
    onAcceptUpdate: handleAcceptUpdate,
    onRejectUpdate: handleRejectUpdate,
    startupIssues,
    onResolveStartupIssue: handleResolveStartupIssue,
    onApplyStartupIssueQuickFix: handleApplyStartupIssueQuickFix,
    onDismissStartupIssue: handleDismissStartupIssue,
    onJumpToStartupIssue: handleJumpToStartupIssue,
    qualityWarnings,
    onResolveQualityWarning: handleResolveQualityWarning,
    onDismissQualityWarning: handleDismissQualityWarning,
    onAcceptNormalisation: handleAcceptNormalisation,
    onRejectNormalisation: handleRejectNormalisation,
    onApproveValuationRun: handleApproveValuationRun,
    onRejectValuationRun: handleRejectValuationRun,
    onApproveReportGeneration: handleApproveReportGeneration,
    onRejectReportGeneration: handleRejectReportGeneration,
    onApproveSellabilityRun: handleApproveSellabilityRun,
    onRejectSellabilityRun: handleRejectSellabilityRun,
    onApproveListingCreate: handleApproveListingCreate,
    onRejectListingCreate: handleRejectListingCreate,
    onApplyAgentChoice: handleApplyAgentChoice,
    toolInProgress: startupToolInProgress,
    onRetry: handleRetry,
    onNewConversation: handleNewConversation,
  }

  return {
    assistantOpenTasksCount: pendingUpdates.length + qualityWarnings.length + startupIssues.length,
    chatDrawerProps,
    manualInputProps,
  }
}
