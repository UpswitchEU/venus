import {
  type ComponentProps,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react'
import {
  type AgentChoiceSelection,
  ChatAssistantDrawer,
  type ChatMessage,
  type FieldContext,
  type ManualInputAssistantPatch,
  type ValuationFormData,
} from '../../../components/calculator'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import type { NormalizationItem } from '../../../components/calculator/UnifiedNormalizationModal'
import { applyManualCurrentYearBalance } from '../../../components/calculator/utils/manualFinancialRowMutations'
import { useStartupAssistantSurface } from '../../../lib/methods'
import { useManualResultsStore } from '../../../store/manual/useManualResultsStore'
import { usePreparerMultipleStore } from '../../../store/manual/usePreparerMultipleStore'
import type {
  ManualValuationFormData,
  ValuationFormData as StoreValuationFormData,
  ValuationMethodResult,
  ValuationResponse,
} from '../../../types/valuation'
import { findAcceptedAutoNormalizationCapBreaches } from '../../../utils/normalizationMath'
import type { ManualStarterPaywallReason } from '../components/ManualStarterPaywallModal'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import {
  buildAgentChoiceFollowUpPrompt,
  FINANCIAL_YEAR_CHOICE_PATH,
  METHOD_WEIGHT_CHOICE_PATH,
  parseAgentFinancialYearChoice,
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
type ChatSendHandler = (...args: Parameters<ChatDrawerProps['onSendMessage']>) => Promise<void>

const CHOICE_FOLLOW_UP_PATHS = new Set(['/api/valuations/scenario', '/api/profile/buyer-profile'])

function hasMatchingHistoricalFinancialYear(
  selectedYears: readonly number[],
  yearlyFinancials: readonly Pick<ManualLiveYearlyFinancial, 'year' | 'isForecast'>[]
): boolean {
  const selectedYearKeys = new Set(selectedYears.map(String))
  return yearlyFinancials.some((row) => !row.isForecast && selectedYearKeys.has(String(row.year)))
}

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
  integrationsEnabled: boolean
  isLoadingHistory: boolean
  isStartupAssistantRoute: boolean
  lastSubmittedDataRef: MutableRefObject<ValuationFormData | null>
  latestFormDataRef: MutableRefObject<Partial<ManualValuationFormData> | null>
  manualChatReportId: string
  mercuryLocale: ManualMercuryLocale
  openStarterPaywall: (reason: ManualStarterPaywallReason) => void
  pendingNormalizationCount: number
  normalizationItems: NormalizationItem[]
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
  integrationsEnabled,
  isLoadingHistory,
  isStartupAssistantRoute,
  lastSubmittedDataRef,
  latestFormDataRef,
  manualChatReportId,
  mercuryLocale,
  openStarterPaywall,
  pendingNormalizationCount,
  normalizationItems,
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
  const [assistantInputPatch, setAssistantInputPatch] = useState<ManualInputAssistantPatch | null>(
    null
  )
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

  const assistantLocale: 'en' | 'nl' | 'fr' =
    currentLocale === 'fr' ? 'fr' : currentLocale === 'nl' ? 'nl' : 'en'
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
    handleJumpToQualityWarning,
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
    integrationsEnabled,
    assistantPatch: assistantInputPatch,
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

  // Inline quality-warning fix: the advisor filled the warning's structured
  // fields in the chip. Write them to the form and re-run — no chat turn, no
  // live session. Today only the balance gap (net_debt_unavailable) has fields;
  // the corrected result drops the warning so the chip clears itself.
  const handleInlineFixQualityWarning = useCallback(
    async (warningType: string, values: Record<string, number>): Promise<void> => {
      if (warningType !== 'net_debt_unavailable') return
      const balance = {
        cash: values.cash,
        total_debt: values.total_debt,
        current_liabilities: values.current_liabilities,
      }
      // 1. Reflect the figures in the form so they persist and show in the
      //    financial inputs (id keyed on the values so a re-edit re-applies).
      setAssistantInputPatch({
        id: `net-debt:${balance.cash}:${balance.total_debt}:${balance.current_liabilities}`,
        type: 'set_current_year_balance',
        balance,
      })
      // 2. Re-run with the balance applied to the latest actual year. The engine
      //    reads net debt from current_year_data; the shared mutation also keeps
      //    the matching yearly row in sync and handles the no-current_year case.
      //    Mirrors handleApproveValuationRun's submit path.
      const mergedSubmitData = applyManualCurrentYearBalance(
        buildLiveValuationSubmitData(),
        balance
      )
      await Promise.resolve(handleManualSubmit(mergedSubmitData))
    },
    [buildLiveValuationSubmitData, handleManualSubmit]
  )

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

      if (submitPath === FINANCIAL_YEAR_CHOICE_PATH) {
        const years = parseAgentFinancialYearChoice(choice)
        const latestRows = latestFormDataRef.current?.yearlyFinancials
        const financialRows =
          Array.isArray(latestRows) && latestRows.length > 0
            ? latestRows
            : getLiveYearlyFinancials()
        if (years && hasMatchingHistoricalFinancialYear(years, financialRows)) {
          setAssistantInputPatch({
            id: `${choice.id}:${years.join(',')}`,
            type: 'select_financial_years',
            years,
          })
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
    [currentLocale, getLiveYearlyFinancials, handleChatMessage, latestFormDataRef]
  )

  const assistantSuggestionContext = useMemo(() => {
    const yearly = getLiveYearlyFinancials()
    const availableYears = yearly
      .filter((row) => !row.isForecast)
      .map((row) => Number(row.year))
      .filter((y) => Number.isFinite(y))
    const reportedByYear: Record<number, number> = {}
    for (const row of yearly) {
      if (row.isForecast) continue
      const y = Number(row.year)
      if (!Number.isFinite(y)) continue
      const ebitda = Number(row.ebitda)
      if (Number.isFinite(ebitda)) reportedByYear[y] = ebitda
    }
    const fallbackYear = availableYears[availableYears.length - 1] ?? new Date().getFullYear()
    const breaches = findAcceptedAutoNormalizationCapBreaches({
      items: normalizationItems,
      availableYears,
      reportedEbitdaByYear: reportedByYear,
      fallbackYear,
    })
    return {
      acceptedNormalizationsCount: normalizationItems.filter((n) => n.status === 'accepted').length,
      hasCapBreach: breaches.length > 0,
    }
  }, [getLiveYearlyFinancials, normalizationItems])

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
    acceptedNormalizationsCount: assistantSuggestionContext.acceptedNormalizationsCount,
    hasCapBreach: assistantSuggestionContext.hasCapBreach,
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
    onInlineFixQualityWarning: handleInlineFixQualityWarning,
    onJumpToQualityWarning: handleJumpToQualityWarning,
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
