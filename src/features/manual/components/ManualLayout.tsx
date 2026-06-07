'use client'

/**
 * Manual valuation shell: composes session, report, chat, normalization,
 * navigation, and modal controllers around the calculator presentation.
 */

import { useLocale, useTranslations } from 'next-intl'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
// Calculator Components (full Clarity parity)
import { ChatAssistantDrawer } from '../../../components/calculator'
import { ReviewAndDiscussStep } from '../../../components/calculator/ReviewAndDiscussStep'
import {
  shouldShowVenusAiDockFab,
  venusAiDockShellClassName,
} from '../../../components/calculator/venus-ai-dock-layout'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapPrefill } from '../../../hooks/useBootstrapPrefill'
import { useCredits } from '../../../hooks/useCredits'
import { useFormSessionSync } from '../../../hooks/useFormSessionSync'
import { usePdfGeneration } from '../../../hooks/usePdfGeneration'
import { usePrefillRestorationCoordinator } from '../../../hooks/usePrefillRestorationCoordinator'
import { usePreSelectedMethodSessionSync } from '../../../hooks/usePreSelectedMethodSessionSync'
import { useSessionDataPrefill } from '../../../hooks/useSessionDataPrefill'
import { useSessionOptionalMethodPrefill } from '../../../hooks/useSessionOptionalMethodPrefill'
import {
  trackDiscussionCompleted,
  trackDiscussionSkipped,
  trackDiscussionStarted,
} from '../../../lib/analytics'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import {
  isVenturePathMethodKey,
  methodKeyAcceptsPreparerMultipleOverride,
} from '../../../lib/methods'
import { backendAPI } from '../../../services/backendApi'
import { reportService } from '../../../services/report/ReportService'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
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
  useManualReportHtmlRecovery,
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
  useSynthesisReportHeadlineSync,
} from '../hooks'
import {
  buildReviewAgenda,
  isDiscussionComplete,
  type ReviewItemKind,
} from '../utils/buildReviewAgenda'
import {
  buildDiscussionPhaseMetadata,
  type DiscussionPhaseFlow,
  type DiscussionPhaseMetadata,
} from '../utils/discussionPhaseMetadata'
import { buildManualLiveMultiplePreview } from '../utils/manualLiveMultiplePreview'
import { buildManualReportAssets } from '../utils/manualReportAssets'
import { isReportDeleteInProgress } from '../utils/manualReportDeleteGuard'
import { hasManualRestorableReport } from '../utils/manualRestorableReport'
import { manualSessionMatchesReport } from '../utils/manualSessionIdentifiers'
import { ManualLayoutBody } from './ManualLayoutBody'
import { ManualLayoutContextBar } from './ManualLayoutContextBar'
import { ManualLayoutModals } from './ManualLayoutModals'
import { ManualLayoutNav } from './ManualLayoutNav'
import { CalculatorShellSkeleton, ManualLayoutSessionError } from './ManualLayoutStatus'
import { ManualPdfStaleBanner } from './ManualPdfStaleBanner'
import type { CollectedData } from './manualLayoutDataTypes'
import { useManualLayoutViewport } from './manualLayoutShell'
import type { ManualLayoutProps } from './manualLayoutTypes'

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readDiscussionPhase(value: unknown): DiscussionPhaseMetadata | null {
  const record = asPlainRecord(value)
  const completedAt = record.completed_at ?? record.discussion_completed_at
  const skipped = record.skipped === true || record.discussion_skipped === true
  if (typeof completedAt !== 'string' && !skipped) return null
  return record as unknown as DiscussionPhaseMetadata
}

function readNestedDiscussionPhase(value: unknown): DiscussionPhaseMetadata | null {
  const record = asPlainRecord(value)
  const metadata = asPlainRecord(record.metadata)
  return (
    readDiscussionPhase(metadata.discussion_phase) ?? readDiscussionPhase(record.discussion_phase)
  )
}

