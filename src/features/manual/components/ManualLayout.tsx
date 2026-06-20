'use client'
import { useLocale, useTranslations } from 'next-intl'
import React, { Suspense } from 'react'
import { toast } from 'sonner'
import { ChatAssistantDrawer } from '../../../components/calculator'
import { venusAiDockShellClassName } from '../../../components/calculator/venus-ai-dock-layout'
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
  useManualReportApproval,
  useManualReportAttestation,
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
import { ManualLayoutBody } from './ManualLayoutBody'
import { ManualLayoutContextBar } from './ManualLayoutContextBar'
import { ManualLayoutModals } from './ManualLayoutModals'
import { ManualLayoutNav } from './ManualLayoutNav'
import { ManualLayoutSessionGate } from './ManualLayoutSessionGate'
import { ManualPdfStaleBanner } from './ManualPdfStaleBanner'
import type { CollectedData } from './manualLayoutDataTypes'
import { shouldShowManualAssistantFab } from './manualLayoutDerivedState'
import { useManualLayoutViewport } from './manualLayoutShell'
import type { ManualLayoutProps } from './manualLayoutTypes'
import { useManualLayoutPreviewState } from './useManualLayoutPreviewState'
import { useManualUrlActions } from './useManualUrlActions'
export const ManualLayout: React.FC<ManualLayoutProps> = (props) => {
  return (
    <ManualLayoutSessionGate reportId={props.reportId}>
      <ManualLayoutLoaded {...props} />
    </ManualLayoutSessionGate>
  )
}
const ManualLayoutLoaded: React.FC<ManualLayoutProps> = ({
  reportId,
  onComplete,
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
  const { isMobile } = useManualLayoutViewport()
  useManualPanelStorageReset()
  useManualToastMessageLifecycle(t)
  const { user } = useAuth()
  const { allowedMethodKeys, planFeatures } = useCredits()
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
  const currentLocale = useLocale()
  const {
    accountantDisplayName,
    clientContextId,
    clientContextName,
    ctxRelationshipId,
    isAccountantMode,
  } = useManualAccountantContext()
  const {
    canDownloadPdf,
    currentYearRevenueForMethodNav,
    ebitdaNormalizationLocked,
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
  const { effectiveIsRestoringExistingReport, isStartupAssistantRoute, liveMultipleReportPreview } =
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
  const attestReportId = resolvedReportId ?? reportId ?? null
  const { canSignAttest, handleSignAttest, isAttesting } = useManualReportAttestation({
    reportId: attestReportId,
    enabled: showFullAdvisorMethodNav && isAccountantMode && !!report && !!attestReportId,
    startedTitle: t('attestStarted'),
    successTitle: t('attestSuccess'),
    successDescription: t('attestSuccessDesc'),
    failedTitle: t('attestFailed'),
    notFinalizedDescription: t('attestReportNotFinalized'),
  })
  const { approveLabel, canApprove, handleApprove, isApproving } = useManualReportApproval({
    reportId: attestReportId,
    enabled: showFullAdvisorMethodNav && isAccountantMode && !!report && !!attestReportId,
    approveLabel: t('approveValuation'),
    approvedTitle: t('valuationApproved'),
    failedTitle: t('approveValuationFailed'),
    transientFailedDescription: t('approveValuationTransientFailed'),
  })
  useManualUrlActions({
    attestReportId,
    canDownloadPdf,
    handleExport,
    handlePreview,
    isExporting,
    isPdfGenerating,
    pdfStale,
    report,
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
  const showAssistantFab = shouldShowManualAssistantFab({
    isStartupAssistantRoute,
    chatDrawerOpen,
    methodPaywallOpen,
    showFullscreenModal,
    showNewValuationModal,
    showRecalculateConfirmation,
    showUnifiedNormalizationModal,
    showValuationEditModal,
  })
  return (
    <>
      <div
        className={venusAiDockShellClassName(
          chatDrawerOpen,
          isMobile,
          'aurora-theme flex flex-col h-[100dvh] bg-background overflow-hidden'
        )}
      >
        <ManualLayoutNav
          accountantDisplayName={accountantDisplayName}
          activeReportId={resolvedReportId || reportId}
          assistantOpenTasksCount={assistantOpenTasksCount}
          canDownloadPdf={canDownloadPdf}
          chatDrawerOpen={chatDrawerOpen}
          companyName={displayCompanyName}
          deletingValuationId={deletingValuationId}
          downloadHistory={downloadHistory}
          effectiveIsRestoringExistingReport={effectiveIsRestoringExistingReport}
          ebitdaNormalizationLocked={ebitdaNormalizationLocked}
          handleAccountSettings={handleAccountSettings}
          handleBack={handleBack}
          handleContinueToListing={handleContinueToListing}
          handleDeleteValuation={handleDeleteValuation}
          handleExport={handleExport}
          handleFullscreen={handleFullscreen}
          handleLogout={handleLogout}
          handleNewValuation={handleNewValuation}
          handleOpenAssistant={handleOpenAssistant}
          handlePlanLockedMethodAction={handlePlanLockedMethodAction}
          handlePreSelectMethod={handlePreSelectMethod}
          handlePreview={handlePreview}
          handleSelectValuation={handleSelectValuation}
          handleSelectVersion={handleSelectVersion}
          handleShowHistory={handleShowHistory}
          handleSwitchWorkspace={handleSwitchWorkspace}
          hasReport={!!report}
          isAccountantMode={isAccountantMode}
          isCalculating={isCalculating}
          isAttesting={isAttesting}
          isExporting={isExporting}
          isGenerating={isGenerating}
          isMobile={isMobile}
          navValuationSummary={navValuationSummary}
          onSignAttest={canSignAttest ? handleSignAttest : undefined}
          showSignAttest={canSignAttest}
          onApproveValuation={canApprove ? handleApprove : undefined}
          showApproveValuation={canApprove}
          isApprovingValuation={isApproving}
          approveValuationLabel={approveLabel}
          signAttestLabel={t('signAttestReport')}
          onExitClientView={handleExitClientView}
          onNavigateToBilling={handleNavigateToBilling}
          onNavigateToDashboard={handleNavigateToDashboard}
          onNavigateToHelp={handleNavigateToHelp}
          onOpenNormalization={openUnifiedNormalizationModal}
          onOpenValuationEdit={() => setShowValuationEditModal(true)}
          openStarterPaywall={openStarterPaywall}
          pendingNormalizationCount={pendingNormalizationCount}
          planLockedMethodKeys={planLockedMethodKeys}
          preSelectableMethodsForNav={preSelectableMethodsForNav}
          preSelectedMethod={preSelectedMethod}
          preSelectedMethods={preSelectedMethods}
          recentValuations={recentValuations}
          rightPanelView={rightPanelView}
          selectedVersionId={selectedVersionId}
          showFullAdvisorMethodNav={showFullAdvisorMethodNav}
          togglePreSelectedMethodWithPlanGate={togglePreSelectedMethodWithPlanGate}
          translate={t}
          user={user}
          versionControlLocked={versionControlLocked}
          versionHistoryForNav={versionHistoryForNav}
        />
        <ManualPdfStaleBanner
          canDownloadPdf={canDownloadPdf}
          isPdfRetrying={isPdfRetrying}
          onRetry={handleRetryPdfStalled}
          persistedReportLookupId={pdfStalePollLookupId}
          availablePdfUrl={pdfGenerationState.url}
          pdfPollErrorCount={pdfPollErrorCount}
          pdfPollTransientCount={pdfPollTransientCount}
          pdfStale={pdfStale}
          pdfWaitTimedOut={pdfWaitTimedOut}
          report={report}
          translate={t}
        />
        <ManualLayoutContextBar
          businessName={collectedData.companyName}
          clientContextId={clientContextId}
          clientContextName={clientContextName}
          draftStatus={draftStatus}
          isAccountantMode={isAccountantMode}
          lastSaved={lastSaved}
          onOpenMercuryClientForInvite={handleOpenMercuryClientForInvite}
          onShowNormalisationReview={handleShowNormalisationReview}
          pendingNormalizationCount={pendingNormalizationCount}
          translate={t}
        />
        <ManualLayoutBody
          isMobile={isMobile}
          manualInputProps={manualInputProps}
          reportId={reportId}
          workspaceProps={{
            isCalculating,
            isGenerating,
            isRecoveringReportHtml,
            isDeletingCurrentReport: !!deletingValuationId,
            isMethodSwitchRendering,
            liveMultipleReportPreview,
            onVersionRestore: handleVersionRestore,
            report,
            reportId,
            rightPanelView,
            translate: t,
            translateReport: tReport,
          }}
        />
        <ManualLayoutModals
          allowedMethodKeys={allowedMethodKeys}
          canDownloadPdf={canDownloadPdf}
          clientContextId={clientContextId}
          collectedData={collectedData}
          currentLocale={currentLocale}
          currentVersionNumber={currentVersionNumber}
          ctxRelationshipId={ctxRelationshipId}
          effectiveIsRestoringExistingReport={effectiveIsRestoringExistingReport}
          financialYears={financialYears}
          formCountry={formCountry}
          guidedNormalizationPrefill={guidedNormalizationPrefill}
          handleCancelNewValuation={handleCancelNewValuation}
          handleCancelRecalculate={handleCancelRecalculate}
          handleConfirmNewValuation={handleConfirmNewValuation}
          handleConfirmRecalculate={handleConfirmRecalculate}
          handleContinueImportReview={handleContinueImportReview}
          handleExport={handleExport}
          handleNormalizationsChange={handleNormalizationsChange}
          handleOpenMercuryClientForInvite={handleOpenMercuryClientForInvite}
          handleSelectMethodWithOverride={handleSelectMethodWithOverride}
          handleUnifiedNormalizationModalOpenChange={handleUnifiedNormalizationModalOpenChange}
          hasImportedNormalizationData={hasImportedNormalizationData}
          isAccountantMode={isAccountantMode}
          isCalculating={isCalculating}
          isConfirmingNewValuation={isConfirmingNewValuation}
          isExporting={isExporting}
          isGenerating={isGenerating}
          isHydratingEditModalData={isHydratingEditModalData}
          isMethodSwitchRendering={isMethodSwitchRendering}
          lastFullYear={lastFullYear}
          latestFormDataRef={
            latestFormDataRef as React.MutableRefObject<Record<string, unknown> | null>
          }
          methodPaywallOpen={methodPaywallOpen}
          methodPaywallReason={methodPaywallReason}
          normalizationItems={normalizationItems}
          openStarterPaywall={openStarterPaywall}
          originalEBITDA={getOriginalEbitdaForDisplay()}
          originalEBITDAByYear={originalEBITDAByYear}
          recalculatePopupFlags={recalculatePopupFlags}
          report={report}
          reportId={reportId}
          reportMethodHydrationError={reportMethodHydrationError}
          resolvedReportId={resolvedReportId}
          result={result}
          retryReportMethodHydration={retryReportMethodHydration}
          selectedMethod={selectedMethod}
          setMethodPaywallOpen={setMethodPaywallOpen}
          setShowFullscreenModal={setShowFullscreenModal}
          setShowValuationEditModal={setShowValuationEditModal}
          showFiscalReferenceForOmni={showFiscalReferenceForOmni}
          showFullscreenModal={showFullscreenModal}
          showFullAdvisorMethodNav={showFullAdvisorMethodNav}
          showNewValuationModal={showNewValuationModal}
          showPreparerMultiplePanel={showPreparerMultiplePanel}
          showRecalculateConfirmation={showRecalculateConfirmation}
          showUnifiedNormalizationModal={showUnifiedNormalizationModal}
          showValuationEditModal={showValuationEditModal}
          translate={t}
          userFirmCountryCode={user?.firm_country_code}
        />
      </div>
      <Suspense fallback={null}>
        <ChatAssistantDrawer
          {...chatDrawerProps}
          lockScroll={isMobile}
          showFabWhenClosed={showAssistantFab}
        />
      </Suspense>
    </>
  )
}
