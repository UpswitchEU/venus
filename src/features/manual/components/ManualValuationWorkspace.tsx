'use client'
import { useLocale, useTranslations } from 'next-intl'
import React from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapPrefill } from '../../../hooks/useBootstrapPrefill'
import { useCredits } from '../../../hooks/useCredits'
import { useFormSessionSync } from '../../../hooks/useFormSessionSync'
import { usePrefillRestorationCoordinator } from '../../../hooks/usePrefillRestorationCoordinator'
import { usePreSelectedMethodSessionSync } from '../../../hooks/usePreSelectedMethodSessionSync'
import { useSessionDataPrefill } from '../../../hooks/useSessionDataPrefill'
import { useSessionOptionalMethodPrefill } from '../../../hooks/useSessionOptionalMethodPrefill'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import {
  useManualAccountantContext,
  useManualAssistantAcknowledgementState,
  useManualAssistantController,
  useManualChatController,
  useManualCollectedDataController,
  useManualFinancialContext,
  useManualFormDataChangeSync,
  useManualKeyboardShortcuts,
  useManualLayoutResets,
  useManualMethodAccessState,
  useManualMethodPersistenceController,
  useManualModalState,
  useManualNavigationController,
  useManualNormalizationController,
  useManualNormalizationState,
  useManualPanelStorageReset,
  useManualRecalculateConfirmation,
  useManualReportIdentifiers,
  useManualReportReadinessController,
  useManualReportUiState,
  useManualRestoredFinancialSnapshotBaseline,
  useManualSessionPersistenceLifecycles,
  useManualSubmitController,
  useManualSynthesisController,
  useManualSynthesisSkippedWarnings,
  useManualToastMessageLifecycle,
  useManualVersionNavigation,
  useManualVersionSyncTimeoutRef,
  useManualWorkspaceStores,
  useResultToReportBridge,
  useSynthesisReportHeadlineSync,
} from '../hooks'
import {
  ACCOUNTING_RECONNECT_STATUS_EVENT,
  type RecoveryPhase,
  readAccountingReconnectIntentSummary,
} from '../utils/accountingReconnectResume'
import { AccountingReconnectRecovery } from './AccountingReconnectRecovery'
import { ManualLayoutChrome } from './ManualLayoutChrome'
import { ManualLayoutSessionGate } from './ManualLayoutSessionGate'
import type { CollectedData } from './manualLayoutDataTypes'
import { useManualLayoutViewport } from './manualLayoutShell'
import type { ManualValuationWorkspaceProps } from './manualValuationWorkspaceTypes'
import { useManualLayoutPreviewState } from './useManualLayoutPreviewState'
import { useManualReportCommands } from './useManualReportCommands'

export const ManualValuationWorkspace: React.FC<ManualValuationWorkspaceProps> = (props) => {
  return (
    <ManualLayoutSessionGate reportId={props.reportId}>
      <ManualValuationWorkspaceLoaded {...props} />
    </ManualLayoutSessionGate>
  )
}