function advisorDisplayName(
  user: { name?: string | null; email?: string | null } | null,
  fallback?: string | null
) {
  const fromFallback = fallback?.trim()
  if (fromFallback) return fromFallback
  const fromName = user?.name?.trim()
  if (fromName) return fromName
  return user?.email?.trim() || undefined
}

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
  // PDF-staleness lifecycle (4 refs + 3 useState + 3 effects + retry callback)
  // is owned by `usePdfStalenessLifecycle`, instantiated below once
  // `report` / `usePdfGeneration` outputs are available.

  // Venus infrastructure
  const { user } = useAuth()
  const { allowedMethodKeys, planFeatures } = useCredits()
  const { identity, isAccountantFlow } = useBootstrap()
  // Bootstrap→store sync runs once in ValuationReport.useBootstrapSync (parent tree).
  const { readOnlyKbo, autoAdvancePastPrefilledSteps } = useBootstrapPrefill()
  /** Session blob may gain DCF/NAV/SaaS after bootstrap — gap-fill empty store slots. */
  useSessionOptionalMethodPrefill()
  /** NACE resolution + identity paths when bootstrap is late or sparse — optional merge coalesced via {@link queueOptionalGapFillFlush}. */
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

  // `isMethodSwitchRendering` comes from `useManualMethodPersistenceController`
  // (coordinator `isPersisting` — only true during user-initiated method/preparer persist).
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
    !isReportDeleteInProgress(reportId) &&
    !isReportDeleteInProgress(resolvedReportId) &&
    !isReportDeleteInProgress(session?.reportId) &&
    !report &&
    !isGenerating &&
    !!session &&
    hasManualRestorableReport(session)
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

  const { isRecoveringReportHtml } = useManualReportHtmlRecovery({
    reportId,
    session,
    result,
    standaloneHtmlReport,
    restorationComplete,
    isCalculating,
    isGenerating,
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
    initialSelectedMethodsFromUrl,
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
    report,
    reportId,
    resolvedReportId,
    session,
    setChatDrawerOpen,
    setReport,
    setRightPanelView,
    setShowFullscreenModal,
    translate: t,
    translateReport: tReport,
  })

  const guardedHandleExportRef = useRef<(() => Promise<unknown> | void) | null>(null)
  const handleAssistantPdfExport = useCallback(async () => {
    const guarded = guardedHandleExportRef.current
    return guarded ? guarded() : handleExport()
  }, [handleExport])

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
      handlePdfExport: handleAssistantPdfExport,
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

  // BET-299 — "Review & Discuss" pre-lock checkpoint. It appears once after a
  // result has a review agenda, then gates export/listing until the advisor
  // confirms or explicitly accepts-all skip. Persistence rides the existing
  // saveReportAssets queue and lands in valuation_reports.metadata.discussion_phase.
  const [discussionAck, setDiscussionAck] = useState<ReviewItemKind[]>([])
  const [discussionNotes, setDiscussionNotes] = useState('')
  const [discussionDone, setDiscussionDone] = useState(false)
  const [discussionVisible, setDiscussionVisible] = useState(false)
  const [discussionPersisting, setDiscussionPersisting] = useState(false)
  const discussionFlow: DiscussionPhaseFlow = isStartupAssistantRoute ? 'startup-studio' : 'manual'
  const reviewQualityWarnings = useMemo(() => {
    const warnings = [...(chatDrawerProps.qualityWarnings ?? [])]
    if (!isStartupAssistantRoute) return warnings

    for (const issue of chatDrawerProps.startupIssues ?? []) {
      warnings.push({
        type: issue.id,
        severity:
          issue.severity === 'block' ? 'high' : issue.severity === 'warn' ? 'medium' : 'info',
      })
    }
    return warnings
  }, [chatDrawerProps.qualityWarnings, chatDrawerProps.startupIssues, isStartupAssistantRoute])
  const reviewMethodWeights = useMemo(
    () => (isStartupAssistantRoute ? { berkus: 1, scorecard: 1, exit_multiple: 1 } : userWeights),
    [isStartupAssistantRoute, userWeights]
  )
  const reviewAgenda = useMemo(
    () =>
      buildReviewAgenda({
        qualityWarnings: reviewQualityWarnings,
        methodWeights: reviewMethodWeights,
        acceptedNormalizationCount: isStartupAssistantRoute
          ? 0
          : normalizationItems.filter((n) => n.status === 'accepted').length,
        capBreachCount: !isStartupAssistantRoute && chatDrawerProps.hasCapBreach ? 1 : 0,
      }),
    [
      chatDrawerProps.hasCapBreach,
      isStartupAssistantRoute,
      normalizationItems,
      reviewMethodWeights,
      reviewQualityWarnings,
    ]
  )
  const discussionReportId = resolvedReportId ?? result?.valuation_id ?? reportId ?? null
  const existingDiscussionPhaseCandidate = useMemo(() => {
    return (
      readNestedDiscussionPhase(session?.sessionData) ??
      readNestedDiscussionPhase(result) ??
      readNestedDiscussionPhase(report)
    )
  }, [report, result, session?.sessionData])
  const discussionSessionKey = useMemo(() => {
    if (!result || reviewAgenda.items.length === 0) return null

    const agendaKey = reviewAgenda.items
      .map((item) => `${item.kind}:${item.count}:${item.severity}:${item.refs?.join(',') ?? ''}`)
      .join('|')

    return `${discussionReportId ?? 'draft'}:${effectiveAssistantMethod || 'unknown'}:${agendaKey}`
  }, [discussionReportId, effectiveAssistantMethod, result, reviewAgenda.items])
  const existingDiscussionPhase = useMemo(() => {
    const storedKey =
      typeof existingDiscussionPhaseCandidate?.discussion_session_key === 'string'
        ? existingDiscussionPhaseCandidate.discussion_session_key
        : null
    if (storedKey && discussionSessionKey && storedKey !== discussionSessionKey) {
      return null
    }
    return existingDiscussionPhaseCandidate
  }, [discussionSessionKey, existingDiscussionPhaseCandidate])
  const discussionStartedKeyRef = useRef<string | null>(null)
  const discussionAutoOpenedKeyRef = useRef<string | null>(null)
  const discussionHydrationState = useMemo(() => {
    const ackKeys = Array.isArray(existingDiscussionPhase?.warnings_acknowledged)
      ? existingDiscussionPhase.warnings_acknowledged.filter((key): key is ReviewItemKind =>
          ['quality_warning', 'method_mix', 'normalization', 'cap_breach'].includes(String(key))
        )
      : []
    return {
      ackKeys,
      done: Boolean(existingDiscussionPhase),
      notes:
        typeof existingDiscussionPhase?.advisor_discussion_notes === 'string'
          ? existingDiscussionPhase.advisor_discussion_notes
          : '',
      resetKey: discussionSessionKey,
    }
  }, [discussionSessionKey, existingDiscussionPhase])

  useEffect(() => {
    setDiscussionAck(discussionHydrationState.ackKeys)
    setDiscussionNotes(discussionHydrationState.notes)
    setDiscussionDone(discussionHydrationState.done)
    setDiscussionVisible(false)
    discussionStartedKeyRef.current = null
    discussionAutoOpenedKeyRef.current = null
  }, [discussionHydrationState])

  const markDiscussionStarted = useCallback(() => {
    if (!discussionSessionKey || discussionStartedKeyRef.current === discussionSessionKey) return
    discussionStartedKeyRef.current = discussionSessionKey
    trackDiscussionStarted({
      agenda: reviewAgenda,
      acknowledgedKeys: discussionAck,
      notes: discussionNotes,
      reportId: discussionReportId,
      selectedMethod: effectiveAssistantMethod,
      source: discussionFlow,
    })
  }, [
    discussionAck,
    discussionFlow,
    discussionNotes,
    discussionReportId,
    discussionSessionKey,
    effectiveAssistantMethod,
    reviewAgenda,
  ])

  const shouldGateDiscussion = Boolean(result && reviewAgenda.items.length > 0 && !discussionDone)

  useEffect(() => {
    if (!shouldGateDiscussion || !discussionSessionKey) return
    if (discussionAutoOpenedKeyRef.current === discussionSessionKey) return
    discussionAutoOpenedKeyRef.current = discussionSessionKey
    setDiscussionVisible(true)
    markDiscussionStarted()
  }, [discussionSessionKey, markDiscussionStarted, shouldGateDiscussion])

  const openDiscussionGate = useCallback(() => {
    if (!shouldGateDiscussion) return false
    setDiscussionVisible(true)
    markDiscussionStarted()
    toast.info(t('discussionRequired'))
    return true
  }, [markDiscussionStarted, shouldGateDiscussion, t])

  const persistDiscussionPhase = useCallback(
    async (discussionPhase: DiscussionPhaseMetadata) => {
      const targetReportId = resolvedReportId ?? reportId
      if (!targetReportId || !result) {
        throw new Error('Missing report result for discussion persistence.')
      }

      const liveSession = useSessionStore.getState().session
      const liveResultState = useManualResultsStore.getState()
      const liveFormData = useManualFormStore.getState().formData
      const sessionData = {
        ...asPlainRecord(liveSession?.sessionData),
        ...asPlainRecord(formStoreData),
        ...asPlainRecord(liveFormData),
        ...asPlainRecord(latestFormDataRef.current),
      }
      const request = asPlainRecord(lastSubmittedDataRef.current)
      const sessionHtml =
        typeof liveSession?.htmlReport === 'string' ? liveSession.htmlReport : null
      const reportHtml =
        typeof asPlainRecord(report).htmlReport === 'string'
          ? (asPlainRecord(report).htmlReport as string)
          : null
      const htmlReport =
        liveResultState.htmlReport ??
        standaloneHtmlReport ??
        sessionHtml ??
        reportHtml ??
        result.html_report
      const valuationResult = htmlReport ? { ...result, html_report: htmlReport } : result

      await reportService.saveReportAssets(
        targetReportId,
        buildManualReportAssets({
          sessionData,
          request,
          taxLatencyItems: useTaxLatencyStore.getState().items,
          valuationResult,
          name: sessionName,
          discussionPhase,
          htmlReport,
        })
      )
    },
    [
      formStoreData,
      lastSubmittedDataRef,
      latestFormDataRef,
      report,
      reportId,
      resolvedReportId,
      result,
      sessionName,
      standaloneHtmlReport,
    ]
  )

  const completeDiscussion = useCallback(
    async (skipped: boolean) => {
      if (!isDiscussionComplete(reviewAgenda, discussionAck, skipped)) {
        toast.error(t('discussionRequired'))
        return
      }

      const completedAt = new Date().toISOString()
      const skipReason = skipped ? 'advisor_accepted_all' : undefined
      const discussionPhase = buildDiscussionPhaseMetadata({
        agenda: reviewAgenda,
        acknowledgedKeys: discussionAck,
        notes: discussionNotes,
        advisorName: advisorDisplayName(user, accountantDisplayName),
        advisorUserId: user?.id,
        completedAt,
        skipped,
        skipReason,
        flow: discussionFlow,
        discussionSessionKey,
      })

      setDiscussionPersisting(true)
      try {
        await persistDiscussionPhase(discussionPhase)
        if (skipped) {
          trackDiscussionSkipped({
            agenda: reviewAgenda,
            acknowledgedKeys: discussionAck,
            notes: discussionNotes,
            reportId: discussionReportId,
            selectedMethod: effectiveAssistantMethod,
            skipReason,
            source: discussionFlow,
          })
        } else {
          trackDiscussionCompleted({
            agenda: reviewAgenda,
            acknowledgedKeys: discussionAck,
            notes: discussionNotes,
            reportId: discussionReportId,
            selectedMethod: effectiveAssistantMethod,
            source: discussionFlow,
          })
        }
        setDiscussionDone(true)
        setDiscussionVisible(false)
        toast.success(t('discussionSaved'))
      } catch (_error) {
        toast.error(t('discussionSaveFailed'), { description: t('discussionSaveFailedDesc') })
      } finally {
        setDiscussionPersisting(false)
      }
    },
    [
      accountantDisplayName,
      discussionAck,
      discussionFlow,
      discussionNotes,
      discussionReportId,
      discussionSessionKey,
      effectiveAssistantMethod,
      persistDiscussionPhase,
      reviewAgenda,
      t,
      user,
    ]
  )

  const handleDiscussionConfirm = useCallback(() => {
    void completeDiscussion(false)
  }, [completeDiscussion])

  const handleDiscussionSkip = useCallback(() => {
    void completeDiscussion(true)
  }, [completeDiscussion])

  const guardedHandleExport = useCallback(() => {
    if (openDiscussionGate()) return
    return handleExport()
  }, [handleExport, openDiscussionGate])

  const guardedHandleContinueToListing = useCallback(() => {
    if (openDiscussionGate()) return
    return handleContinueToListing()
  }, [handleContinueToListing, openDiscussionGate])

  useEffect(() => {
    guardedHandleExportRef.current = guardedHandleExport
    return () => {
      if (guardedHandleExportRef.current === guardedHandleExport) {
        guardedHandleExportRef.current = null
      }
    }
  }, [guardedHandleExport])

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
  const showAssistantFab = shouldShowVenusAiDockFab({
    isStartupAssistantRoute,
    isAssistantOpen: chatDrawerOpen,
    isFullscreenModalOpen: showFullscreenModal,
    isBlockingModalOpen:
      showUnifiedNormalizationModal ||
      showValuationEditModal ||
      methodPaywallOpen ||
      showNewValuationModal ||
      showRecalculateConfirmation,
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
          handleContinueToListing={guardedHandleContinueToListing}
          handleDeleteValuation={handleDeleteValuation}
          handleExport={guardedHandleExport}
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
          handleExport={guardedHandleExport}
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

      {result && discussionVisible && !discussionDone && reviewAgenda.items.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-foreground/10 bg-background shadow-xl">
            <ReviewAndDiscussStep
              agenda={reviewAgenda}
              acknowledgedKeys={discussionAck}
              disabled={discussionPersisting}
              onToggleAcknowledge={(key) =>
                setDiscussionAck((prev) =>
                  prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                )
              }
              notes={discussionNotes}
              onNotesChange={setDiscussionNotes}
              onConfirm={handleDiscussionConfirm}
              onSkip={handleDiscussionSkip}
              onBack={() => setDiscussionVisible(false)}
              onAskAi={() => {
                setChatDrawerOpen(true)
                markDiscussionStarted()
              }}
            />
          </div>
        </div>
      ) : null}

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
