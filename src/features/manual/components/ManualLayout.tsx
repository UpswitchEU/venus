'use client'

/**
 * Manual valuation shell: composes session, report, chat, normalization,
 * navigation, and modal controllers around the calculator presentation.
 */

import { useLocale, useTranslations } from 'next-intl'
import React, { Suspense, useMemo } from 'react'
import { toast } from 'sonner'
// Calculator Components (full Clarity parity)
import { ChatAssistantDrawer } from '../../../components/calculator'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapPrefill } from '../../../hooks/useBootstrapPrefill'
import { useBootstrapSync } from '../../../hooks/useBootstrapSync'
import { useCredits } from '../../../hooks/useCredits'
import { useFormSessionSync } from '../../../hooks/useFormSessionSync'
import { usePdfGeneration } from '../../../hooks/usePdfGeneration'
import { usePrefillRestorationCoordinator } from '../../../hooks/usePrefillRestorationCoordinator'
import { usePreSelectedMethodSessionSync } from '../../../hooks/usePreSelectedMethodSessionSync'
import { useSessionDataPrefill } from '../../../hooks/useSessionDataPrefill'
import { useSessionOptionalMethodPrefill } from '../../../hooks/useSessionOptionalMethodPrefill'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import {
  isVenturePathMethodKey,
  methodKeyAcceptsPreparerMultipleOverride,
} from '../../../lib/methods'
import { backendAPI } from '../../../services/backendApi'
import { useSessionStore } from '../../../store/useSessionStore'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
// Venus infrastructure (auth, session, stores, services)
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
  useManualReportMethodHydration,
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
  usePdfStalenessLifecycle,
  useRestorationGate,
  useResultToReportBridge,
} from '../hooks'
import { buildManualLiveMultiplePreview } from '../utils/manualLiveMultiplePreview'
import { hasManualRestorableReport } from '../utils/manualRestorableReport'
import { manualSessionMatchesReport } from '../utils/manualSessionIdentifiers'
import { ManualLayoutBody } from './ManualLayoutBody'
import { ManualLayoutContextBar } from './ManualLayoutContextBar'
import { ManualLayoutModals } from './ManualLayoutModals'
import { ManualLayoutNav } from './ManualLayoutNav'
import { CalculatorShellSkeleton, ManualLayoutSessionError } from './ManualLayoutStatus'
import { ManualPdfStaleBanner } from './ManualPdfStaleBanner'
import type { CollectedData } from './manualLayoutDataTypes'
import { useManualLayoutIsMobile } from './manualLayoutShell'
import type { ManualLayoutProps } from './manualLayoutTypes'