const ManualValuationWorkspaceLoaded: React.FC<ManualValuationWorkspaceProps> = ({
  reportId,
  onComplete,
  accountantCustomerId,
  initialVersion,
  initialMode = 'edit',
  initialTab = 'preview',
  urlAction,
  initialDrawerOpen = false,
  initialAgentNext,
  guidedResolutionUrl,
  initialSelectedMethodFromUrl,
  initialSelectedMethodsFromUrl,
}) => {
  const t = useTranslations('toast')
  const tReport = useTranslations('report')
  const tHistory = useTranslations('historyPanel')
  const tErrors = useTranslations('errors')
  const tPreparer = useTranslations('preparerMultiple')
  const tMethodSelector = useTranslations('manualInput.methodSelector')
  const [accountingReconnectContext, setAccountingReconnectContext] = React.useState<Record<
    string,
    unknown
  > | null>(null)
  const handleAccountingReconnectRecovered = React.useCallback(
    () => setAccountingReconnectContext(null),
    []
  )
  const { isMobile } = useManualLayoutViewport()
  useManualPanelStorageReset()
  useManualToastMessageLifecycle(t)
  const { user } = useAuth()
  const { allowedMethodKeys, normalizedPlanType, planFeatures } = useCredits()
  const { identity, isAccountantFlow } = useBootstrap()
  const { readOnlyKbo, autoAdvancePastPrefilledSteps } = useBootstrapPrefill()
  useSessionOptionalMethodPrefill()
  useSessionDataPrefill()
  const {
    isCalculating,
    result,
    htmlReport: standaloneHtmlReport,
    selectedMethod,
    setSelectedMethod,
    preSelectedMethod,
    setPreSelectedMethod,
    togglePreSelectedMethod,
    trySetCalculating,
    setCalculating,
    setResult,
    updateFormData,
    formStoreData,
    session,
    activeSessionKey,
    restorationComplete,
    sessionName,
    hasImportQuality,
    createVersion,
    getLatestVersion,
    preparerAppliedMedian,
    preparerBenchmarkMedian,
    preparerReasonKey,
    preparerNote,
    preparerAcknowledgedExtreme,
  } = useManualWorkspaceStores()
  const {
    calculationRequestIdentifiers,
    linkedIdentifier,
    manualChatReportId,
    persistedReportLookupId,
    pdfStalePollLookupId,
    reportHydrationLookupId,
    resolvedReportId,
  } = useManualReportIdentifiers({
    activeSessionKey,
    reportId,
    resultValuationId: result?.valuation_id,
    session,
  })
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const activeReportId = resolvedReportId || reportId
    const restore = (override?: {
      phase: RecoveryPhase
      provider: string
      clientId: string
      failure?: string
    }) => {
      const summary = readAccountingReconnectIntentSummary(window.sessionStorage)
      if (!summary || summary.reportId !== activeReportId) return
      setAccountingReconnectContext({
        provider: override?.provider ?? summary.provider,
        client_id: override?.clientId ?? summary.clientId,
        firm_id: summary.firmId,
        reason_code: summary.reasonCode,
        last_successful_sync_at: summary.lastSuccessfulSyncAt,
        recovery_phase: override?.phase ?? summary.phase,
        failure: override?.failure ?? summary.failure,
      })
    }
    restore()
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { phase?: RecoveryPhase; provider?: string; clientId?: string; failure?: string }
        | undefined
      if (!detail?.phase || !detail.provider || !detail.clientId) return
      restore({
        phase: detail.phase,
        provider: detail.provider,
        clientId: detail.clientId,
        failure: detail.failure,
      })
    }
    window.addEventListener(ACCOUNTING_RECONNECT_STATUS_EVENT, onStatus)
    return () => window.removeEventListener(ACCOUNTING_RECONNECT_STATUS_EVENT, onStatus)
  }, [reportId, resolvedReportId])
  const currentLocale = useLocale()
  const {
    accountantDisplayName,
    clientContextId,
    clientContextName,
    ctxRelationshipId,
    isAccountantMode,
  } = useManualAccountantContext()
  const requestAccountantCustomerId = accountantCustomerId ?? clientContextId ?? ctxRelationshipId
  const {
    canDownloadPdf,
    currentYearRevenueForMethodNav,
    ebitdaNormalizationLocked,
    isAdvisorAudience,
    planLockedMethodKeys,
    preSelectableMethodsForNav,
    showFullAdvisorMethodNav,
    showPreparerMultiplePanel,
    versionControlLocked,
  } = useManualMethodAccessState({
    allowedMethodKeys,
    firmCountryCode: user?.firm_country_code,
    formStoreData,
    isAccountantFlow,
    isAccountantMode,
    planFeatures,
    planType: normalizedPlanType,
    preSelectedMethod,
    selectedMethod,
    userRole: user?.role,
  })
  const {
    draftStatus,
    durableSaveInFlightRef,
    isDirty,
    isGenerating,
    lastSaved,
    lastSubmittedFinancialSnapshotRef,
    report,
    rightPanelView,
    setDraftStatus,
    setIsDirty,
    setIsGenerating,
    setLastSaved,
    setReport,
    setRightPanelView,
  } = useManualReportUiState({ initialTab: initialTab ?? 'preview' })
  const {
    preSelectedMethods,
    userWeights,
    userWeightJustification,
    setUserWeights,
    setUserWeightJustification,
    selection: synthesisSelection,
    evaluation: synthesisEvaluation,
    valuationResults: synthesisValuationResults,
    navValuationSummary,
  } = useManualSynthesisController({ result, report, selectedMethod })
  useSynthesisReportHeadlineSync({
    result,
    report,
    selectedMethod,
    setReport,
  })
  const { effectiveIsRestoringExistingReport, isStartupAssistantRoute } =
    useManualLayoutPreviewState({
      isGenerating,
      preparerAppliedMedian,
      preparerBenchmarkMedian,
      preSelectedMethod,
      report,
      reportId,
      resolvedReportId,
      restorationComplete,
      result,
      selectedMethod,
      session,
    })
  const tCa = useTranslations('chatAssistant')
  const {
    acknowledgedQualityWarnings,
    acknowledgedStartupIssues,
    lastQualityWarningResetKeyRef,
    lastSynthesisBlendSkippedRunKeyRef,
    setAcknowledgedQualityWarnings,
    setAcknowledgedStartupIssues,
  } = useManualAssistantAcknowledgementState()
  const versionSyncTimeoutRef = useManualVersionSyncTimeoutRef()
  const {
    hasImportedNormalizationData,
    normalizationActions,
    normalizationItems,
    pendingNormalizationCount,
    setSuggestedNormalisations,
  } = useManualNormalizationState({
    hasImportQuality,
  })
  const {
    financialYears,
    getLiveYearlyFinancials,
    getOriginalEbitdaForDisplay,
    latestFormDataRef,
    originalEBITDAByYear,
    restoredYearlyFinancials,
  } = useManualFinancialContext({ formStoreData, report, result })
  const {
    methodPaywallOpen,
    methodPaywallReason,
    openStarterPaywall,
    setMethodPaywallOpen,
    setShowFullscreenModal,
    setShowValuationEditModal,
    showFullscreenModal,
    showValuationEditModal,
  } = useManualModalState()
  const {
    pdfGenerationState,
    generatePdf,
    downloadPdf,
    isPdfGenerating,
    isHydratingEditModalData,
    reportMethodHydrationError,
    retryReportMethodHydration,
    showFiscalReferenceForOmni,
    isRecoveringReportHtml,
    pdfStale,
    pdfWaitTimedOut,
    pdfPollErrorCount,
    pdfPollTransientCount,
    isPdfRetrying,
    handleRetryPdfStalled,
  } = useManualReportReadinessController({
    reportId,
    resolvedReportId,
    reportHydrationLookupId,
    pdfStalePollLookupId,
    firmCountryCode: user?.firm_country_code,
    report,
    result,
    session,
    standaloneHtmlReport,
    restorationComplete,
    isCalculating,
    isGenerating,
    canDownloadPdf,
    setResult,
    setReport,
    openStarterPaywall,
    showRetryFailureToast: (title, options) => toast.error(title, options),
    translateToast: (key) => t(key),
  })
  const {
    collectedData,
    displayCompanyName,
    formActivityCode,
    formCountry,
    formNaceCode,
    setCollectedData,
  } = useManualCollectedDataController({
    clientCompanyName: identity.clientContext?.clientCompanyName,
    isAccountantFlow,
    restorationComplete,
    resultCompanyName: result?.company_name,
    sessionData: session?.sessionData,
    translateNewEstimation: t('newEstimation'),
    updateFormData,
  })
  useManualLayoutResets({
    reportId,
    result,
    isStartupAssistantRoute,
    setIsDirty,
    setAcknowledgedStartupIssues,
    setAcknowledgedQualityWarnings,
    refs: {
      lastQualityWarningResetKeyRef,
      lastSynthesisBlendSkippedRunKeyRef,
      lastSubmittedFinancialSnapshotRef,
    },
  })
  const { handleFormDataChange } = useManualFormDataChangeSync<CollectedData>({
    lastSubmittedFinancialSnapshotRef,
    latestFormDataRef,
    result,
    setIsDirty,
    updateFormData,
  })
  useFormSessionSync({
    reportId: resolvedReportId || reportId || undefined,
    formData: formStoreData,
  })
  usePrefillRestorationCoordinator(resolvedReportId || reportId || undefined)
  usePreSelectedMethodSessionSync({
    reportId,
    resolvedReportId,
    restorationComplete,
    initialSelectedMethodFromUrl,
    initialSelectedMethodsFromUrl,
    firmCountryCode: user?.firm_country_code,
    currentYearRevenue: currentYearRevenueForMethodNav,
    hasValuationResult: !!result,
    allowedMethodsForNav: preSelectableMethodsForNav,
  })
  useManualRestoredFinancialSnapshotBaseline({
    result,
    formStoreData,
    lastSubmittedFinancialSnapshotRef,
    setIsDirty,
  })
  useManualSessionPersistenceLifecycles({ reportId, resolvedReportId })
  const { handleSelectVersion, selectedVersionId, versionHistoryForNav } =
    useManualVersionNavigation({
      currentValuationSummary: navValuationSummary,
      currentVersionLabel: t('currentVersion'),
      onVersionHistoryLocked: () => openStarterPaywall('version_history'),
      planFeatures,
      report,
      reportId,
      resolvedReportId,
      selectedMethod,
      setResult,
      showVersionLoadedToast: (label) => toast.info(t('versionLoaded', { label })),
    })
  const synthesisUnlocked = planFeatures?.valuation_synthesis ?? false
  useResultToReportBridge({
    result,
    sessionHtmlReport: session?.htmlReport,
    standaloneHtmlReport,
    selectedMethod,
    clientBlendedValue: navValuationSummary?.askPrice ?? null,
    reportId,
    canDownloadPdf,
    isMobile,
    draftStatus,
    durableSaveInFlightRef,
    tReport,
    onComplete,
    setReport,
    setDraftStatus,
    setLastSaved,
    setRightPanelView,
    setShowFullscreenModal,
    generatePdf,
    isPdfGenerating,
  })
  const {
    handleSelectMethodWithOverride,
    handlePlanLockedMethodAction,
    togglePreSelectedMethodWithPlanGate,
    handlePreSelectMethod,
    isMethodSwitchRendering,
  } = useManualMethodPersistenceController({
    allowedMethodKeys,
    canDownloadPdf,
    generatePdf,
    isPdfGenerating,
    openStarterPaywall,
    persistedReportLookupId,
    preSelectableMethodsForNav,
    preSelectedMethod,
    preparer: {
      acknowledgedExtreme: preparerAcknowledgedExtreme,
      appliedMedian: preparerAppliedMedian,
      benchmarkMedian: preparerBenchmarkMedian,
      note: preparerNote,
      reasonKey: preparerReasonKey ?? '',
    },
    report,
    restorationComplete,
    result,
    selectedMethod,
    setPreSelectedMethod,
    setReport,
    setResult,
    setSelectedMethod,
    showValuationEditModal,
    togglePreSelectedMethod,
    translate: t,
  })
  const { warnIfSubmitSynthesisSkipped } = useManualSynthesisSkippedWarnings({
    lastSynthesisBlendSkippedRunKeyRef,
    result,
    synthesisEvaluation,
    translate: t,
    translateMethodSelector: tMethodSelector,
  })
  const {
    handleManualSubmit,
    lastSubmittedDataRef,
    pendingPostValuationAgentPrompt,
    postValuationListingHandoffPendingRef,
    setPendingPostValuationAgentPrompt,
  } = useManualSubmitController({
    accountantCustomerId: requestAccountantCustomerId,
    calculationRequestIdentifiers,
    createVersion,
    currentLocale,
    getLatestVersion,
    isAccountantMode,
    lastSubmittedFinancialSnapshotRef,
    linkedIdentifier,
    preSelectedMethod,
    reportId,
    resolvedReportId,
    result,
    selectedMethod,
    sessionName,
    durableSaveInFlightRef,
    setCalculating,
    setCollectedData,
    setDraftStatus,
    setIsDirty,
    setIsGenerating,
    setLastSaved,
    setResult,
    synthesisSelection,
    translate: t,
    translateErrors: tErrors,
    translateHistory: tHistory,
    translatePreparer: tPreparer,
    translateReport: tReport,
    trySetCalculating,
    updateFormData,
    userId: user?.id,
    versionSyncTimeoutRef,
    warnIfSubmitSynthesisSkipped,
    onAccountingReconnectRequired: setAccountingReconnectContext,
    onAccountingReconnectRecovered: handleAccountingReconnectRecovered,
    isAccountingReconnectRequired: accountingReconnectContext !== null,
    restorationComplete,
  })
  const hasAnyNormalization = normalizationItems.some((n) => n.status === 'accepted')
  const {
    currentVersionNumber,
    handleCancelRecalculate,
    handleConfirmRecalculate,
    popupFlags: recalculatePopupFlags,
    showRecalculateConfirmation,
    wrappedOnSubmit,
  } = useManualRecalculateConfirmation({
    accountantCustomerId: requestAccountantCustomerId,
    currentLocale,
    getLatestVersion,
    handleManualSubmit,
    hasAnyNormalization,
    isDirty,
    preSelectedMethod,
    report,
    reportId,
    resolvedReportId,
    selectedMethod,
    synthesisSelection,
    translateHistory: tHistory,
    updateFormData,
  })
  const {
    chatDrawerOpen,
    chatMessages,
    fieldContext,
    handleAcceptUpdate,
    handleApplyFieldUpdate,
    handleChatMessage,
    handleFieldHelpRequest,
    handleNewConversation,
    handleRejectUpdate,
    handleRetry,
    isChatGenerating,
    isLoadingHistory,
    pendingUpdates,
    setChatDrawerOpen,
    setChatMessages,
    startupToolInProgress,
  } = useManualChatController({
    collectedData,
    currentLocale,
    initialAgentNext,
    initialDrawerOpen,
    isAccountantMode,
    latestFormDataRef,
    manualChatReportId,
    normalizationActions,
    normalizationItems,
    pendingPostValuationAgentPrompt,
    report,
    reportId,
    resolvedReportId,
    setCollectedData,
    setPendingPostValuationAgentPrompt,
    setSuggestedNormalisations,
    translate: t,
    updateFormData,
  })
  useManualKeyboardShortcuts({
    chatDrawerOpen,
    setChatDrawerOpen,
    setShowFullscreenModal,
    showFullscreenModal,
  })
  const {
    deletingValuationId,
    downloadHistory,
    handleAccountSettings,
    mercuryLocale,
    handleBack,
    handleCancelNewValuation,
    handleConfirmNewValuation,
    handleContinueImportReview,
    handleContinueToListing,
    handleDeleteValuation,
    handleExitClientView,
    handleExport,
    handleFullscreen,
    handleLogout,
    handleNewValuation,
    handleOpenAssistant,
    handleOpenMercuryClientForInvite,
    handleNavigateToDashboard,
    handleNavigateToBilling,
    handleNavigateToHelp,
    handlePreview,
    handleSelectValuation,
    handleShowGraph,
    handleShowHistory,
    handleSwitchWorkspace,
    isConfirmingNewValuation,
    isExporting,
    recentValuations,
    showNewValuationModal,
  } = useManualNavigationController({
    activeSessionKey,
    canDownloadPdf,
    clientCompanyName: identity.clientContext?.clientCompanyName,
    clientContextId,
    contextRelationshipId: ctxRelationshipId,
    collectedCompanyName: collectedData.companyName,
    currentLocale,
    downloadPdf,
    isAccountantFlow,
    isAccountantMode,
    openStarterPaywall,
    pdfStale,
    isPdfGenerating,
    report,
    reportId,
    resolvedReportId,
    session,
    setChatDrawerOpen,
    setReport,
    setRightPanelView,
    setShowFullscreenModal,
    isMobile,
    translate: t,
    translateReport: tReport,
  })
  const {
    approvalDialog,
    approveLabel,
    canApprove,
    canSignAttest,
    handleApprove,
    handleSignAttest,
    isApproving,
    isAttesting,
  } = useManualReportCommands({
    canDownloadPdf,
    handleExport,
    handlePreview,
    isAccountantMode,
    isExporting,
    isPdfGenerating,
    pdfStale,
    report,
    reportId,
    resolvedReportId,
    showFullAdvisorMethodNav,
    translate: t,
    urlAction,
  })
  const {
    showUnifiedNormalizationModal,
    guidedNormalizationPrefill,
    openUnifiedNormalizationModal,
    handleUnifiedNormalizationModalOpenChange,
    handleShowNormalisationReview,
    handleNormalizationsChange,
    handleAcceptNormalisation,
    handleRejectNormalisation,
    handleVersionRestore,
    handleCSVImportComplete,
  } = useManualNormalizationController({
    accountantCustomerId: requestAccountantCustomerId,
    calculationRequestIdentifiers,
    collectedData,
    currentLocale,
    financialYears,
    formStoreData,
    guidedResolutionUrl,
    latestFormDataRef,
    normalizationActions,
    openStarterPaywall,
    originalEBITDAByYear,
    planFeatures,
    preSelectedMethod,
    report,
    reportId,
    resolvedReportId,
    resultMultiplesValuation: result?.multiples_valuation,
    selectedMethod,
    sessionName,
    durableSaveInFlightRef,
    setChatDrawerOpen,
    setChatMessages,
    setDraftStatus,
    setLastSaved,
    setResult,
    setRightPanelView,
    setSuggestedNormalisations,
    synthesisSelection,
    translate: t,
    translatePreparer: tPreparer,
    updateFormData,
  })
  const { assistantOpenTasksCount, chatDrawerProps, manualInputProps } =
    useManualAssistantController({
      acknowledgedQualityWarnings,
      acknowledgedStartupIssues,
      activeSessionKey,
      autoAdvancePastPrefilledSteps,
      chatDrawerOpen,
      chatMessages,
      clientContextId,
      collectedData,
      contextRelationshipId: ctxRelationshipId,
      currentLocale,
      fieldContext,
      formActivityCode,
      formNaceCode,
      formStoreData,
      getLiveYearlyFinancials,
      handleAcceptNormalisation,
      handleAcceptUpdate,
      handleApplyFieldUpdate,
      handleCSVImportComplete,
      handleChatMessage,
      handleFieldHelpRequest,
      handlePdfExport: handleExport,
      handleFormDataChange,
      handleManualSubmit,
      handleNewConversation,
      handleRejectNormalisation,
      handleRejectUpdate,
      handleRetry,
      handleShowNormalisationReview,
      hasReport: !!report,
      hasAdvisorProValuationAccess: showFullAdvisorMethodNav,
      isAdvisorAudience,
      isAccountantMode,
      isCalculating,
      isChatGenerating,
      isGenerating,
      integrationsEnabled: planFeatures?.integrations_enabled === true,
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
      translateQualityWarningCta: (key, fallback) =>
        tCa(key as never, { default: fallback } as never),
      userWeightJustification,
      userWeights,
      wrappedOnSubmit,
    })
  const lastFullYear = getCurrentFilingYear()
  return (
    <>
      <ManualLayoutChrome
        chatDrawerOpen={chatDrawerOpen}
        isMobile={isMobile}
        navProps={{
          accountantDisplayName,
          activeReportId: resolvedReportId || reportId,
          assistantOpenTasksCount,
          canDownloadPdf,
          chatDrawerOpen,
          companyName: displayCompanyName,
          deletingValuationId,
          downloadHistory,
          effectiveIsRestoringExistingReport,
          ebitdaNormalizationLocked,
          handleAccountSettings,
          handleBack,
          handleContinueToListing,
          handleDeleteValuation,
          handleExport,
          handleFullscreen,
          handleLogout,
          handleNewValuation,
          handleOpenAssistant,
          handlePlanLockedMethodAction,
          handlePreSelectMethod,
          handlePreview,
          handleSelectValuation,
          handleSelectVersion,
          handleShowGraph,
          handleShowHistory,
          handleSwitchWorkspace,
          hasReport: !!report,
          isAccountantMode,
          isCalculating,
          isAttesting,
          isExporting,
          isGenerating,
          isMobile,
          navValuationSummary,
          onSignAttest: canSignAttest ? handleSignAttest : undefined,
          showSignAttest: canSignAttest,
          onApproveValuation: canApprove ? handleApprove : undefined,
          showApproveValuation: canApprove,
          isApprovingValuation: isApproving,
          approveValuationLabel: approveLabel,
          signAttestLabel: t('signAttestReport'),
          onExitClientView: handleExitClientView,
          onNavigateToBilling: handleNavigateToBilling,
          onNavigateToDashboard: handleNavigateToDashboard,
          onNavigateToHelp: handleNavigateToHelp,
          onOpenNormalization: openUnifiedNormalizationModal,
          onOpenValuationEdit: () => setShowValuationEditModal(true),
          openStarterPaywall,
          pendingNormalizationCount,
          planLockedMethodKeys,
          preSelectableMethodsForNav,
          preSelectedMethod,
          preSelectedMethods,
          recentValuations,
          rightPanelView,
          selectedVersionId,
          showFullAdvisorMethodNav,
          togglePreSelectedMethodWithPlanGate,
          translate: t,
          user,
          versionControlLocked,
          versionHistoryForNav,
        }}
        pdfStaleBannerProps={{
          canDownloadPdf,
          isPdfRetrying,
          onRetry: handleRetryPdfStalled,
          persistedReportLookupId: pdfStalePollLookupId,
          availablePdfUrl: pdfGenerationState.url,
          pdfPollErrorCount,
          pdfPollTransientCount,
          pdfStale,
          pdfWaitTimedOut,
          report,
          translate: t,
        }}
        contextBarProps={{
          businessName: collectedData.companyName,
          clientContextId,
          clientContextName,
          draftStatus,
          isAccountantMode,
          lastSaved,
          onOpenMercuryClientForInvite: handleOpenMercuryClientForInvite,
          onShowNormalisationReview: handleShowNormalisationReview,
          pendingNormalizationCount,
          translate: t,
        }}
        bodyProps={{
          inputLabel: tReport('workspace.input'),
          isMobile,
          manualInputProps,
          outputLabel: tReport('workspace.output'),
          reportId,
          workspaceProps: {
            isCalculating,
            isGenerating,
            isRecoveringReportHtml,
            isDeletingCurrentReport: !!deletingValuationId,
            isMethodSwitchRendering,
            onVersionRestore: handleVersionRestore,
            report,
            reportId,
            rightPanelView,
            translate: t,
            translateReport: tReport,
          },
        }}
        modalsProps={{
          approvalDialog,
          allowedMethodKeys,
          canDownloadPdf,
          clientContextId,
          collectedData,
          currentLocale,
          currentVersionNumber,
          ctxRelationshipId,
          effectiveIsRestoringExistingReport,
          financialYears,
          formCountry,
          guidedNormalizationPrefill,
          handleCancelNewValuation,
          handleCancelRecalculate,
          handleConfirmNewValuation,
          handleConfirmRecalculate,
          handleContinueImportReview,
          handleExport,
          handleNormalizationsChange,
          handleOpenMercuryClientForInvite,
          handleSelectMethodWithOverride,
          handleUnifiedNormalizationModalOpenChange,
          hasImportedNormalizationData,
          isAccountantMode,
          isAdvisorAudience,
          isCalculating,
          isConfirmingNewValuation,
          isExporting,
          isGenerating,
          isHydratingEditModalData,
          isMethodSwitchRendering,
          lastFullYear,
          latestFormDataRef: latestFormDataRef as React.MutableRefObject<Record<
            string,
            unknown
          > | null>,
          methodPaywallOpen,
          methodPaywallReason,
          normalizationItems,
          openStarterPaywall,
          originalEBITDA: getOriginalEbitdaForDisplay(),
          originalEBITDAByYear,
          recalculatePopupFlags,
          report,
          reportId,
          reportMethodHydrationError,
          rightPanelView,
          resolvedReportId,
          result,
          retryReportMethodHydration,
          selectedMethod,
          setMethodPaywallOpen,
          setShowFullscreenModal,
          setShowValuationEditModal,
          showFiscalReferenceForOmni,
          showFullscreenModal,
          showFullAdvisorMethodNav,
          showNewValuationModal,
          showPreparerMultiplePanel,
          showRecalculateConfirmation,
          showUnifiedNormalizationModal,
          showValuationEditModal,
          translate: t,
          userFirmCountryCode: user?.firm_country_code,
        }}
        chatDrawerProps={chatDrawerProps}
      />
      {accountingReconnectContext ? (
        <AccountingReconnectRecovery context={accountingReconnectContext} />
      ) : null}
    </>
  )
}
