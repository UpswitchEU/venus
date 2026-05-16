'use client'

/**
 * ManualLayout Component
 *
 * Unified calculator page matching Clarity Agent Suite's ValuationCalculator exactly.
 * Manual input as primary flow, Chat Co-pilot as slide-in drawer.
 *
 * Layout (desktop):
 *   ┌───────────────────────────────────────────────────────┐
 *   │ CalculatorNav (top bar)                                │
 *   │ ContextBar (accountant mode)                           │
 *   ├────────────┬──────────────────────────────────────────┤
 *   │ Left 35%   │ Right 65%                                 │
 *   │ ManualInput│ Report (HTML) / Preview / History       │
 *   └────────────┴──────────────────────────────────────────┘
 *   + ChatAssistantDrawer (slide-in from right)
 *   + FullscreenReportModal, UnifiedNormalizationModal
 *
 * @module features/manual/components/ManualLayout
 *
 * Phase B (advisor UX): normalisations and tax latencies should converge in
 * this valuation experience with Titan/Postgres as the source of truth;
 * the Mercury import wizard should slim to dossier essentials or deep-link
 * here — see the roadmap comment on ImportReviewContent (Mercury).
 */

import { AlertCircle, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { trackPreviewOpen, trackVersionHistoryOpen } from '@/lib/analytics'
// Calculator Components (full Clarity parity)
import {
  CalculatorNav,
  CalculatorShellSkeleton,
  ChatAssistantDrawer,
  type ChatMessage,
  ContextBar,
  type DownloadHistoryItem,
  type FieldContext,
  type FieldHelpContext,
  FullscreenReportModal,
  isImportedLedgerNormalizationItem,
  ManualInputPanel,
  type NormalizationItem,
  type RightPanelView,
  type SuggestedNormalisation,
  UnifiedNormalizationModal,
  type ValuationFormData,
  type ValuationReportData,
} from '../../../components/calculator'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import { ValuationEditModal } from '../../../components/calculator/ValuationEditModal'
import { NewValuationModal } from '../../../components/NewValuationModal'
import { RecalculateConfirmationPopup } from '../../../components/normalization/RecalculateConfirmationPopup'
import {
  filterPreSelectableMethodsForOwnerFounder,
  showAdvisorCalculatorSurface,
} from '../../../constants/accountantPlanMethods'
import { AuroraButton } from '../../../design-system/components/Button'
// Design System
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../../design-system/components/Resizable'
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
import { useUpfrontMethodNavInputs } from '../../../hooks/useUpfrontMethodNavInputs'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import {
  isVenturePathMethodKey,
  methodKeyAcceptsPreparerMultipleOverride,
  useStartupAssistantSurface,
} from '../../../lib/methods'
import { coalesceFiniteNumber } from '../../../lib/omniPreview'
import { backendAPI } from '../../../services/backendApi'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import {
  buildPersistedPreparerMultiplePayload,
  buildPreparerMultiplePayload,
  mergePreparerMultipleIntoRequest,
  usePreparerMultipleStore,
} from '../../../store/manual/usePreparerMultipleStore'
import { useConversationStore } from '../../../store/useConversationStore'
import { useImportQualityStore } from '../../../store/useImportQualityStore'
import {
  enableNormalizationAutoPersist,
  setNormalizationToastMessages,
  useNormalizationStore,
} from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { enableTaxLatencyAutoPersist } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import type { YearDataInput } from '../../../types/valuation'
import { dateLikeToUnixMs } from '../../../utils/date-like'
import { getValuationMethodResultForKey } from '../../../utils/extractValuationResultsMap'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { generalLogger } from '../../../utils/logger'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'
import { detectVersionChanges } from '../../../utils/versionDiffDetection'
// Venus infrastructure (auth, session, stores, services)
import {
  type PersistIntent,
  useLatestRef,
  useManualAgentPromptHandoff,
  useManualAiProposalActions,
  useManualAssistantIssueActions,
  useManualCalculationCompletion,
  useManualCalculationExecution,
  useManualChatFieldUpdateActions,
  useManualChatMessageActions,
  useManualChatSessionActions,
  useManualCollectedDataSync,
  useManualFieldHelpActions,
  useManualFormDataChangeSync,
  useManualLayoutResets,
  useManualMercuryNavigationActions,
  useManualMethodSelectionActions,
  useManualNewValuationFlow,
  useManualNormalizationImportActions,
  useManualNormalizationModalController,
  useManualNormalizationRecalculation,
  useManualNormalizationReviewActions,
  useManualPdfExportController,
  useManualRecalculateConfirmation,
  useManualRecentValuationDeletion,
  useManualRecentValuations,
  useManualReportMethodHydration,
  useManualReportRefreshAfterEdit,
  useManualSubmitErrorHandler,
  useManualSubmitRunGuard,
  useManualSynthesisController,
  useManualSynthesisSkippedWarnings,
  useManualVersionRestoreAction,
  usePdfStalenessLifecycle,
  useRestorationGate,
  useResultToReportBridge,
  useValuationPersistenceCoordinator,
} from '../hooks'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'
import type { ManualPendingFieldUpdate } from '../utils/manualChatCommandHandling'
import type { SubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'
import { mapClarityFormToVenusStore } from '../utils/manualFormMapper'
import {
  buildManualInputInitialData,
  buildManualLiveValuationSubmitData,
} from '../utils/manualInputData'
import {
  getManualHydratedValuationResults,
  getManualModalEditPersistToast,
  getManualUserInitials,
  serializeManualPreparerPayload,
} from '../utils/manualLayoutAdapters'
import { buildManualLiveMultiplePreview } from '../utils/manualLiveMultiplePreview'
import { buildManualLiveYearlyFinancials } from '../utils/manualLiveYearlyFinancials'
import { getManualOriginalEbitdaForDisplay } from '../utils/manualOriginalEbitdaDisplay'
import { shouldBlockExtremePreparerMultiple } from '../utils/manualPreparerMultipleGuard'
import { buildManualQualityWarnings } from '../utils/manualQualityWarnings'
import { hasManualRestorableReport } from '../utils/manualRestorableReport'
import { buildManualRestoredFinancialSnapshot } from '../utils/manualRestoredFinancialSnapshot'
import {
  getManualSessionKey,
  manualSessionMatchesReport,
  resolveManualCanonicalReportId,
  resolveManualPersistedReportLookupId,
  resolveManualReportHydrationLookupId,
  resolveManualReportId,
} from '../utils/manualSessionIdentifiers'
import { formatManualStartupAssistantPrompt } from '../utils/manualStartupAssistantPrompt'
import { getManualStartupLauncherScopeId } from '../utils/manualStartupAssistantSurface'
import {
  getManualSubmitValidationIssue,
  MANUAL_SUBMIT_VALIDATION_TOAST_KEYS,
} from '../utils/manualSubmitValidation'
import { buildManualCalculationRequest } from '../utils/manualValuationRequest'
import { buildManualVersionHistoryForNav } from '../utils/manualVersionNav'
import { ManualReportWorkspace } from './ManualReportWorkspace'
import {
  ManualStarterPaywallModal,
  type ManualStarterPaywallReason,
} from './ManualStarterPaywallModal'
import { useManualLayoutIsMobile } from './manualLayoutShell'
import type { ManualLayoutProps } from './manualLayoutTypes'
// `selectCapTableSimulatorResult` import removed alongside the React slider
// mount — the canonical Jinja report is now the single source of truth.
// The selector helper itself is intentionally kept on disk for the future.
import { deriveManualReportPresentation } from './manualReportPresentation'

/** Poll while PDF is stale; extend max window so slow jobs can still complete */
const _PDF_STALE_POLL_INTERVAL_MS = 2500
const _PDF_STALE_POLL_MAX_MS = 120_000

// `isDcfOrHybridMethodSignal` + `resultHasWeightedSynthesisSignal` moved
// into `features/manual/utils/mapValuationResultToReport` as part of the
// Phase 4c.2 Hook 2 bridge extraction.

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface CollectedData {
  companyName?: string
  kboNumber?: string
  legalForm?: string
  businessStructure?: string
  address?: string
  naceCode?: string
  naceDescription?: string
  /** Canonical NACE (store-aligned); optional when equal to display naceCode */
  canonicalNaceCode?: string
  businessType?: string
  /** ValuationRequest.business_model (enum), not business type id — synced from Zustand for the bridge. */
  businessModel?: string
  industry?: string
  country?: string
  yearFounded?: string
  ownerManagers?: number
  fteEmployees?: number
  /** Financial data from ManualInputPanel (for AI context before submit) */
  revenue?: number
  ebitda?: number
  yearlyFinancials?: Array<{
    year: string
    revenue: number
    ebitda: number
    capex?: number
    depreciation?: number
    tax_expense?: number
    cash?: number
    total_debt?: number
    current_assets?: number
    current_liabilities?: number
    accounts_receivable?: number
    accounts_payable?: number
    inventory?: number
    short_term_debt?: number
    nwc_change?: number
    isForecast?: boolean
  }>
  current_year_data?: {
    year: number
    revenue: number
    ebitda: number
    capex?: number
    depreciation?: number
    tax_expense?: number
    cash?: number
    total_debt?: number
    current_assets?: number
    current_liabilities?: number
    accounts_receivable?: number
    accounts_payable?: number
    inventory?: number
    short_term_debt?: number
    nwc_change?: number
  }
  historical_years_data?: YearDataInput[]
  forecast_years_data?: YearDataInput[]
}

/** Titan modal-edit failures — same messages as Mercury OmniCalcSummary mapping */
function toastModalEditPersistError(err: unknown, tToast: (key: string) => string) {
  const toastConfig = getManualModalEditPersistToast(err)
  if (toastConfig.descriptionKey) {
    toast.error(tToast(toastConfig.titleKey), {
      description: tToast(toastConfig.descriptionKey),
    })
    return
  }
  toast.error(tToast(toastConfig.titleKey))
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export const ManualLayout: React.FC<ManualLayoutProps> = ({
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
  const router = useTransitionRouter()
  const t = useTranslations('toast')
  const tReport = useTranslations('report')
  const tHistory = useTranslations('historyPanel')
  const tErrors = useTranslations('errors')
  const tPreparer = useTranslations('preparerMultiple')
  const tMethodSelector = useTranslations('manualInput.methodSelector')
  const isMobile = useManualLayoutIsMobile()

  // Panel layout: no persistence (match Clarity v2). Clear all layout keys before first paint.
  useLayoutEffect(() => {
    try {
      const keysToRemove = [
        'venus-calculator-layout-v2',
        'venus-calculator-panels',
        'upswitch-panel-width',
        'react-resizable-panels:venus-calculator-layout-v2',
        'react-resizable-panels:venus-calculator-panels',
      ]
      keysToRemove.forEach((k) => localStorage.removeItem(k))
      Object.keys(localStorage)
        .filter((k) => k.includes('react-resizable-panels') || k.includes('venus-calculator'))
        .forEach((k) => localStorage.removeItem(k))
    } catch {
      // localStorage may be unavailable in embedded/private contexts.
    }
  }, [])

  // Provide i18n for normalization store toasts (store cannot use hooks).
  // Contract: getter receives keys like 'normalizationNotSaved'; t is useTranslations('toast')
  // so t(key) resolves to toast.normalizationNotSaved etc.
  useEffect(() => {
    setNormalizationToastMessages((key) => t(key))
    return () => setNormalizationToastMessages(null)
  }, [t])
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

  // Shallow-compared selector: re-renders only when one of these 15 fields
  // changes (was: subscribed to the whole results store, so every set()
  // re-rendered ManualLayout). Zustand v4.5 `useShallow` wraps the selector
  // with a shallow-equal comparator so Object.is-on-state-root is bypassed.
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
  } = useManualResultsStore(
    useShallow((s) => ({
      isCalculating: s.isCalculating,
      result: s.result,
      selectedMethod: s.selectedMethod,
      setSelectedMethod: s.setSelectedMethod,
      preSelectedMethod: s.preSelectedMethod,
      setPreSelectedMethod: s.setPreSelectedMethod,
      togglePreSelectedMethod: s.togglePreSelectedMethod,
      trySetCalculating: s.trySetCalculating,
      setCalculating: s.setCalculating,
      setResult: s.setResult,
    }))
  )
  // Atomic selector: `updateFormData` is a stable Zustand action reference,
  // so this re-renders only on rare hot-reload / store-recreation events.
  // (Was: `useManualFormStore()` with no selector — re-rendered on every
  // form keystroke.)
  const updateFormData = useManualFormStore((s) => s.updateFormData)
  const formStoreData = useManualFormStore((s) => s.formData)
  const { currentYearRevenueForMethodNav, preSelectableMethodsForNav: firmPreSelectableMethods } =
    useUpfrontMethodNavInputs(formStoreData, user?.firm_country_code)
  // Show the full advisor method nav whenever the viewer is accountant-tier
  // *or* is acting on behalf of a client. `isAccountantFlow` alone misses
  // standalone advisor sessions (no client context), which previously got
  // restricted to the 3-method owner-founder list — see the helper docstring
  // for the full rationale and the cross-app role contract.
  const showFullAdvisorMethodNav = showAdvisorCalculatorSurface(isAccountantFlow, user?.role)
  const preSelectableMethodsForNav = useMemo(
    () =>
      filterPreSelectableMethodsForOwnerFounder(firmPreSelectableMethods, showFullAdvisorMethodNav),
    [firmPreSelectableMethods, showFullAdvisorMethodNav]
  )
  const planLockedMethodKeys = useMemo(() => {
    if (allowedMethodKeys === null) return undefined
    const allowed = new Set(allowedMethodKeys)
    const next = new Set<string>()
    for (const m of preSelectableMethodsForNav) {
      if (!allowed.has(m)) next.add(m)
    }
    return next.size > 0 ? next : undefined
  }, [allowedMethodKeys, preSelectableMethodsForNav])
  const ebitdaNormalizationLocked = Boolean(planFeatures && !planFeatures.ebitda_normalization)
  const versionControlLocked = Boolean(planFeatures && !planFeatures.version_control)
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const activeSessionKey = getManualSessionKey(session)
  const sessionError = useSessionStore((s) => s.errorMessage)
  const _reportIdFromSession = useSessionStore((s) => s.session?.reportId)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const sessionName = useSessionStore((s) => s.session?.name)
  const importQualityMap = useImportQualityStore((s) => s.importQuality)
  const hasImportQuality =
    !!importQualityMap &&
    typeof importQualityMap === 'object' &&
    Object.keys(importQualityMap).length > 0
  // Atomic selectors for stable Zustand actions (was: subscribed to whole
  // version-history store, re-rendering on every version-list mutation).
  const createVersion = useVersionHistoryStore((s) => s.createVersion)
  const getLatestVersion = useVersionHistoryStore((s) => s.getLatestVersion)

  // Resolve session key (val_xxx) to UUID before PDF hook — POST /api/valuations/:id/pdf must match Titan id
  const resolvedReportId = useMemo(() => {
    return resolveManualReportId(reportId, session)
  }, [reportId, session])
  const manualChatReportId = useMemo(() => {
    return (
      resolveManualCanonicalReportId({
        session,
        resolvedReportId,
        routeReportId: reportId,
        resultValuationId: result?.valuation_id,
        activeSessionKey,
      }) ??
      resolvedReportId ??
      reportId
    )
  }, [activeSessionKey, reportId, resolvedReportId, result?.valuation_id, session])

  const {
    state: pdfGenerationState,
    generatePdf,
    downloadPdf,
    isReady: isPdfReady,
  } = usePdfGeneration(resolvedReportId ?? reportId)
  const preparerAppliedMedian = usePreparerMultipleStore((s) => s.appliedMedian)
  const preparerBenchmarkMedian = usePreparerMultipleStore((s) => s.benchmarkMedian)
  const preparerReasonKey = usePreparerMultipleStore((s) => s.reasonKey)
  const preparerNote = usePreparerMultipleStore((s) => s.note)
  const preparerAcknowledgedExtreme = usePreparerMultipleStore((s) => s.acknowledgedExtreme)

  const currentLocale = useLocale()

  // ─── Accountant Mode Detection (hooks must be before any early returns) ───
  const [isAccountantMode, setIsAccountantMode] = useState(false)
  const [clientContextName, setClientContextName] = useState<string | undefined>(undefined)
  const [clientContextId, setClientContextId] = useState<string | undefined>(undefined)
  const [accountantDisplayName, setAccountantDisplayName] = useState<string | undefined>(undefined)

  const ctxIsActingAsClient = useClientContext((s) => s.isActingAsClient)
  const ctxRelationshipId = useClientContext((s) => s.relationshipId)
  const ctxClient = useClientContext((s) => s.client)
  const ctxRelationshipCustomerName = useClientContext((s) => s.relationshipCustomerName)
  const ctxAccountant = useClientContext((s) => s.accountant)
  // Cross-app AI conversation continuity: when this drawer fires
  // /api/ai/chat (or /api/ai/history), the Venus BFF forwards the
  // X-Client-User-Id header (`stores/clientContext.getContextHeaders`).
  // Titan's `resolveConversationLookupKey` reads that header and
  // overrides the conversation row to `client_<clientUserId>` — the
  // same key Mercury's advisor dock writes on
  // `/advisor/clients/<id>/*` routes. Both surfaces converge on a
  // single `ai_conversations` row per client. No FE wiring needed
  // here; the helper at `../../../utils/aiConversationKey` exists as
  // a parallel-tests contract pin for the Mercury equivalent.

  useEffect(() => {
    // Subscribe to client context so accountant mode updates when context hydrates
    // async (auth, get-client-context, zustand persist) — a one-shot mount effect
    // missed this and left isAccountantMode false → back button used router.back().
    if (ctxIsActingAsClient && ctxRelationshipId) {
      setIsAccountantMode(true)
      setClientContextName(
        ctxClient?.fullName || ctxClient?.email || ctxRelationshipCustomerName || undefined
      )
      setClientContextId(ctxRelationshipId)
      if (ctxAccountant) {
        setAccountantDisplayName(ctxAccountant.fullName || ctxAccountant.email || undefined)
      }
    } else {
      setIsAccountantMode(false)
      setClientContextName(undefined)
      setClientContextId(undefined)
      setAccountantDisplayName(undefined)
    }
  }, [
    ctxIsActingAsClient,
    ctxRelationshipId,
    ctxClient,
    ctxRelationshipCustomerName,
    ctxAccountant,
  ])

  // Match advisor nav + startup surface: bootstrap client-session **or** tier role,
  // plus client-context store (can lead bootstrap by a frame).
  const showPreparerMultiplePanel = useMemo(
    () => showFullAdvisorMethodNav || isAccountantMode,
    [showFullAdvisorMethodNav, isAccountantMode]
  )

  const linkedIdentifier = useMemo(() => {
    const id = resolvedReportId || reportId
    if (!id || id === 'new' || typeof id !== 'string') return null
    return id
  }, [resolvedReportId, reportId])

  const calculationRequestIdentifiers = useMemo(
    () => ({
      reportId:
        linkedIdentifier && (isUuid(linkedIdentifier) || isSessionKey(linkedIdentifier))
          ? linkedIdentifier
          : undefined,
      sessionKey: linkedIdentifier && isSessionKey(linkedIdentifier) ? linkedIdentifier : undefined,
    }),
    [linkedIdentifier]
  )

  const persistedReportLookupId = useMemo(() => {
    return resolveManualPersistedReportLookupId({ session, resolvedReportId, reportId })
  }, [session, resolvedReportId, reportId])

  const reportHydrationLookupId = useMemo(() => {
    return resolveManualReportHydrationLookupId({ session, resolvedReportId, reportId })
  }, [session, resolvedReportId, reportId])

  // Session matches when reportId equals session.reportId (UUID) or session.key (session key)
  const sessionMatchesReport = manualSessionMatchesReport(session, reportId)

  // Async loading: show calculator shell skeleton instead of blocking LoadingState
  const isLoading = status === 'loading'
  const isInitializing = status === 'idle' || status === 'loading'
  if (isLoading || isInitializing || !session || !sessionMatchesReport) {
    return <CalculatorShellSkeleton />
  }
  if (sessionError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-destructive/20 border border-destructive/30 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-destructive mb-2">
              {tErrors('session.title')}
            </h3>
            <p className="text-destructive/80 mb-6">{sessionError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-lg transition-colors font-medium"
            >
              {tErrors('session.reloadPage')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Report & Generation State ───
  const [report, setReport] = useState<ValuationReportData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
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
  const canDownloadPdf = useMemo(() => {
    if (planFeatures?.valuation_download !== false) return true
    // Free-tier seller carve-out for startup PDF only: match Titan `allowFreeSellerStartupValuationPdf`.
    // Use navigation method only (not stale `result.selected_valuation_method`) so switching away from
    // startup does not keep the download UI unlocked. Exclude accountant/client flows so advisor UX
    // stays plan-gated like Mercury expectations.
    if (user?.role !== 'seller' || isAccountantFlow) return false
    const effectiveMethod = preSelectedMethod ?? selectedMethod
    return isVenturePathMethodKey(effectiveMethod)
  }, [
    planFeatures?.valuation_download,
    user?.role,
    selectedMethod,
    preSelectedMethod,
    isAccountantFlow,
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
  const [_reportStatus, _setReportStatus] = useState<'draft' | 'final'>('draft')
  // ─── Panel View State ───
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(initialTab ?? 'preview')

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

  // ─── Chat Co-pilot State ───
  const [chatDrawerOpen, setChatDrawerOpen] = useState(initialDrawerOpen)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatGenerating, setIsChatGenerating] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  // Shallow-compared selector: re-renders only when one of these 7 fields
  // changes (was: subscribed to whole conversation store).
  const conversationStore = useConversationStore(
    useShallow((s) => ({
      lastLoadedReportId: s.lastLoadedReportId,
      conversationId: s.conversationId,
      toolInProgress: s.toolInProgress,
      setToolInProgress: s.setToolInProgress,
      setConversationId: s.setConversationId,
      loadHistory: s.loadHistory,
      clearMessages: s.clearMessages,
    }))
  )
  const streamCleanupRef = useRef<(() => void) | null>(null)
  const tCa = useTranslations('chatAssistant')

  // Pass-7: track which engine-emitted high-severity warnings the advisor
  // has already addressed (clicked CTA → assistant) or dismissed. Local-only
  // state — a fresh result clears stale entries below. Persisting to the
  // session/store is a future improvement; for launch this is sufficient
  // because the advisor resolves warnings within a single session.
  const [acknowledgedQualityWarnings, setAcknowledgedQualityWarnings] = useState<Set<string>>(
    () => new Set()
  )
  // Startup-specific issue acknowledgement for assistant cards.
  const [acknowledgedStartupIssues, setAcknowledgedStartupIssues] = useState<Set<string>>(
    () => new Set()
  )
  // Track reset signatures for warning-card acknowledgement state.
  const lastQualityWarningResetKeyRef = useRef<string | null>(null)
  const lastSynthesisBlendSkippedRunKeyRef = useRef<string | null>(null)

  const versionSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (versionSyncTimeoutRef.current) clearTimeout(versionSyncTimeoutRef.current)
    }
  }, [])

  const [fieldContext, setFieldContext] = useState<FieldContext | undefined>(undefined)
  const [pendingUpdates, setPendingUpdates] = useState<ManualPendingFieldUpdate[]>([])

  // ─── Normalization State (Unified Store) ───
  const normalizationItems = useNormalizationStore((s) => s.items)
  // Shallow-compared selector for the 6 setters used below. All setters are
  // stable Zustand action references so this effectively never re-renders.
  // (Was: subscribed to whole normalization store, re-rendering on every
  // items / metadata change.)
  const normalizationActions = useNormalizationStore(
    useShallow((s) => ({
      setItems: s.setItems,
      persistToSession: s.persistToSession,
      addItems: s.addItems,
      acceptItem: s.acceptItem,
      rejectItem: s.rejectItem,
      updateItem: s.updateItem,
    }))
  )
  const [suggestedNormalisations, setSuggestedNormalisations] = useState<SuggestedNormalisation[]>(
    []
  )

  useEffect(() => {
    const hasImportedPendingItems = normalizationItems.some(
      (item) => isImportedLedgerNormalizationItem(item) && item.status === 'pending'
    )
    if (!hasImportedPendingItems) return

    normalizationActions.setItems(
      normalizationItems.map((item) =>
        isImportedLedgerNormalizationItem(item) && item.status === 'pending'
          ? { ...item, status: 'accepted' as const }
          : item
      )
    )

    const idForApi = resolvedReportId || reportId
    if (idForApi) normalizationActions.persistToSession(idForApi)
  }, [normalizationActions, normalizationItems, reportId, resolvedReportId])
  /** Latest financial data from ManualInputPanel (for AI context before submit) */
  const latestFormDataRef = useRef<Partial<CollectedData>>({})

  useEffect(() => {
    latestFormDataRef.current = {
      ...latestFormDataRef.current,
      current_year_data:
        formStoreData.current_year_data ?? latestFormDataRef.current.current_year_data,
      historical_years_data:
        formStoreData.historical_years_data ?? latestFormDataRef.current.historical_years_data,
      forecast_years_data:
        formStoreData.forecast_years_data ?? latestFormDataRef.current.forecast_years_data,
    }
  }, [
    formStoreData.current_year_data,
    formStoreData.historical_years_data,
    formStoreData.forecast_years_data,
  ])

  const getLiveYearlyFinancials = useCallback(() => {
    return buildManualLiveYearlyFinancials({
      latestYearlyFinancials: latestFormDataRef.current?.yearlyFinancials,
      formData: formStoreData,
    })
  }, [
    formStoreData.current_year_data,
    formStoreData.historical_years_data,
    formStoreData.forecast_years_data,
    formStoreData,
  ])

  // Derive financial years from the latest live form snapshot for the normalization modal.
  // Exclude forecast years — normalization only applies to historical actuals.
  const financialYears = (() => {
    const filingYear = getCurrentFilingYear()
    const years = new Set<number>([filingYear])
    getLiveYearlyFinancials().forEach((yearData) => {
      const year = Number(yearData.year)
      if (Number.isFinite(year) && year >= 2000 && year <= filingYear) {
        years.add(year)
      }
    })
    return Array.from(years).sort((a, b) => b - a)
  })()

  // Restored yearly financials from form store for ManualInputPanel initialData.
  // Memoized to stabilize the reference and prevent unnecessary prefill effect runs.
  const restoredYearlyFinancials = useMemo(() => {
    const allYears = getLiveYearlyFinancials()
    return allYears.length > 0 ? allYears : undefined
  }, [getLiveYearlyFinancials])

  // Per-year reported EBITDA for accurate multi-year normalization display
  const originalEBITDAByYear = (() => {
    const byYear: Record<number, number> = {}
    getLiveYearlyFinancials().forEach((yearData) => {
      const year = Number(yearData.year)
      const ebitda = Number(yearData.ebitda)
      if (Number.isFinite(year) && year >= 2000 && year <= 2100 && Number.isFinite(ebitda)) {
        byYear[year] = ebitda
      }
    })
    if (!(getCurrentFilingYear() in byYear)) {
      const fallbackCurrentEbitda =
        latestFormDataRef.current?.ebitda ??
        latestFormDataRef.current?.current_year_data?.ebitda ??
        formStoreData?.current_year_data?.ebitda ??
        formStoreData?.ebitda
      const parsedFallbackCurrentEbitda = Number(fallbackCurrentEbitda)
      if (Number.isFinite(parsedFallbackCurrentEbitda)) {
        byYear[getCurrentFilingYear()] = parsedFallbackCurrentEbitda
      }
    }
    return byYear
  })()

  // For normalization modal: use REPORTED EBITDA (before adjustments), not normalized.
  // report.ebitda is the normalized value used in valuation — using it would show wrong
  // Origineel (e.g. €99K instead of €100K) and double-apply adjustments.
  const getOriginalEbitdaForDisplay = useCallback(() => {
    return getManualOriginalEbitdaForDisplay({
      year: getCurrentFilingYear(),
      originalEBITDAByYear,
      formCurrentEbitda: formStoreData?.current_year_data?.ebitda,
      latestFormData: latestFormDataRef.current,
      result,
      report,
    })
  }, [formStoreData?.current_year_data?.ebitda, originalEBITDAByYear, report, result])

  // ─── Modal State ───
  const [showFullscreenModal, setShowFullscreenModal] = useState(false)
  const [showValuationEditModal, setShowValuationEditModal] = useState(false)
  const [methodPaywallOpen, setMethodPaywallOpen] = useState(false)
  const [methodPaywallReason, setMethodPaywallReason] =
    useState<ManualStarterPaywallReason>('methods')
  const openStarterPaywall = useCallback((reason: ManualStarterPaywallReason) => {
    setMethodPaywallReason(reason)
    setMethodPaywallOpen(true)
  }, [])

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

  // ─── Draft State ───
  const [draftStatus, setDraftStatus] = useState<'draft' | 'saved' | 'saving'>('draft')
  const [lastSaved, setLastSaved] = useState<Date | undefined>(undefined)

  // ─── Collected Data (bi-directional sync) ───
  // business_type_id = Titan API business type ID (e.g. "restaurant"); business_type = legal structure ("company")
  const formCompanyName = useManualFormStore((s) => s.formData.company_name)
  const formBusinessTypeId = useManualFormStore((s) => s.formData.business_type_id)
  const formIndustry = useManualFormStore((s) => s.formData.industry)
  const formBusinessModel = useManualFormStore((s) => s.formData.business_model)
  const formCountry = useManualFormStore((s) => s.formData.country_code)
  const formYearFounded = useManualFormStore((s) => s.formData.founding_year)
  const formKboNumber = useManualFormStore((s) => s.formData.kbo_number)
  const formLegalForm = useManualFormStore((s) => s.formData.legal_form)
  const formCity = useManualFormStore((s) => s.formData.city)
  const formPostalCode = useManualFormStore((s) => s.formData.postal_code)
  const formNaceCode = useManualFormStore((s) => s.formData.nace_code)
  const formActivityCode = useManualFormStore((s) => s.formData.activity_code)
  const formNaceDescription = useManualFormStore((s) => s.formData.nace_description)
  const resultCompanyName = result?.company_name
  const companyName = formCompanyName || resultCompanyName

  const formAddress = [formPostalCode, formCity].filter(Boolean).join(' ')
  const formNumber_of_employees = useManualFormStore((s) => s.formData.number_of_employees)
  // `number_of_owners` is the Zustand mirror of the panel's `ownerManagers`
  // field. It is set by session restore, BusinessCard prefill, and the
  // assistant CTA at line 3718. Without seeding `collectedData.ownerManagers`
  // from it, the panel's `initialData.ownerManagers || 1` defaults to 1 on
  // every mount, silently discarding any pre-known owner count.
  const formNumberOfOwners = useManualFormStore((s) => s.formData.number_of_owners)
  const [collectedData, setCollectedData] = useState<CollectedData>({
    companyName: companyName || '',
    kboNumber: formKboNumber || '',
    legalForm: formLegalForm || '',
    businessStructure: mapLegalFormToBusinessStructure(formLegalForm || '') || undefined,
    address: formAddress || '',
    naceCode: formActivityCode || formNaceCode || '',
    naceDescription: formNaceDescription || '',
    businessType: formBusinessTypeId || '',
    industry: formIndustry || '',
    businessModel: formBusinessModel || 'services',
    country: formCountry || 'BE',
    yearFounded: formYearFounded ? String(formYearFounded) : '',
    ownerManagers:
      typeof formNumberOfOwners === 'number' && formNumberOfOwners > 0 ? formNumberOfOwners : 1,
    fteEmployees: formNumber_of_employees,
  })

  /** Dirty state: user edited financial inputs after a report was generated. Reset on successful submit. */
  const [isDirty, setIsDirty] = useState(false)
  /** Snapshot of financial data from last successful submit. Used to detect edits. */
  const lastSubmittedFinancialSnapshotRef = useRef<SubmittedFinancialSnapshot | null>(null)

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

  // When report is restored (e.g. from URL) without our submit, set baseline from form store so we can detect edits
  useEffect(() => {
    if (!result || lastSubmittedFinancialSnapshotRef.current) return
    const restoredSnapshot = buildManualRestoredFinancialSnapshot(formStoreData)
    if (!restoredSnapshot) return
    lastSubmittedFinancialSnapshotRef.current = restoredSnapshot
    setIsDirty(false)
  }, [
    result,
    formStoreData.current_year_data,
    formStoreData.historical_years_data,
    formStoreData.revenue,
    formStoreData.ebitda,
    formStoreData.forecast_years_data,
    formStoreData,
  ])

  useManualCollectedDataSync<CollectedData>({
    formSurface: {
      activityCode: formActivityCode,
      address: formAddress,
      businessModel: formBusinessModel,
      businessTypeId: formBusinessTypeId,
      city: formCity,
      companyName,
      country: formCountry,
      industry: formIndustry,
      kboNumber: formKboNumber,
      legalForm: formLegalForm,
      naceCode: formNaceCode,
      naceDescription: formNaceDescription,
      postalCode: formPostalCode,
      yearFounded: formYearFounded,
    },
    restorationComplete,
    sessionData: session?.sessionData,
    setCollectedData,
    updateFormData,
  })

  // Display name for top-left dropdown: collectedData > client context (accountant) > fallback
  const displayCompanyName =
    collectedData.companyName?.trim() ||
    (isAccountantFlow && identity.clientContext?.clientCompanyName?.trim()) ||
    t('newEstimation')

  // Enable auto-persist for normalization store (use resolvedReportId for session key consistency)
  useEffect(() => {
    const unsub = enableNormalizationAutoPersist(() => resolvedReportId || reportId || undefined)
    return unsub
  }, [reportId, resolvedReportId])

  // Enable auto-persist for tax latency store (use resolvedReportId for session key consistency,
  // matching normalization auto-persist above — otherwise normalisations and latencies can save
  // under different session keys and partially desync on restore).
  useEffect(() => {
    const unsub = enableTaxLatencyAutoPersist(() => resolvedReportId || reportId || undefined)
    return unsub
  }, [reportId, resolvedReportId])

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (showFullscreenModal) setShowFullscreenModal(false)
        else if (chatDrawerOpen) setChatDrawerOpen(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setChatDrawerOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFullscreenModal, chatDrawerOpen])

  // ─── Version History (REAL - from useVersionHistoryStore) ───
  const versions = useVersionHistoryStore((s) => s.versions[resolvedReportId || reportId] || [])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current')

  // NOTE: Version fetching is owned by HistoryPanel (single owner pattern).
  // Do NOT fetch here to avoid duplicate API calls and race conditions.

  // Map versions to CalculatorNav format
  const versionHistoryForNav = React.useMemo(() => {
    return buildManualVersionHistoryForNav({
      versions,
      report,
      selectedMethod,
      currentVersionLabel: t('currentVersion'),
    })
  }, [versions, report, selectedMethod, t])

  // Cap-table simulator React mount removed: the canonical Jinja report
  // (`startup_one_pager.html` + `startup_cap_table.html`) is now the
  // single source of truth for the simulator card. Founders see one
  // surface for the post-money/dilution rollup instead of three (React
  // slider + one-pager + cap-table page). The selector + helper file
  // (`selectCapTableSimulatorResult`) and the Python emitter remain in
  // case we want to bring back the interactive slider later, gated by
  // a feature flag, but they are not wired into the right rail.

  const synthesisUnlocked = planFeatures?.valuation_synthesis ?? false
  const handleSelectVersion = useCallback(
    (id: string) => {
      if (planFeatures && !planFeatures.version_control && id !== 'current') {
        openStarterPaywall('version_history')
        return
      }
      setSelectedVersionId(id)
      const version = versions.find((v) => v.id === id)
      if (version?.valuationResult) {
        const enrichedResult = {
          ...version.valuationResult,
          html_report: getFirstRenderableReportHtml(
            version.valuationResult.html_report,
            version.htmlReport
          ),
        }
        setResult(enrichedResult)
        toast.info(t('versionLoaded', { label: version.versionLabel }))
      }
    },
    [planFeatures, openStarterPaywall, versions, setResult, t]
  )

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

  // ─── Omni-Calc: Update displayed valuation when selected method changes ───
  const prevSelectedMethodRef = useRef(selectedMethod)
  useEffect(() => {
    if (!report) return
    const hydrated = getManualHydratedValuationResults(result) ?? {}
    if (!Object.keys(hydrated).length) return
    if (selectedMethod === prevSelectedMethodRef.current) return
    prevSelectedMethodRef.current = selectedMethod

    const methodData = getValuationMethodResultForKey(hydrated, selectedMethod)
    const rawVal = methodData?.value
    const n = rawVal == null ? NaN : Number(rawVal)
    if (!methodData?.available || !Number.isFinite(n)) return
    const presentation = deriveManualReportPresentation(result, selectedMethod)

    setReport((prev) =>
      prev
        ? {
            ...prev,
            valuation: presentation.valuation,
            valuationLow: presentation.valuationLow,
            valuationHigh: presentation.valuationHigh,
            multiple: presentation.multiple ?? prev.multiple,
            multipleRange: presentation.multipleRange ?? prev.multipleRange,
            recommendedAskingPrice: presentation.valuation,
          }
        : prev
    )
  }, [selectedMethod, result, report])

  // ─── Omni-Calc: Persist method selection to Titan + re-render report ───
  // The state machine for "two concurrent debounced persist paths" used to
  // live here as four refs + one boolean state + two ~50-line useEffects.
  // It now lives behind `useValuationPersistenceCoordinator` — see below.
  // `pendingOverrideRef` is still owned by the caller because the override
  // metadata is collected at click time (via `handleSelectMethodWithOverride`)
  // and consumed at the next method enqueue.
  const pendingOverrideRef = useRef<{ reason?: string; note?: string }>({})
  const { refreshReportAfterEdit } = useManualReportRefreshAfterEdit({
    canDownloadPdf,
    generatePdf,
    persistedReportLookupId,
    setReport,
    setResult,
  })

  // The PDF stale-poll loop (was ~115 lines of setInterval with backoff +
  // streak detection + in-flight guard) and its retry handler (~50 lines)
  // both moved into `usePdfStalenessLifecycle`. `handleRetryPdfStalled` is
  // exposed as `retry` on that hook (destructured + aliased near the hook
  // call site).

  const pdfStaleBannerEl = useMemo(() => {
    if (!report || !pdfStale) return null
    const pollBlurb = pdfWaitTimedOut
      ? t('pdfStalledBlurb')
      : pdfPollErrorCount >= 2
        ? t('pdfPollDegradedHint')
        : t('pdfUpdatingBlurb')
    return (
      <div
        role="status"
        className="shrink-0 border-b border-primary/20 bg-primary/[0.06] px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {pdfWaitTimedOut ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-primary" aria-hidden />
          ) : (
            <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-primary animate-spin" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {pdfWaitTimedOut ? t('pdfStalledTitle') : t('pdfUpdating')}
            </p>
            <p className="text-[11px] text-foreground/55 mt-1 leading-snug">{pollBlurb}</p>
          </div>
        </div>
        {pdfWaitTimedOut ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-auto">
            <AuroraButton
              type="button"
              size="sm"
              variant="primary"
              loading={isPdfRetrying}
              disabled={isPdfRetrying || !persistedReportLookupId}
              onClick={() => void handleRetryPdfStalled()}
            >
              {t('pdfRetry')}
            </AuroraButton>
            {canDownloadPdf && report.pdfUrl ? (
              <AuroraButton
                type="button"
                size="sm"
                variant="outline"
                disabled={isPdfRetrying}
                onClick={() => {
                  if (report.pdfUrl) window.open(report.pdfUrl, '_blank', 'noopener,noreferrer')
                }}
              >
                {t('pdfOpenLastVersion')}
              </AuroraButton>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }, [
    report,
    pdfStale,
    pdfWaitTimedOut,
    pdfPollErrorCount,
    t,
    isPdfRetrying,
    persistedReportLookupId,
    handleRetryPdfStalled,
    canDownloadPdf,
  ])

  // Latest-ref for the server-confirmed previously persisted method.
  // Captured here (not in deps) so the enqueue effect doesn't re-fire on
  // every `result` change — the coordinator dedups via baseline anyway.
  const resultMethodRef = useLatestRef<string | undefined>(
    (result as { selected_valuation_method?: string } | null)?.selected_valuation_method
  )

  // Single source of truth for the two formerly-racing persist paths.
  // The coordinator owns: debounce, dedup, supersede (method ⊃ preparer),
  // serialization, and AbortController-based cancellation. See
  // `useValuationPersistenceCoordinator` for the contract.
  const persistCoordinator = useValuationPersistenceCoordinator({
    reportId: persistedReportLookupId ?? null,
    initialBaseline: {
      method: selectedMethod,
      preparerSignature: serializeManualPreparerPayload(
        buildPersistedPreparerMultiplePayload(result)
      ),
    },
    runner: async (intent: PersistIntent, signal: AbortSignal) => {
      if (!persistedReportLookupId) return
      const preparerOptions: Parameters<typeof backendAPI.updateSelectedMethod>[4] =
        intent.kind === 'preparer'
          ? intent.payload != null
            ? (intent.payload as Parameters<typeof backendAPI.updateSelectedMethod>[4])
            : intent.clear
              ? { clear_preparer_override: true }
              : undefined
          : undefined
      const overrideReason = intent.kind === 'method' ? intent.overrideReason : undefined
      const overrideNote = intent.kind === 'method' ? intent.overrideNote : undefined
      const res = await backendAPI.updateSelectedMethod(
        persistedReportLookupId,
        intent.method,
        overrideReason,
        overrideNote,
        preparerOptions
      )
      // Honour the abort signal between the server-side persist (which
      // already committed) and the client-side refresh (which writes to
      // `setResult` / `setReport`). Without this gate, a superseded run
      // would clobber the newer run's UI state.
      if (signal.aborted) return
      await refreshReportAfterEdit(res?.html_report)
    },
    onError: (intent, error) => {
      if (intent.kind === 'method') {
        const errMsg = error instanceof Error ? error.message : String(error)
        generalLogger.error('[ManualLayout] Method persist failed', {
          error: errMsg,
          selectedMethod: intent.method,
        })
        setSelectedMethod(intent.previousMethod)
        if (errMsg.includes('plan does not include')) {
          setMethodPaywallReason('methods')
          setMethodPaywallOpen(true)
        } else {
          toast.error(t('persistFailed'), { description: t('persistFailedDesc') })
        }
      } else {
        generalLogger.error('[ManualLayout] Preparer multiple persist failed', {
          error: error instanceof Error ? error.message : String(error),
          selectedMethod: intent.method,
        })
        toastModalEditPersistError(error, t)
      }
    },
  })
  const isMethodSwitchRendering = persistCoordinator.isPersisting

  // Sync server-confirmed baselines from `result` so the dedup reflects the
  // latest persisted state after hydration/refresh.
  useEffect(() => {
    persistCoordinator.setBaseline({
      method: resultMethodRef.current,
      preparerSignature: serializeManualPreparerPayload(
        buildPersistedPreparerMultiplePayload(result)
      ),
    })
  }, [result, persistCoordinator, resultMethodRef])

  const { warnIfSubmitSynthesisSkipped } = useManualSynthesisSkippedWarnings({
    lastSynthesisBlendSkippedRunKeyRef,
    result,
    synthesisEvaluation,
    translate: t,
    translateMethodSelector: tMethodSelector,
  })

  // Enqueue a method-change persist when the user picks a new method. The
  // coordinator dedups against the last-persisted baseline at execution
  // time, so the first-render guard the legacy effect used (`isFirstMethodRender`)
  // is no longer needed — `initialBaseline.method` covers it.
  useEffect(() => {
    if (!persistedReportLookupId) return
    const { reason, note } = pendingOverrideRef.current
    pendingOverrideRef.current = {}
    persistCoordinator.enqueueMethod({
      method: selectedMethod,
      previousMethod: resultMethodRef.current ?? selectedMethod,
      overrideReason: reason,
      overrideNote: note,
    })
  }, [selectedMethod, persistedReportLookupId, persistCoordinator, resultMethodRef])

  // Enqueue a preparer-multiple persist when the form changes. The extreme-
  // multiple warn gate is a UI policy (we don't persist until the advisor
  // acknowledges); the coordinator's signature dedup handles the rest.
  useEffect(() => {
    if (!showValuationEditModal || !persistedReportLookupId) return
    const mv = result?.multiples_valuation
    const currentPayload = buildPreparerMultiplePayload({
      benchmarkMedian: preparerBenchmarkMedian,
      appliedMedian: preparerAppliedMedian,
      reasonKey: preparerReasonKey,
      note: preparerNote,
      acknowledgedExtreme: preparerAcknowledgedExtreme,
    })
    if (
      currentPayload &&
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: preparerBenchmarkMedian,
          appliedMedian: preparerAppliedMedian,
          reasonKey: preparerReasonKey,
          acknowledgedExtreme: preparerAcknowledgedExtreme,
        },
        mv
      )
    ) {
      return
    }
    persistCoordinator.enqueuePreparer({
      method: selectedMethod,
      payload: currentPayload as Record<string, unknown> | null,
      clear: currentPayload == null,
      signature: serializeManualPreparerPayload(currentPayload),
    })
  }, [
    persistCoordinator,
    persistedReportLookupId,
    preparerAcknowledgedExtreme,
    preparerAppliedMedian,
    preparerBenchmarkMedian,
    preparerNote,
    preparerReasonKey,
    result,
    selectedMethod,
    showValuationEditModal,
  ])

  const {
    handleSelectMethodWithOverride,
    handlePlanLockedMethodAction,
    togglePreSelectedMethodWithPlanGate,
    handlePreSelectMethod,
  } = useManualMethodSelectionActions({
    allowedMethodKeys,
    openStarterPaywall,
    pendingOverrideRef,
    preSelectableMethodsForNav,
    preSelectedMethod,
    setPreSelectedMethod,
    setSelectedMethod,
    togglePreSelectedMethod,
  })

  // Store last submitted data for retry capability
  const lastSubmittedDataRef = useRef<ValuationFormData | null>(null)
  const postValuationListingHandoffPendingRef = useRef(false)
  const [pendingPostValuationAgentPrompt, setPendingPostValuationAgentPrompt] = useState<
    string | null
  >(null)
  const endManualSubmitLoading = useCallback(() => {
    setCalculating(false)
    setIsGenerating(false)
  }, [setCalculating])
  const beginManualSubmitRun = useManualSubmitRunGuard({
    lookupId: resolvedReportId || reportId,
    endLoading: endManualSubmitLoading,
  })
  const { completeManualCalculation } = useManualCalculationCompletion({
    createVersion,
    isAccountantMode,
    lastSubmittedFinancialSnapshotRef,
    postValuationListingHandoffPendingRef,
    sessionName,
    setDraftStatus,
    setIsDirty,
    setLastSaved,
    setPendingPostValuationAgentPrompt,
    setResult,
    translate: t,
    translateHistory: tHistory,
    translateReport: tReport,
    userId: user?.id,
    versionSyncTimeoutRef,
  })
  const { runManualCalculationExecution } = useManualCalculationExecution({
    translate: t,
  })
  const { handleManualSubmitError } = useManualSubmitErrorHandler({
    translate: t,
    translateErrors: tErrors,
    translatePreparer: tPreparer,
  })

  // ─── Manual Form Submit Handler (REAL - wired to Venus services) ───
  const handleManualSubmit = useCallback(
    async (data: ValuationFormData) => {
      // Validation — companyName is universally required (it shows up
      // on every report). The SME-only checks (businessType + a
      // complete historical year) are bypassed for the venture path
      // because the startup engine derives value from milestones,
      // SAFE/cap-table data and forward-looking traction — never from
      // historical accounts. Without this exemption, founders coming
      // out of Studio v2 cannot trigger a calculation at all.
      const effectiveMethod =
        useManualResultsStore.getState().preSelectedMethod ??
        useManualResultsStore.getState().selectedMethod
      const validationIssue = getManualSubmitValidationIssue(data, effectiveMethod)
      if (validationIssue) {
        const toastKeys = MANUAL_SUBMIT_VALIDATION_TOAST_KEYS[validationIssue]
        toast.warning(t(toastKeys.title), { description: t(toastKeys.description) })
        return
      }

      // Prevent double submission
      const wasSet = trySetCalculating()
      if (!wasSet) return

      const submitRun = beginManualSubmitRun()

      // Store for retry capability
      lastSubmittedDataRef.current = data

      setIsGenerating(true)

      // Sync collected data for UI (incl. fteEmployees for restore/0 FTE owner-only)
      setCollectedData({
        companyName: data.companyName,
        businessType: data.businessType,
        industry: data.industry,
        businessModel:
          (typeof data.business_model === 'string' && data.business_model) ||
          (typeof data.businessModel === 'string' && data.businessModel) ||
          useManualFormStore.getState().formData.business_model,
        country: data.country,
        yearFounded: data.yearFounded,
        ownerManagers: data.ownerManagers,
        fteEmployees: data.fteEmployees,
      })

      try {
        // Step 1: Map ManualInputPanel form data → Venus store format
        const venusFormData = mapClarityFormToVenusStore(
          data,
          useManualFormStore.getState().formData
        )
        updateFormData(venusFormData)

        // Step 2: Build API request from store (single source of truth).
        // Trust fields (official_financials, variance explanation) live only in Zustand; using
        // React `formStoreData` here can be one frame stale vs. the synchronous store update.
        const storeSnapshot = useManualFormStore.getState().formData
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildManualCalculationRequest({
          formData: storeSnapshot,
          locale: validLocale as 'nl' | 'en',
          selectedMethod: preSelectedMethod ?? selectedMethod,
          identifiers: calculationRequestIdentifiers,
          synthesisSelection,
        })

        const idForApi = linkedIdentifier
        mergePreparerMultipleIntoRequest(request as unknown as Record<string, unknown>)
        const prep = usePreparerMultipleStore.getState()
        if (shouldBlockExtremePreparerMultiple(prep, result?.multiples_valuation)) {
          submitRun.endLoading()
          toast.error(tPreparer('extremeWarning'))
          return
        }

        // Step 3: Detect version changes for M&A workflow (use resolved UUID for version API)
        const previousVersion = idForApi ? getLatestVersion(idForApi) : null
        if (idForApi && previousVersion) {
          const changes = detectVersionChanges(previousVersion.formData, request)
          generalLogger.info('Regeneration detected', {
            reportId,
            previousVersion: previousVersion.versionNumber,
            totalChanges: changes.totalChanges,
          })
        }

        const calculationResult = await runManualCalculationExecution({
          idForApi,
          request,
          retrySubmit: () => {
            if (lastSubmittedDataRef.current) {
              handleManualSubmit(lastSubmittedDataRef.current)
            }
          },
          submitRun,
        })
        if (calculationResult.aborted || !calculationResult.valuationResult) return

        const calcResult = calculationResult.valuationResult
        warnIfSubmitSynthesisSkipped(calcResult)

        const completionResult = await completeManualCalculation({
          calculationDurationMs: calculationResult.calculationDurationMs,
          idForApi,
          previousVersion,
          request,
          retrySubmit: () => {
            if (lastSubmittedDataRef.current) {
              handleManualSubmit(lastSubmittedDataRef.current)
            }
          },
          storeSnapshot,
          submitRun,
          valuationResult: calcResult,
        })
        if (completionResult.aborted) return
      } catch (error) {
        handleManualSubmitError({
          error,
          retrySubmit: () => {
            if (lastSubmittedDataRef.current) {
              handleManualSubmit(lastSubmittedDataRef.current)
            }
          },
          submitRun,
        })
      }
    },
    [
      beginManualSubmitRun,
      calculationRequestIdentifiers,
      completeManualCalculation,
      currentLocale,
      getLatestVersion,
      handleManualSubmitError,
      linkedIdentifier,
      preSelectedMethod,
      reportId,
      result,
      runManualCalculationExecution,
      selectedMethod,
      synthesisSelection,
      t,
      tPreparer,
      trySetCalculating,
      updateFormData,
      warnIfSubmitSynthesisSkipped,
    ]
  )

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

  // ─── Chat Handlers (bi-directional sync) ───
  const { handleApplyFieldUpdate, handleAcceptUpdate, handleRejectUpdate } =
    useManualChatFieldUpdateActions({
      currentLocale,
      setChatMessages,
      setCollectedData,
      setPendingUpdates,
      translate: t,
      updateFormData,
    })

  const { handleChatMessage } = useManualChatMessageActions({
    addNormalizationItems: normalizationActions.addItems,
    chatMessages,
    collectedData,
    conversationId: conversationStore.conversationId,
    currentLocale,
    fieldContext,
    handleApplyFieldUpdate,
    isAccountantMode,
    isLoadingHistory,
    latestFormDataRef,
    manualChatReportId,
    normalizationItems,
    persistNormalizationsToSession: normalizationActions.persistToSession,
    reportId,
    resolvedReportId,
    setChatMessages,
    setConversationId: conversationStore.setConversationId,
    setIsChatGenerating,
    setPendingUpdates,
    setSuggestedNormalisations,
    setToolInProgress: conversationStore.setToolInProgress,
    streamCleanupRef,
    translate: t,
  })

  useManualAgentPromptHandoff({
    chatDrawerOpen,
    handleChatMessage,
    initialAgentNext,
    isChatGenerating,
    isLoadingHistory,
    lastLoadedReportId: conversationStore.lastLoadedReportId,
    manualChatReportId,
    pendingPostValuationAgentPrompt,
    setChatDrawerOpen,
    setPendingPostValuationAgentPrompt,
  })

  const { handleRetry, handleNewConversation } = useManualChatSessionActions({
    chatDrawerOpen,
    chatMessages,
    clearConversationMessages: conversationStore.clearMessages,
    handleChatMessage,
    isChatGenerating,
    isLoadingHistory,
    lastLoadedReportId: conversationStore.lastLoadedReportId,
    loadHistory: conversationStore.loadHistory,
    manualChatReportId,
    setChatMessages,
    setConversationId: conversationStore.setConversationId,
    setIsChatGenerating,
    setIsLoadingHistory,
    setPendingUpdates,
    setToolInProgress: conversationStore.setToolInProgress,
    streamCleanupRef,
  })

  const openPdfPaywall = useCallback(() => openStarterPaywall('pdf_download'), [openStarterPaywall])
  const { isExporting, downloadHistory, handleExport } = useManualPdfExportController({
    report,
    reportId,
    resolvedReportId,
    canDownloadPdf,
    pdfStale,
    downloadPdf,
    openPdfPaywall,
    defaultFilename: tReport('defaultFilename'),
    pdfSuffix: tReport('pdfSuffix'),
    staleHint: t('downloadPdfStaleHint'),
    exportFailedTitle: t('pdfExportFailed'),
    exportFailedDescription: t('pdfExportFailedDesc'),
    generatingTitle: t('pdfGenerating'),
    downloadedTitle: t('pdfDownloaded'),
  })

  const handlePreview = useCallback(() => {
    trackPreviewOpen()
    setRightPanelView('preview')
  }, [])
  const handleShowHistory = useCallback(() => {
    trackVersionHistoryOpen()
    setRightPanelView('history')
  }, [])
  const handleFullscreen = useCallback(() => setShowFullscreenModal(true), [])
  const handleOpenAssistant = useCallback(() => setChatDrawerOpen((prev) => !prev), [])

  // ─── Session Navigation (New, Select, Recent) ───
  const { rawRecentValuations, setRawRecentValuations, fetchRecentValuations, recentValuations } =
    useManualRecentValuations({
      reportId,
      resolvedReportId,
      sessionReportId: session?.reportId,
      activeSessionKey,
      sessionName: session?.name,
      sessionUpdatedAt: session?.updatedAt,
      sessionCreatedAt: session?.createdAt,
      currentReport: report,
      collectedCompanyName: collectedData.companyName,
      isAccountantFlow,
      clientCompanyName: identity.clientContext?.clientCompanyName,
      unnamedLabel: t('unnamed'),
    })

  const {
    showNewValuationModal,
    isConfirmingNewValuation,
    handleNewValuation,
    handleConfirmNewValuation,
    handleCancelNewValuation,
  } = useManualNewValuationFlow({
    currentLocale,
    reportId,
    collectedCompanyName: collectedData.companyName,
    isAccountantFlow,
    clientCompanyName: identity.clientContext?.clientCompanyName,
    isAccountantMode,
    clientContextId,
  })

  const handleSelectValuation = useCallback(
    (id: string) => {
      router.push(`/${currentLocale}/reports/${id}`)
    },
    [router, currentLocale]
  )

  const { deletingValuationId, handleDeleteValuation } = useManualRecentValuationDeletion({
    reportId,
    resolvedReportId,
    sessionReportId: session?.reportId,
    activeSessionKey,
    rawRecentValuations,
    setRawRecentValuations,
    fetchRecentValuations,
    isAccountantMode,
    clientContextId,
    collectedCompanyName: collectedData.companyName,
    clientCompanyName: identity.clientContext?.clientCompanyName,
    router,
    currentLocale,
    deleteReportFailedTitle: tReport('deleteReportFailed'),
  })

  const {
    mercuryLocale,
    handleBack,
    handleExitClientView,
    handleContinueImportReview,
    handleContinueToListing,
    handleLogout,
    handleAccountSettings,
    handleSwitchWorkspace,
    handleNavigateToDashboard,
    handleNavigateToBilling,
    handleNavigateToHelp,
    handleOpenMercuryClientForInvite,
  } = useManualMercuryNavigationActions({
    clientContextId,
    contextRelationshipId: ctxRelationshipId,
    currentLocale,
    report,
    session,
    resolvedReportId,
    router,
  })

  const { handleFieldHelpRequest } = useManualFieldHelpActions({
    currentLocale,
    handleChatMessage,
    setChatDrawerOpen,
    setFieldContext,
  })

  // ─── Normalization Handlers (unified store) - Clarity parity: open modal, do not replace left panel ───
  const openNormalizationPaywall = useCallback(
    () => openStarterPaywall('normalization'),
    [openStarterPaywall]
  )
  const {
    showUnifiedNormalizationModal,
    guidedNormalizationPrefill,
    openUnifiedNormalizationModal,
    handleUnifiedNormalizationModalOpenChange,
    handleShowNormalisationReview,
  } = useManualNormalizationModalController({
    reportId,
    guidedResolutionUrl,
    planFeatures,
    openNormalizationPaywall,
    setChatDrawerOpen,
  })

  const { handleNormalizationsChange, recalculateWithNormalizations } =
    useManualNormalizationRecalculation({
      calculationRequestIdentifiers,
      collectedData,
      currentLocale,
      financialYears,
      formStoreData,
      latestFormDataRef,
      originalEBITDAByYear,
      preSelectedMethod,
      report,
      reportId,
      resolvedReportId,
      resultMultiplesValuation: result?.multiples_valuation,
      selectedMethod,
      sessionName,
      setDraftStatus,
      setLastSaved,
      setResult,
      synthesisSelection,
      translate: t,
      translatePreparer: tPreparer,
    })

  const { handleAcceptNormalisation, handleRejectNormalisation } =
    useManualNormalizationReviewActions({
      reportId,
      resolvedReportId,
      normalizationActions,
      setSuggestedNormalisations,
      financialYears,
      originalEBITDAByYear,
      recalculateWithNormalizations,
      persistFailedTitle: t('persistFailed'),
      persistFailedDescription: t('persistFailedDesc'),
    })

  const { handleVersionRestore } = useManualVersionRestoreAction({
    normalizationActions,
    reportId,
    resolvedReportId,
    setResult,
    setRightPanelView,
    translate: t,
    updateFormData,
  })

  const { handleCSVImportComplete } = useManualNormalizationImportActions({
    collectedData,
    normalizationActions,
    openUnifiedNormalizationModal,
    reportId,
    resolvedReportId,
    setChatDrawerOpen,
    setChatMessages,
    setSuggestedNormalisations,
    translate: t,
  })

  // ─── Shared Chat Drawer Props ───
  const cyd = formStoreData?.current_year_data as { ebitda?: number } | undefined
  const hy = (formStoreData?.historical_years_data || []) as Array<{ ebitda?: number }>
  const hasEbitda = (cyd && (cyd.ebitda ?? 0) !== 0) || hy.some((h) => (h.ebitda ?? 0) !== 0)
  const pendingNormalizationCount = normalizationItems.filter((n) => n.status === 'pending').length
  const hasImportedNormalizationData =
    hasImportQuality ||
    suggestedNormalisations.length > 0 ||
    normalizationItems.some((n) => n.source !== 'manual' && n.source !== 'ai')
  const assistantLocale: 'en' | 'nl' = currentLocale === 'nl' ? 'nl' : 'en'
  const formatStartupAssistantPrompt = useCallback(
    (prompt: string) => formatManualStartupAssistantPrompt(prompt, assistantLocale),
    [assistantLocale]
  )

  // `effectiveAssistantMethod` and `isStartupAssistantRoute` are hoisted near
  // the top of the component (see `useManualLayoutResets` setup) so the
  // consolidated reset hook can read them. The venture-path assistant data
  // (benchmark fetch, studio issues, filter/map/locale logic) is owned by
  // `useStartupAssistantSurface`.
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

  // ─── Shared ManualInputPanel Props ───
  const manualInputProps = {
    onSubmit: wrappedOnSubmit,
    onCSVImportComplete: handleCSVImportComplete,
    isCalculating: isGenerating || isCalculating,
    onFieldHelpRequest: handleFieldHelpRequest,
    onViewAllNormalizations: handleShowNormalisationReview,
    onFormDataChange: handleFormDataChange,
    formDataRef: latestFormDataRef as React.MutableRefObject<Record<string, unknown> | null>,
    readOnlyKbo,
    autoAdvancePastPrefilledSteps,
    synthesisWeights: userWeights,
    synthesisJustification: userWeightJustification,
    onSynthesisWeightsChange: setUserWeights,
    onSynthesisJustificationChange: setUserWeightJustification,
    synthesisUnlocked,
    synthesisValuationResults,
    onSynthesisPaywall: () => openStarterPaywall('synthesis'),
    initialData: buildManualInputInitialData({
      collectedData,
      formStoreData,
      formActivityCode,
      formNaceCode,
      restoredYearlyFinancials,
    }),
    isAssistantOpen: chatDrawerOpen,
    onOpenAssistant: () => setChatDrawerOpen(true),
    onResolveIssueWithAssistant: handleResolveStartupLauncherIssue,
    startupLauncherIssues,
    startupLauncherScopeId,
  }

  const buildLiveValuationSubmitData = useCallback((): ValuationFormData => {
    return buildManualLiveValuationSubmitData({
      initialData: manualInputProps.initialData,
      liveData: latestFormDataRef.current,
      fallbackYearlyFinancials: getLiveYearlyFinancials(),
    })
  }, [manualInputProps.initialData, getLiveYearlyFinancials])

  // ─── Quality Warning Rail (Pass-7) ───────────────────────────────────────
  // Surface engine-emitted high-severity warnings inside the assistant so
  // advisors fix them BEFORE generating the report. The report ships clean
  // once warnings are resolved or acknowledged. See engine-side Pass-3
  // aggregation that produces `result.data_quality_warnings`.
  const qualityWarnings = useMemo(() => {
    return buildManualQualityWarnings({
      result,
      acknowledgedTypes: acknowledgedQualityWarnings,
      translateCta: (key, fallback) => tCa(key as never, { default: fallback } as never),
    })
  }, [result, acknowledgedQualityWarnings, tCa])

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
    contextRelationshipId: ctxRelationshipId,
    generatePdf,
    handleManualSubmit,
    lastSubmittedDataRef,
    mercuryLocale,
    postValuationListingHandoffPendingRef,
    reportId,
    resolvedReportId,
    resultValuationId: result?.valuation_id,
    session,
    setChatMessages,
  })

  const chatDrawerProps = {
    open: chatDrawerOpen,
    onOpenChange: setChatDrawerOpen,
    messages: chatMessages,
    onSendMessage: handleChatMessage,
    isGenerating: isChatGenerating || isLoadingHistory,
    companyName: collectedData.companyName,
    fieldContext,
    hasReport: !!report,
    hasEbitda,
    pendingNormalizationsCount: pendingNormalizationCount,
    onApplyFieldUpdate: handleApplyFieldUpdate,
    pendingUpdates,
    onAcceptUpdate: handleAcceptUpdate,
    onRejectUpdate: handleRejectUpdate,
    startupIssues,
    onResolveStartupIssue: handleResolveStartupIssue,
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
    toolInProgress: conversationStore.toolInProgress,
    onRetry: handleRetry,
    onNewConversation: handleNewConversation,
  }
  const assistantOpenTasksCount =
    pendingUpdates.length + qualityWarnings.length + startupIssues.length

  // Stable last full year for originalEBITDA fallback (avoids date-boundary inconsistencies)
  const lastFullYear = getCurrentFilingYear()

  // ─── Shared CalculatorNav (mobile + desktop converge on the same nav element) ───
  // Mobile-only prop: `deletingValuationId` (the row-spinner indicator).
  // Desktop-only props: `downloadHistory`, `onRedownload`, `valuationVersions`,
  // `selectedVersionId`, `onSelectVersion`, `onContinueToListing`. Divergent
  // values are gated via `isMobile` so the CalculatorNav component receives
  // `undefined` (omitted) on the wrong viewport.
  const calculatorNavEl = (
    <CalculatorNav
      companyName={displayCompanyName}
      onBack={handleBack}
      onDownload={handleExport}
      onPreview={handlePreview}
      onFullscreen={handleFullscreen}
      onShowHistory={handleShowHistory}
      hasReport={!!report}
      rightPanelView={rightPanelView}
      userName={
        isAccountantMode && accountantDisplayName
          ? accountantDisplayName
          : user?.name || user?.email || t('guest')
      }
      userInitials={getManualUserInitials(
        isAccountantMode && accountantDisplayName ? { name: accountantDisplayName } : user
      )}
      userEmail={user?.email}
      avatarUrl={user?.avatar_url || user?.avatar || user?.profile_picture || user?.picture}
      onOpenAssistant={handleOpenAssistant}
      isAssistantOpen={chatDrawerOpen}
      onOpenNormalization={
        showFullAdvisorMethodNav ? () => openUnifiedNormalizationModal() : undefined
      }
      // Hub badge surfaces PENDING work, not ACCEPTED progress: the button's
      // job is "here's what needs your review." `pendingNormalizationCount`
      // alone restores the notification semantics that were lost when this
      // count was wired to the Assistant badge (which didn't render the
      // count inside the drawer). The accepted count is still derivable
      // inside the Hub panel itself, where progress feedback belongs.
      normalizationCount={pendingNormalizationCount}
      // Badge counts actionables across the unified assistant surface:
      // pending field updates + engine quality warnings + startup studio issues.
      openTasksCount={assistantOpenTasksCount}
      isExporting={isExporting || isMethodSwitchRendering}
      downloadHistory={isMobile ? undefined : downloadHistory}
      onRedownload={
        isMobile
          ? undefined
          : (item: DownloadHistoryItem) => {
              if (!canDownloadPdf) {
                openStarterPaywall('pdf_download')
                return
              }
              if (item.url) {
                window.open(item.url, '_blank')
              } else {
                toast.info(t('pdfRegenerating'), { description: t('pdfRegeneratingDesc') })
              }
            }
      }
      onNavigateToDashboard={handleNavigateToDashboard}
      onNavigateToBilling={handleNavigateToBilling}
      onNavigateToHelp={handleNavigateToHelp}
      valuationSummary={navValuationSummary}
      valuationVersions={isMobile ? undefined : versionHistoryForNav}
      selectedVersionId={isMobile ? undefined : selectedVersionId}
      onSelectVersion={isMobile ? undefined : handleSelectVersion}
      onContinueToListing={isMobile ? undefined : handleContinueToListing}
      recentValuations={recentValuations}
      activeReportId={resolvedReportId || reportId}
      onNewValuation={handleNewValuation}
      isCalculating={isGenerating || isCalculating || effectiveIsRestoringExistingReport}
      onSelectValuation={handleSelectValuation}
      onDeleteValuation={handleDeleteValuation}
      // Mobile-only: shows a spinner on the row currently being deleted.
      deletingValuationId={isMobile ? deletingValuationId : undefined}
      onLogout={handleLogout}
      onAccountSettings={handleAccountSettings}
      onSwitchWorkspace={handleSwitchWorkspace}
      isAccountantMode={isAccountantMode}
      onExitClientView={handleExitClientView}
      showSourceDataToggle={false}
      onOpenValuationEdit={() => setShowValuationEditModal(true)}
      preSelectedMethod={preSelectedMethod ?? undefined}
      preSelectedMethods={preSelectedMethods}
      onPreSelectMethod={handlePreSelectMethod}
      onToggleMethod={togglePreSelectedMethodWithPlanGate}
      firmCountryCode={user?.firm_country_code}
      preSelectableMethodsForNav={preSelectableMethodsForNav}
      planLockedMethodKeys={planLockedMethodKeys}
      onPlanLockedMethodAction={handlePlanLockedMethodAction}
      normalizationFeatureLocked={showFullAdvisorMethodNav ? ebitdaNormalizationLocked : false}
      onNormalizationFeatureLocked={
        showFullAdvisorMethodNav ? () => openStarterPaywall('normalization') : undefined
      }
      versionControlFeatureLocked={showFullAdvisorMethodNav ? versionControlLocked : false}
      onVersionControlFeatureLocked={
        showFullAdvisorMethodNav ? () => openStarterPaywall('version_history') : undefined
      }
      canDownloadPdf={canDownloadPdf}
    />
  )

  // ─── Shared ContextBar (accountant-mode only, identical on both viewports) ───
  const contextBarEl =
    isAccountantMode && (clientContextName || collectedData.companyName) ? (
      <ContextBar
        clientName={clientContextName?.split(' ')[0]}
        businessName={collectedData.companyName}
        draftStatus={draftStatus}
        lastSaved={lastSaved}
        onClientClick={() => {
          if (clientContextId) {
            handleOpenMercuryClientForInvite()
          }
        }}
        onBusinessClick={
          clientContextId
            ? () => {
                handleOpenMercuryClientForInvite()
              }
            : undefined
        }
        clientApprovalStatus="none"
        onResendApproval={() => toast.info(t('reminderSent'))}
        pendingNormalisations={pendingNormalizationCount}
        onShowNormalisationReview={handleShowNormalisationReview}
      />
    ) : null

  // ─── Shared modal stack (rendered once, mounted in both mobile + desktop) ───
  // Lifted out of the mobile/desktop fork bodies as PR2.5 Phase 1. The five
  // modals here had byte-identical props on both sides; the only real diff
  // between forks at this layer is `ValuationEditModal` + the inline plan
  // paywall, which the mobile fork was silently missing. Both are below.
  const modalsEl = (
    <>
      <FullscreenReportModal
        open={showFullscreenModal}
        onOpenChange={setShowFullscreenModal}
        report={report}
        onDownload={handleExport}
        onShare={
          isAccountantMode && clientContextId
            ? () => {
                setShowFullscreenModal(false)
                handleOpenMercuryClientForInvite()
              }
            : undefined
        }
      />

      <RecalculateConfirmationPopup
        isOpen={showRecalculateConfirmation}
        currentVersion={currentVersionNumber}
        onConfirm={handleConfirmRecalculate}
        onCancel={handleCancelRecalculate}
        isCreating={isGenerating || isCalculating}
        hasFormChanges={recalculatePopupFlags.hasFormChanges}
        hasNormalizations={recalculatePopupFlags.hasNormalizations}
      />

      <NewValuationModal
        isOpen={showNewValuationModal}
        onConfirm={handleConfirmNewValuation}
        onCancel={handleCancelNewValuation}
        isConfirming={isConfirmingNewValuation}
      />

      <UnifiedNormalizationModal
        open={showUnifiedNormalizationModal}
        onOpenChange={handleUnifiedNormalizationModalOpenChange}
        companyName={collectedData.companyName || t('company')}
        currentYear={lastFullYear}
        originalEBITDA={getOriginalEbitdaForDisplay()}
        originalEBITDAByYear={originalEBITDAByYear}
        normalizations={normalizationItems}
        onNormalizationsChange={handleNormalizationsChange}
        countryCode={formCountry || 'BE'}
        hasUploadedData={hasImportedNormalizationData}
        onUploadClick={() => undefined}
        financialYears={financialYears}
        initialSearchQuery={guidedNormalizationPrefill?.initialSearchQuery ?? ''}
        initialYearFilter={guidedNormalizationPrefill?.initialYearFilter ?? null}
        fallbackFormDataRef={
          latestFormDataRef as React.MutableRefObject<Record<string, unknown> | null>
        }
      />
    </>
  )

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
      {calculatorNavEl}

      {pdfStaleBannerEl}

      {contextBarEl}

      {isMobile ? (
        <div className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)] min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <StartupAwareInputPanel key={reportId} {...manualInputProps} />
          </div>
        </div>
      ) : (
        /* Desktop body: Resizable left input + right report/preview/history. */
        <div className="flex-1 min-w-0 overflow-hidden m-4 rounded-xl border border-foreground/[0.06]">
          <ResizablePanelGroup className="h-full w-full">
            {/* Left Panel: Always ManualInputPanel (Clarity parity - no view switching) */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <div className="h-full flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <StartupAwareInputPanel key={reportId} {...manualInputProps} />
                </div>
              </div>
            </ResizablePanel>

            {/* Resize Handle */}
            <ResizableHandle
              withHandle
              className="w-px bg-foreground/[0.06] hover:bg-primary/30 data-[state=dragging]:bg-primary/50 transition-colors"
            />

            {/* Right Panel: Report / Preview / History */}
            {/* Design system: bg-background for theme consistency. Report HTML has its own light styling. */}
            <ResizablePanel defaultSize={65} minSize={40}>
              <ManualReportWorkspace
                isCalculating={isCalculating}
                isGenerating={isGenerating}
                isMethodSwitchRendering={isMethodSwitchRendering}
                liveMultipleReportPreview={liveMultipleReportPreview}
                onVersionRestore={handleVersionRestore}
                report={report}
                reportId={reportId}
                rightPanelView={rightPanelView}
                translate={t}
                translateReport={tReport}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <Suspense fallback={null}>
        <ChatAssistantDrawer {...chatDrawerProps} />
      </Suspense>

      {modalsEl}

      <ValuationEditModal
        open={showValuationEditModal}
        onClose={() => {
          if (isMethodSwitchRendering) return
          setShowValuationEditModal(false)
        }}
        valuationResults={getManualHydratedValuationResults(result) ?? {}}
        isHydratingMethods={isHydratingEditModalData}
        methodDataLoadError={reportMethodHydrationError}
        onRetryMethodDataLoad={retryReportMethodHydration}
        onContinueImportReview={
          reportMethodHydrationError === 'report_pending' && (clientContextId || ctxRelationshipId)
            ? handleContinueImportReview
            : undefined
        }
        selectedMethod={selectedMethod}
        onSelectMethod={handleSelectMethodWithOverride}
        fiscalAnchor={result?.fiscal_4x_anchor}
        showFiscalAnchorRow={showFiscalReferenceForOmni === true}
        result={result}
        preparerDisabled={isGenerating || isCalculating || effectiveIsRestoringExistingReport}
        industryLabel={collectedData.industry}
        businessTypeLabel={collectedData.businessType}
        countryCode={collectedData.country}
        showZeroDraftExport={showPreparerMultiplePanel}
        canExportZeroDraft={canDownloadPdf}
        zeroDraftReportId={resolvedReportId || reportId}
        zeroDraftBusinessName={collectedData.companyName ?? report?.companyName}
        zeroDraftCreatedAt={
          report?.generatedAt instanceof Date ? report.generatedAt.toISOString() : undefined
        }
        showPreparerMultiple={showPreparerMultiplePanel}
        isMethodPersisting={isMethodSwitchRendering}
        firmCountryCode={user?.firm_country_code}
        // Only inject "Starter+" plan-locked teaser rows in the OmniCalc
        // panorama for advisor-tier viewers — those teasers exist to upsell
        // the advisor SaaS plan. Business owners get the focused 3-method
        // owner-founder experience without the cross-sell.
        planAllowedMethodKeys={showFullAdvisorMethodNav ? allowedMethodKeys : null}
        onPlanLockedMethodClick={
          showFullAdvisorMethodNav ? () => openStarterPaywall('methods') : undefined
        }
      />

      <ManualStarterPaywallModal
        currentLocale={currentLocale}
        isAdvisorAudience={showFullAdvisorMethodNav}
        onClose={() => setMethodPaywallOpen(false)}
        open={methodPaywallOpen}
        reason={methodPaywallReason}
      />
    </div>
  )
}