export const ManualLayout: React.FC<ManualLayoutProps> = (props) => {
  const tErrors = useTranslations('errors')
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const sessionError = useSessionStore((s) => s.errorMessage)
  const sessionMatchesReport = manualSessionMatchesReport(session, props.reportId)
  const isLoading = status === 'loading'
  const isInitializing = status === 'idle' || status === 'loading'

  if (isLoading || isInitializing || !session || !sessionMatchesReport) {
    return <CalculatorShellSkeleton />
  }

  if (sessionError) {
    return (
      <ManualLayoutSessionError
        message={sessionError}
        reloadLabel={tErrors('session.reloadPage')}
        title={tErrors('session.title')}
      />
    )
  }

  return <ManualLayoutLoaded {...props} />
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
}) => {
  const t = useTranslations('toast')
  const tReport = useTranslations('report')
  const tHistory = useTranslations('historyPanel')
  const tErrors = useTranslations('errors')
  const tPreparer = useTranslations('preparerMultiple')
  const tMethodSelector = useTranslations('manualInput.methodSelector')
  const isMobile = useManualLayoutIsMobile()

  useManualPanelStorageReset()
  useManualToastMessageLifecycle(t)
  // PDF-staleness lifecycle (4 refs + 3 useState + 3 effects + retry callback)
  // is owned by `usePdfStalenessLifecycle`, instantiated below once
  // `report` / `usePdfGeneration` outputs are available.

  // Venus infrastructure
  const { user } = useAuth()
  const { allowedMethodKeys, planFeatures } = useCredits()
  const { identity, isAccountantFlow } = useBootstrap()
  useBootstrapSync()
  const { readOnlyKbo, autoAdvancePastPrefilledSteps } = useBootstrapPrefill()
  /** Session blob may gain DCF/NAV/SaaS after bootstrap — gap-fill empty store slots. */
  useSessionOptionalMethodPrefill()
  /** NACE resolution + identity paths when bootstrap is late or sparse — optional merge coalesced via {@link queueOptionalGapFillFlush}. */
  useSessionDataPrefill()

  const {
    isCalculating,
    result,
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
    reportHydrationLookupId,
    resolvedReportId,
  } = useManualReportIdentifiers({
    activeSessionKey,
    reportId,
    resultValuationId: result?.valuation_id,
    session,
  })

  const {
    state: pdfGenerationState,
    generatePdf,
    downloadPdf,
    isReady: isPdfReady,
  } = usePdfGeneration(resolvedReportId ?? reportId)

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
  } = useManualSynthesisController({ result, report })
  // `isMethodSwitchRendering` is now derived from the persistence coordinator
  // declared below — see `persistCoordinator.isPersisting`.
  const liveMultipleReportPreview = useMemo(() => {
    return buildManualLiveMultiplePreview({
      result,
      report,
      methodAcceptsOverride: methodKeyAcceptsPreparerMultipleOverride(selectedMethod),
      appliedMedian: preparerAppliedMedian,
      benchmarkMedian: preparerBenchmarkMedian,
    })
  }, [
    preparerAppliedMedian,
    preparerBenchmarkMedian,
    report?.htmlReport,
    report?.valuation,
    result,
    selectedMethod,
    report,
  ])
  // `pdfStale` and the PDF-lifecycle FSM are now owned by
  // `usePdfStalenessLifecycle` — instantiated below after `openStarterPaywall`
  // is declared (it's one of the hook's params).
  // Detect if session has existing data but report hasn't been built yet (prevents placeholder flash)
  const isRestoringExistingReport =
    !report && !isGenerating && !!session && hasManualRestorableReport(session)
  // Unblock UI as soon as SessionRestorationService signals completion.
  // `useRestorationGate` owns the 5s safety-timeout fallback used when the
  // service never emits the completion signal (defense-in-depth).
  const { effectiveIsRestoringExistingReport } = useRestorationGate({
    isRestoringExistingReport,
    restorationComplete,
  })
  const {
    isHydratingEditModalData,
    reportMethodHydrationError,
    retryReportMethodHydration,
    showFiscalReferenceForOmni,
  } = useManualReportMethodHydration({
    firmCountryCode: user?.firm_country_code,
    reportHydrationLookupId,
    restorationComplete,
    setResult,
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
    reportId,
    resolvedReportId,
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

  // PDF-staleness FSM — owns 4 refs + 3 useState + 3 effects + retry callback
  // that previously lived inline across ~250 lines. See `usePdfStalenessLifecycle`.
  const {
    pdfStale,
    pdfWaitTimedOut,
    pdfPollErrorCount,
    isPdfRetrying,
    retry: handleRetryPdfStalled,
  } = usePdfStalenessLifecycle({
    report,
    isPdfReady,
    pdfGenerationState,
    persistedReportLookupId,
    canDownloadPdf,
    generatePdf,
    getReport: backendAPI.getReport.bind(backendAPI),
    setResult,
    setReport,
    openStarterPaywall,
    showRetryFailureToast: (title, options) => toast.error(title, options),
    translate: (key) => t(key),
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

  // Effective "is this the venture (startup) route?" — hoisted from its
  // original site (down with the startup-assistant integration) so the
  // consolidated reset hook can read it. `useManualLayoutResets` clears the
  // startup-issues ack Set when leaving the route.
  const effectiveAssistantMethod = preSelectedMethod ?? selectedMethod
  const isStartupAssistantRoute = isVenturePathMethodKey(effectiveAssistantMethod)

  // Identity-change resets — one named hook replaces 6 inline effects that
  // previously lived scattered across this file. See `useManualLayoutResets`
  // for the per-trigger semantics; refs stay owned here so the other effects
  // that read them (PDF stale poll, synthesis warn dedup, baseline-snapshot
  // detection) can keep working unchanged.
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

  // Debounced form → session autosave (demo resilience, automation-ready)
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
    firmCountryCode: user?.firm_country_code,
    currentYearRevenue: currentYearRevenueForMethodNav,
    hasValuationResult: !!result,
    /**
     * Owner/founder URLs (`?selected_method=dcf` from a stale Mercury link or
     * hand-edited address bar) used to bypass the nav restriction and leave
     * the calculator with an "active but invisible" method — DCF would be the
     * preselected method while the nav only rendered the 3 owner-founder
     * methods. Pass the same intersected list the nav renders so the URL
     * seed can never escape the nav contract for owners.
     */
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

  // Cap-table simulator React mount removed: the canonical Jinja report
  // (`startup_one_pager.html` + `startup_cap_table.html`) is now the
  // single source of truth for the simulator card. Founders see one
  // surface for the post-money/dilution rollup instead of three (React
  // slider + one-pager + cap-table page). The selector + helper file
  // (`selectCapTableSimulatorResult`) and the Python emitter remain in
  // case we want to bring back the interactive slider later, gated by
  // a feature flag, but they are not wired into the right rail.

  const synthesisUnlocked = planFeatures?.valuation_synthesis ?? false

  // ─── Bridge: Result from Venus API → Report for Clarity components ───
  // Owned by `useResultToReportBridge`. The 110-line effect that previously
  // lived here is now a pure mapper (`mapValuationResultToReport`) plus a
  // thin effect wrapper that fires the 7 documented side effects. Behaviour
  // is preserved verbatim — including the panel-view override on every
  // result-arrival and the auto-PDF-gen trigger.
  useResultToReportBridge({
    result,
    selectedMethod,
    reportId,
    canDownloadPdf,
    isMobile,
    tReport,
    onComplete,
    setReport,
    setDraftStatus,
    setLastSaved,
    setRightPanelView,
    setShowFullscreenModal,
    generatePdf,
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
    report,
    reportId,
    resolvedReportId,
    session,
    setChatDrawerOpen,
    setRightPanelView,
    setShowFullscreenModal,
    translate: t,
    translateReport: tReport,
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
      generatePdf,
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
      handleRejectNormalisation,
      handleRejectUpdate,
      handleRetry,
      handleShowNormalisationReview,
      hasReport: !!report,
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
      translateQualityWarningCta: (key, fallback) =>
        tCa(key as never, { default: fallback } as never),
      userWeightJustification,
      userWeights,
      wrappedOnSubmit,
    })

  // Stable last full year for originalEBITDA fallback (avoids date-boundary inconsistencies)
  const lastFullYear = getCurrentFilingYear()

  // ═══════════════════════════════════════
  // UNIFIED LAYOUT (mobile + desktop)
  // ═══════════════════════════════════════
  // Single return for both viewports. The fork used to be two separate
  // `if (isMobile)` branches that shared CalculatorNav + ContextBar + 5
  // modals byte-for-byte but were drifting (mobile silently dropped
  // ValuationEditModal + the plan-paywall modal, so mobile users hitting a
  // feature gate clicked through to nothing). After PR2.5 the only diffs
  // are: outer wrapper className and body layout. CalculatorNav prop
  // divergence (desktop-only download-history / version-list /
  // continue-to-listing affordances) is `isMobile`-gated inside
  // `calculatorNavEl` above.
  return (
    <div
      className={
        isMobile
          ? 'aurora-theme flex flex-col h-[100dvh] bg-background'
          : 'aurora-theme flex flex-col h-screen bg-background overflow-hidden'
      }
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
        isExporting={isExporting}
        isGenerating={isGenerating}
        isMethodSwitchRendering={isMethodSwitchRendering}
        isMobile={isMobile}
        navValuationSummary={navValuationSummary}
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
        persistedReportLookupId={persistedReportLookupId}
        pdfPollErrorCount={pdfPollErrorCount}
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

      <Suspense fallback={null}>
        <ChatAssistantDrawer {...chatDrawerProps} />
      </Suspense>

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
  )
}
