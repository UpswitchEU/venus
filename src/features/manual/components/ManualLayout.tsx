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

import { AnimatePresence, motion } from 'framer-motion'
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
import type { StudioIssue } from '@/features/startup-studio/hooks/useStudioIssues'
import {
  trackAIFieldUpdate,
  trackPreviewOpen,
  trackReturnToMercury,
  trackVersionHistoryOpen,
} from '@/lib/analytics'
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
  HistoryPanel,
  isImportedLedgerNormalizationItem,
  ManualInputPanel,
  type NormalizationItem,
  type ParsedCommand,
  type ParsedValue,
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
import { ReportPlaceholder } from '../../../components/skeletons/ReportPlaceholder'
import { ReportSkeleton } from '../../../components/skeletons/ReportSkeleton'
import {
  filterPreSelectableMethodsForOwnerFounder,
  showAdvisorCalculatorSurface,
} from '../../../constants/accountantPlanMethods'
import { isUpfrontMethodAllowedForNav } from '../../../constants/methodFieldConfig'
import { METHOD_LABEL_KEYS } from '../../../constants/methodLabels'
import { getStarterPlanSummary } from '../../../constants/pricing'
import { AuroraButton } from '../../../design-system/components/Button'
import { springDefault } from '../../../design-system/components/motion'
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
  isAdaptiveMethodKey,
  isVenturePathMethodKey,
  methodKeyAcceptsPreparerMultipleOverride,
  useStartupAssistantSurface,
} from '../../../lib/methods'
import { coalesceFiniteNumber } from '../../../lib/omniPreview'
import {
  evaluateSynthesisBlend,
  shouldWarnSynthesisSkipped,
} from '../../../lib/synthesis/synthesisEngine'
import { reportService, valuationService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import { backendAPI } from '../../../services/backendApi'
import {
  isLegalFormBusinessTypeValue,
  looksLikeNaceCode,
} from '../../../services/naceBusinessTypeService'
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
import { enableTaxLatencyAutoPersist, useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import {
  APIError,
  AuthenticationError,
  CreditError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../../../types/errors'
import type { ValuationResponse, YearDataInput } from '../../../types/valuation'
import { dateLikeToUnixMs } from '../../../utils/date-like'
import { isAuthError } from '../../../utils/errorDetection'
import { getValuationMethodResultForKey } from '../../../utils/extractValuationResultsMap'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import { HTMLProcessor } from '../../../utils/htmlProcessor'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { generalLogger } from '../../../utils/logger'
import { mergeSessionSurfaceForOptionalPrefill } from '../../../utils/mergeOptionalSessionPrefillFields'
import {
  persistNormalizationsBeforeCalculate,
  persistOrDeleteNormalizationsForYears,
} from '../../../utils/normalizationPersist'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import {
  getFirstRenderableReportHtml,
  getRenderableReportHtml,
  getRenderableReportHtmlFromCurrentOrFallback,
} from '../../../utils/safetyNetReportHtml'
import { storeReflectsBridgeMapped } from '../../../utils/storeReflectsBridgeMapped'
import { valuationResultRunKey } from '../../../utils/valuationResultRunKey'
import {
  hasExistingValuationVersion,
  shouldOpenVersionConfirmation,
} from '../../../utils/versionConfirmation'
import { areChangesSignificant, detectVersionChanges } from '../../../utils/versionDiffDetection'
import { getLatestCompleteYearlyFinancial } from '../../../utils/yearlyFinancials'
// Venus infrastructure (auth, session, stores, services)
import {
  type PersistIntent,
  useIsMountedRef,
  useLatestRef,
  useManualLayoutResets,
  useManualMercuryNavigationActions,
  useManualNewValuationFlow,
  useManualNormalizationModalController,
  useManualNormalizationReviewActions,
  useManualPdfExportController,
  useManualRecentValuationDeletion,
  useManualRecentValuations,
  useManualSubmitRunGuard,
  useManualSynthesisController,
  usePdfStalenessLifecycle,
  useRestorationGate,
  useResultToReportBridge,
  useValuationPersistenceCoordinator,
} from '../hooks'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'
import {
  MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT,
  isManualAgentNextRunValuation,
  MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT,
  stripAgentNextFromHref,
} from '../utils/manualAgentNextHandoff'
import {
  buildManualAiNormalizationSuggestions,
  buildManualImportedNormalizationSuggestions,
  MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS,
} from '../utils/manualAiNormalizationSuggestions'
import {
  buildManualChatRetryPlan,
  buildPendingUpdatesFromDetectedValues,
  formatManualParsedCommandResponse,
  type ManualPendingFieldUpdate,
} from '../utils/manualChatCommandHandling'
import {
  buildManualChatFieldUpdateBridge,
  formatManualChatFieldUpdateValue,
} from '../utils/manualChatFieldUpdate'
import {
  buildManualAssistantChatMessage,
  buildManualSystemChatMessage,
  buildManualUserChatMessage,
  patchManualChatMessage,
} from '../utils/manualChatMessages'
import {
  buildManualAIChatRequest,
  getManualChatVersionCount,
} from '../utils/manualChatRequestContext'
import {
  addIdsToManualChatToolCards,
  appendManualChatToolCardsToMessages,
  applyManualChatSellabilityComputedScore,
  markManualChatProposalDecision,
  parseManualChatStreamToolResult,
} from '../utils/manualChatToolCards'
import { buildManualFieldContext, buildManualFieldHelpQuestion } from '../utils/manualFieldHelp'
import { buildSubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'
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
import {
  buildManualListingWizardUrl,
  buildManualMercuryBusinessDashboardUrl,
  buildManualMercuryPricingUrl,
  resolveManualListingRelationshipId,
} from '../utils/manualMercuryNavigation'
import {
  buildAcceptedNormalizationSignature,
  buildManualNormalizationPersistenceYears,
} from '../utils/manualNormalizationPersistence'
import { buildManualNormalizationRecalcSource } from '../utils/manualNormalizationRecalcSource'
import { getManualOriginalEbitdaForDisplay } from '../utils/manualOriginalEbitdaDisplay'
import { shouldBlockExtremePreparerMultiple } from '../utils/manualPreparerMultipleGuard'
import { buildManualQualityWarnings } from '../utils/manualQualityWarnings'
import { saveManualCalculationReportAssets } from '../utils/manualReportAssetSave'
import { buildManualReportAssets } from '../utils/manualReportAssets'
import { hasManualRestorableReport } from '../utils/manualRestorableReport'
import { buildManualRestoredFinancialSnapshot } from '../utils/manualRestoredFinancialSnapshot'
import { runManualSellabilityScore } from '../utils/manualSellabilityScore'
import {
  getManualSessionKey,
  manualSessionMatchesReport,
  resolveManualCanonicalReportId,
  resolveManualPersistedReportLookupId,
  resolveManualReportHydrationLookupId,
  resolveManualReportId,
} from '../utils/manualSessionIdentifiers'
import { formatManualStartupAssistantPrompt } from '../utils/manualStartupAssistantPrompt'
import {
  getManualStartupIssueAnchor,
  getManualStartupLauncherScopeId,
} from '../utils/manualStartupAssistantSurface'
import {
  getManualSubmitValidationIssue,
  MANUAL_SUBMIT_VALIDATION_TOAST_KEYS,
} from '../utils/manualSubmitValidation'
import { buildManualTaxLatencySignature } from '../utils/manualTaxLatencySignature'
import { buildManualCalculationRequest } from '../utils/manualValuationRequest'
import { scheduleManualVersionHistorySync } from '../utils/manualVersionHistorySync'
import { runManualCalculationVersioning } from '../utils/manualVersioningExecutor'
import { buildManualVersionHistoryForNav } from '../utils/manualVersionNav'
import { buildManualVersionRestorePlan } from '../utils/manualVersionRestorePlan'
import { PanelSkeleton, useManualLayoutIsMobile } from './manualLayoutShell'
import type { ManualLayoutProps } from './manualLayoutTypes'
// `selectCapTableSimulatorResult` import removed alongside the React slider
// mount — the canonical Jinja report is now the single source of truth.
// The selector helper itself is intentionally kept on disk for the future.
import { deriveManualReportPresentation } from './manualReportPresentation'

function getHttpStatusFromError(err: unknown): number | undefined {
  if (err instanceof APIError) return err.statusCode
  const ax = err as { response?: { status?: number } }
  return ax?.response?.status
}

/** Retries for getReport hydration: rate limits, gateway/transient HTTP, and network errors */
function isRetryableReportHydrationError(err: unknown): boolean {
  if (err instanceof NetworkError || err instanceof RateLimitError) return true
  const s = getHttpStatusFromError(err)
  return s === 429 || s === 502 || s === 503 || s === 504 || s === 408
}

/** Poll while PDF is stale; extend max window so slow jobs can still complete */
const PDF_STALE_POLL_INTERVAL_MS = 2500
const PDF_STALE_POLL_MAX_MS = 120_000

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
  const reportPanelRef = useRef<HTMLDivElement>(null)
  // PDF-staleness lifecycle (4 refs + 3 useState + 3 effects + retry callback)
  // is owned by `usePdfStalenessLifecycle`, instantiated below once
  // `report` / `usePdfGeneration` outputs are available.

  // Venus infrastructure
  const { user } = useAuth()
  const { allowedMethodKeys, planFeatures, plan } = useCredits()
  const { identity, isAccountantFlow, prefillData } = useBootstrap()
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
    error,
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
      error: s.error,
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
  const reportIdFromSession = useSessionStore((s) => s.session?.reportId)
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
    isGenerating: isPdfGenerating,
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
  const [reportStatus, setReportStatus] = useState<'draft' | 'final'>('draft')
  /** Effective fiscal PDF flag from Titan (matches PDF + branding); gates Omni-Calc 4× EBITDA row */
  const [showFiscalReferenceForOmni, setShowFiscalReferenceForOmni] = useState<boolean | null>(null)
  const [isHydratingEditModalData, setIsHydratingEditModalData] = useState(false)
  /** After retries, distinguish rate-limit / transient failure from truly missing method payloads */
  const [reportMethodHydrationError, setReportMethodHydrationError] = useState<
    'transient' | 'report_pending' | null
  >(null)
  /** Bumps to re-run getReport hydration without changing report id (e.g. modal "Try again") */
  const [reportHydrationRetryNonce, setReportHydrationRetryNonce] = useState(0)

  // ─── Panel View State ───
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(initialTab ?? 'preview')

  useEffect(() => {
    const id = reportHydrationLookupId
    if (!id || id === 'new') {
      setShowFiscalReferenceForOmni(false)
      setIsHydratingEditModalData(false)
      setReportMethodHydrationError(null)
      return
    }
    // Defer merging Titan report into the store until session restoration has applied
    // multi-method selection (1c); otherwise setResult can collapse to a single method
    // before keepSessionMulti applies.
    if (!restorationComplete) {
      return
    }
    const existingResult = useManualResultsStore.getState().result
    const needsMethodHydration = !getManualHydratedValuationResults(existingResult)
    setIsHydratingEditModalData(needsMethodHydration)
    setReportMethodHydrationError(null)
    let cancelled = false
    const backoffMs = [400, 1000, 2200]

    const applySuccess = (r: ValuationResponse) => {
      setShowFiscalReferenceForOmni(!!r.show_fiscal_reference)

      const latestExistingResult = useManualResultsStore.getState().result
      const nextValuationResults =
        getManualHydratedValuationResults(r) ??
        getManualHydratedValuationResults(latestExistingResult)
      const mergedResult: ValuationResponse = {
        ...(latestExistingResult || {}),
        ...r,
        html_report: getRenderableReportHtmlFromCurrentOrFallback(
          [r.html_report],
          [latestExistingResult?.html_report],
          {
            currentRenderFingerprint: r.render_fingerprint,
            fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
          }
        ),
        valuation_results: nextValuationResults ?? undefined,
        fiscal_4x_anchor: r.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
        multiple_adjustment_summary:
          r.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
      }

      // Always sync from Titan so selected_valuation_method / fiscal flags hydrate even when
      // html_report or valuation_results are missing in this response (partial payloads).
      setResult(mergedResult)
      setIsHydratingEditModalData(false)
      setReportMethodHydrationError(null)
    }

    const finishFailure = (lastError: unknown) => {
      if (cancelled) return
      const current = useManualResultsStore.getState().result
      if (!getManualHydratedValuationResults(current)) {
        setShowFiscalReferenceForOmni(false)
      }
      setIsHydratingEditModalData(false)
      const stillMissingMethods = !getManualHydratedValuationResults(current)
      const transient = stillMissingMethods && isRetryableReportHydrationError(lastError)
      const status = getHttpStatusFromError(lastError)
      if (transient) {
        generalLogger.warn('[ManualLayout] Report method hydration failed after retries', {
          reportHydrationLookupId: id,
          status,
          errorName: lastError instanceof Error ? lastError.name : typeof lastError,
        })
        setReportMethodHydrationError('transient')
      } else if (stillMissingMethods && isSessionKey(id) && status === 404) {
        setReportMethodHydrationError('report_pending')
      } else {
        setReportMethodHydrationError(null)
      }
    }

    ;(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (cancelled) return
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt - 1]))
          if (cancelled) return
        }
        try {
          const r = await backendAPI.getReport(id)
          if (cancelled) return
          applySuccess(r)
          return
        } catch (e) {
          if (attempt < 3 && isRetryableReportHydrationError(e)) {
            continue
          }
          finishFailure(e)
          return
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reportHydrationLookupId, reportHydrationRetryNonce, restorationComplete, setResult])

  // Defense-in-depth: Titan already sends show_fiscal_reference=false for NL
  // accountant firms. This client-side guard prevents stale or race-condition
  // state from showing fiscal UI to Dutch firms.
  // Policy owner: fiscal-reference-resolution.ts + isDutchAccountantReportContext.
  useEffect(() => {
    const firm = user?.firm_country_code?.trim().toUpperCase().substring(0, 2)
    if (firm === 'NL') {
      setShowFiscalReferenceForOmni(false)
    }
  }, [user?.firm_country_code])

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
  const agentNextConsumedRef = useRef(false)
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

  // Load conversation history from server and sync to local chat state.
  // When reportId changes (e.g. accountant switches clients), reload for the new report.
  useEffect(() => {
    const needsLoad =
      manualChatReportId &&
      chatDrawerOpen &&
      !isLoadingHistory &&
      conversationStore.lastLoadedReportId !== manualChatReportId
    if (needsLoad) {
      setIsLoadingHistory(true)
      conversationStore
        .loadHistory(manualChatReportId)
        .then(() => {
          const storeMessages = useConversationStore.getState().messages
          setChatMessages(
            storeMessages.map((m) => ({
              id: m.id,
              role: (m.role || (m.type === 'ai' ? 'assistant' : m.type)) as
                | 'user'
                | 'assistant'
                | 'system',
              content: m.content,
              timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
            }))
          )
        })
        .finally(() => setIsLoadingHistory(false))
    }
  }, [manualChatReportId, chatDrawerOpen, conversationStore.lastLoadedReportId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      streamCleanupRef.current?.()
    }
  }, [])

  const versionSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (versionSyncTimeoutRef.current) clearTimeout(versionSyncTimeoutRef.current)
    }
  }, [])

  // Safety timeout: reset isChatGenerating if it's been stuck for 2 minutes
  const generatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isChatGenerating) {
      generatingTimeoutRef.current = setTimeout(() => {
        setIsChatGenerating(false)
        conversationStore.setToolInProgress(null)
      }, 120_000)
    } else if (generatingTimeoutRef.current) {
      clearTimeout(generatingTimeoutRef.current)
      generatingTimeoutRef.current = null
    }
    return () => {
      if (generatingTimeoutRef.current) clearTimeout(generatingTimeoutRef.current)
    }
  }, [isChatGenerating]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [
    formStoreData?.current_year_data?.ebitda,
    formStoreData?.ebitda,
    originalEBITDAByYear,
    report,
    result,
  ])

  // ─── Modal State ───
  const [showFullscreenModal, setShowFullscreenModal] = useState(false)
  const [showValuationEditModal, setShowValuationEditModal] = useState(false)
  const [methodPaywallOpen, setMethodPaywallOpen] = useState(false)
  const [methodPaywallReason, setMethodPaywallReason] = useState<
    'methods' | 'normalization' | 'version_history' | 'synthesis' | 'pdf_download'
  >('methods')
  const openStarterPaywall = useCallback(
    (reason: 'methods' | 'normalization' | 'version_history' | 'synthesis' | 'pdf_download') => {
      setMethodPaywallReason(reason)
      setMethodPaywallOpen(true)
    },
    []
  )

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
  const lastSubmittedFinancialSnapshotRef = useRef<{
    revenue?: number
    ebitda?: number
    yearlyFinancials?: Array<{
      year: string
      revenue: number
      ebitda: number
      capex?: number
      nwc_change?: number
      isForecast?: boolean
    }>
  } | null>(null)

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

  const handleFormDataChange = useCallback(
    (data: Record<string, unknown>) => {
      latestFormDataRef.current = {
        ...latestFormDataRef.current,
        ...(data as Partial<CollectedData>),
      }
      // Keep form store in sync for session autosave (demo resilience, automation-ready)
      const mapped = mapClarityFormToVenusStore(
        latestFormDataRef.current,
        useManualFormStore.getState().formData
      )
      const currentForm = useManualFormStore.getState().formData
      if (!storeReflectsBridgeMapped(mapped, currentForm)) {
        updateFormData(mapped)
      }
      // Mark dirty when report exists and user changed financial inputs
      if (!result) return
      const yf = (data.yearlyFinancials || []) as Array<{
        year: string
        revenue: number
        ebitda: number
        capex?: number
        nwc_change?: number
        isForecast?: boolean
      }>
      const current = getLatestCompleteYearlyFinancial(yf)
      const revenue = current?.revenue ?? (data.revenue as number)
      const ebitda = current?.ebitda ?? (data.ebitda as number)
      const snapshot = lastSubmittedFinancialSnapshotRef.current
      // No baseline yet (e.g. right after first calculation) — don't assume dirty.
      // The useEffect will set the snapshot; we'll detect real edits on subsequent changes.
      if (!snapshot) return
      const revNum = revenue != null ? Number(revenue) : undefined
      const ebitdaNum = ebitda != null ? Number(ebitda) : undefined
      const snapRev = snapshot.revenue != null ? Number(snapshot.revenue) : undefined
      const snapEbitda = snapshot.ebitda != null ? Number(snapshot.ebitda) : undefined
      const revMatch = revNum === undefined || snapRev === undefined || revNum === snapRev
      const ebitdaMatch =
        ebitdaNum === undefined || snapEbitda === undefined || ebitdaNum === snapEbitda
      const sortYf = (
        arr: Array<{
          year: string
          revenue: number
          ebitda: number
          capex?: number
          nwc_change?: number
          isForecast?: boolean
        }>
      ) => [...arr].sort((a, b) => parseInt(b.year) - parseInt(a.year))
      const norm = (y: {
        year: string
        revenue: number
        ebitda: number
        capex?: number
        nwc_change?: number
        isForecast?: boolean
      }) => ({
        y: y.year,
        r: Number(y.revenue),
        e: Number(y.ebitda),
        c: y.capex != null ? Number(y.capex) : null,
        n: y.nwc_change != null ? Number(y.nwc_change) : null,
        f: Boolean(y.isForecast),
      })
      const yfNormalized = sortYf(yf).map(norm)
      const snapNormalized = sortYf(snapshot.yearlyFinancials || []).map(norm)
      const yfMatch = !yf?.length || JSON.stringify(yfNormalized) === JSON.stringify(snapNormalized)
      if (revMatch && ebitdaMatch && yfMatch) {
        setIsDirty(false)
      } else if (!revMatch || !ebitdaMatch || !yfMatch) {
        setIsDirty(true)
      }
    },
    [result, updateFormData]
  )

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
  ])

  // Sync form store changes into collectedData
  useEffect(() => {
    setCollectedData((prev) => {
      const next = { ...prev }
      if (companyName && companyName !== prev.companyName) next.companyName = companyName
      if ((formBusinessTypeId ?? '') !== prev.businessType)
        next.businessType = formBusinessTypeId ?? ''
      if (formIndustry && formIndustry !== prev.industry) next.industry = formIndustry
      const bm = formBusinessModel || 'services'
      if (bm !== (prev.businessModel || '')) next.businessModel = bm
      if (formCountry && formCountry !== prev.country) next.country = formCountry
      const yearStr = formYearFounded ? String(formYearFounded) : ''
      if (yearStr && yearStr !== prev.yearFounded) next.yearFounded = yearStr
      if (formKboNumber && formKboNumber !== prev.kboNumber) next.kboNumber = formKboNumber
      if (formLegalForm && formLegalForm !== prev.legalForm) next.legalForm = formLegalForm
      const derivedBusinessStructure = mapLegalFormToBusinessStructure(formLegalForm || '')
      next.businessStructure = derivedBusinessStructure || prev.businessStructure || undefined
      if (formAddress && formAddress !== prev.address) next.address = formAddress
      const displayNace = formActivityCode || formNaceCode
      if (displayNace && displayNace !== prev.naceCode) next.naceCode = displayNace
      if (formNaceDescription && formNaceDescription !== prev.naceDescription)
        next.naceDescription = formNaceDescription
      return next
    })
  }, [
    companyName,
    formBusinessTypeId,
    formIndustry,
    formBusinessModel,
    formCountry,
    formYearFounded,
    formKboNumber,
    formLegalForm,
    formAddress,
    formNaceCode,
    formActivityCode,
    formNaceDescription,
  ])

  // Hydrate collectedData and form store from session when form store is empty or missing NACE/business_type
  // Ensures initialData is populated on first render so ManualInputPanel can set selectedCompany from prefill
  // Relaxed: also run when session has nace_code or business_type_id but form does not (even if form has company_name)
  // Identity + collectedData only — method gap-fill is `useSessionOptionalMethodPrefill` after restore.
  useEffect(() => {
    if (!restorationComplete) return
    const merged = mergeSessionSurfaceForOptionalPrefill(session?.sessionData) as Record<
      string,
      unknown
    >
    const hasSessionPrefill =
      (merged.company_name as string)?.trim() ||
      (merged.companyName as string)?.trim() ||
      merged.kbo_number ||
      merged.kboNumber ||
      (merged.legal_form as string)?.trim() ||
      (merged.legalForm as string)?.trim()
    const formStoreEmpty =
      !formCompanyName?.trim() && !formKboNumber?.trim() && !formLegalForm?.trim()
    const sessionHasNace = !!(
      merged.nace_code ||
      merged.naceCode ||
      merged.canonical_nace_code ||
      merged.activity_code
    )
    const sessionHasBusinessType = !!(
      merged.business_type_id ||
      merged.businessTypeId ||
      merged.business_type
    )
    const formMissingNace = sessionHasNace && !formNaceCode?.trim()
    const formMissingBusinessType = sessionHasBusinessType && !formBusinessTypeId?.trim()
    const shouldHydrate =
      hasSessionPrefill && (formStoreEmpty || formMissingNace || formMissingBusinessType)
    if (!shouldHydrate) return

    const sessionCompany =
      (merged.company_name as string)?.trim() || (merged.companyName as string)?.trim()
    const sessionKbo = (merged.kbo_number || merged.kboNumber) as string
    const sessionLegal = (merged.legal_form || merged.legalForm) as string
    const sessionAddress = [merged.postal_code || merged.postalCode, merged.city]
      .filter(Boolean)
      .join(' ')
    const sessionCanonical = (
      (merged.canonical_nace_code || merged.nace_code || merged.naceCode) as string
    )?.trim()
    const sessionActivity = (merged.activity_code || merged.activityCode) as string | undefined
    const sessionNace = (sessionActivity?.trim() || sessionCanonical || '') as string
    const sessionNaceDesc = (merged.activity_label ||
      merged.nace_description ||
      merged.naceDescription) as string
    const sessionCountry = (merged.country_code || merged.countryCode || merged.country) as string
    const sessionYear = merged.founding_year ?? merged.founded_year
    const sessionBusinessType = (merged.business_type_id ||
      merged.businessTypeId ||
      merged.business_type) as string
    const sessionIndustry = merged.industry as string
    // Skip NACE-shaped values: session may have "56.101" in business_type_id; let bootstrap/NACE lookup handle it
    const shouldUseSessionBusinessType =
      sessionBusinessType &&
      !looksLikeNaceCode(sessionBusinessType) &&
      !isLegalFormBusinessTypeValue(sessionBusinessType)

    // Sync to form store: only fill missing fields to avoid overwriting user input or bootstrap data
    const formUpdates: Record<string, unknown> = {}
    if (sessionCompany && !formCompanyName?.trim()) formUpdates.company_name = sessionCompany
    if (sessionKbo && !formKboNumber?.trim()) formUpdates.kbo_number = sessionKbo
    if (sessionLegal && !formLegalForm?.trim()) formUpdates.legal_form = sessionLegal
    const sessionPostalCode = (merged.postal_code || merged.postalCode) as string
    const sessionCity = merged.city as string
    if (sessionPostalCode && !formPostalCode?.trim()) formUpdates.postal_code = sessionPostalCode
    if (sessionCity && !formCity?.trim()) formUpdates.city = sessionCity
    if (sessionCanonical && !formNaceCode?.trim()) formUpdates.nace_code = sessionCanonical
    if (
      sessionActivity?.trim() &&
      sessionCanonical &&
      sessionActivity.trim() !== sessionCanonical &&
      !formActivityCode?.trim()
    ) {
      formUpdates.activity_code = sessionActivity.trim()
    }
    if (sessionNaceDesc && !formNaceDescription?.trim())
      formUpdates.nace_description = sessionNaceDesc
    if (sessionCountry && !formCountry?.trim()) formUpdates.country_code = sessionCountry
    if (sessionYear != null && formYearFounded == null)
      formUpdates.founding_year = Number(sessionYear)
    if (shouldUseSessionBusinessType && !formBusinessTypeId?.trim())
      formUpdates.business_type_id = sessionBusinessType
    if (sessionIndustry && !formIndustry?.trim()) formUpdates.industry = sessionIndustry
    if (Object.keys(formUpdates).length > 0) {
      updateFormData(formUpdates)
    }

    setCollectedData((prev) => {
      const next = { ...prev }
      if (sessionCompany && !prev.companyName) next.companyName = sessionCompany
      if (sessionKbo && !prev.kboNumber) next.kboNumber = sessionKbo
      if (sessionLegal && !prev.legalForm) {
        next.legalForm = sessionLegal
        const mapped = mapLegalFormToBusinessStructure(sessionLegal)
        if (mapped && !prev.businessStructure) next.businessStructure = mapped
      }
      if (sessionAddress && !prev.address) next.address = sessionAddress
      if (sessionNace && !prev.naceCode) next.naceCode = sessionNace
      if (sessionNaceDesc && !prev.naceDescription) next.naceDescription = sessionNaceDesc
      if (sessionCountry && !prev.country) next.country = sessionCountry
      if (sessionYear != null && !prev.yearFounded) next.yearFounded = String(sessionYear)
      if (shouldUseSessionBusinessType && !prev.businessType)
        next.businessType = sessionBusinessType
      if (sessionIndustry && !prev.industry) next.industry = sessionIndustry
      return next
    })
  }, [
    restorationComplete,
    session?.sessionData,
    formCompanyName,
    formKboNumber,
    formLegalForm,
    formNaceCode,
    formActivityCode,
    formBusinessTypeId,
    formPostalCode,
    formCity,
    formYearFounded,
    formIndustry,
    formNaceDescription,
    updateFormData,
  ])

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
  const refreshReportAfterEdit = useCallback(
    async (htmlFromPatch?: string) => {
      if (!persistedReportLookupId) return false
      try {
        const fresh = await backendAPI.getReport(persistedReportLookupId)
        const latestExistingResult = useManualResultsStore.getState().result
        const nextValuationResults =
          getManualHydratedValuationResults(fresh) ??
          getManualHydratedValuationResults(latestExistingResult)
        const mergedResult: ValuationResponse = {
          ...(latestExistingResult || {}),
          ...fresh,
          html_report: getRenderableReportHtmlFromCurrentOrFallback(
            [htmlFromPatch, fresh.html_report],
            [latestExistingResult?.html_report],
            {
              currentRenderFingerprint: fresh.render_fingerprint,
              fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
            }
          ),
          valuation_results: nextValuationResults ?? undefined,
          fiscal_4x_anchor:
            fresh.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
          multiple_adjustment_summary:
            fresh.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
        }
        setResult(mergedResult)
        const htmlForPreview = getFirstRenderableReportHtml(htmlFromPatch, fresh.html_report)
        setReport((prev) => {
          if (!prev) return prev
          const nextHtmlReport = getRenderableReportHtmlFromCurrentOrFallback(
            [htmlFromPatch, fresh.html_report],
            [prev.htmlReport],
            {
              currentRenderFingerprint: fresh.render_fingerprint,
              fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
            }
          )
          const pdfMeta: Pick<
            ValuationReportData,
            'reportUpdatedAt' | 'pdfGeneratedAt' | 'pdfUrl'
          > = {
            reportUpdatedAt: fresh.updated_at
              ? new Date(String(fresh.updated_at))
              : prev.reportUpdatedAt,
            pdfGeneratedAt:
              fresh.pdf_generated_at != null && String(fresh.pdf_generated_at) !== ''
                ? new Date(String(fresh.pdf_generated_at))
                : null,
            pdfUrl: canDownloadPdf && typeof fresh.pdf_url === 'string' ? fresh.pdf_url : undefined,
          }
          return { ...prev, htmlReport: nextHtmlReport, ...pdfMeta }
        })
        if (htmlForPreview && canDownloadPdf) {
          generatePdf?.().catch((err) => {
            if (err instanceof APIError && err.statusCode === 402) return
            generalLogger.warn('[ManualLayout] PDF re-generation after valuation edit failed', {
              error: err instanceof Error ? err.message : String(err),
            })
          })
        }
        return true
      } catch (refreshErr) {
        generalLogger.warn('[ManualLayout] getReport after valuation edit failed', {
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        })
        const renderableHtmlFromPatch = getRenderableReportHtml(htmlFromPatch)
        if (renderableHtmlFromPatch) {
          setReport((prev) => (prev ? { ...prev, htmlReport: renderableHtmlFromPatch } : prev))
          const latestResult = useManualResultsStore.getState().result
          setResult(
            latestResult ? { ...latestResult, html_report: renderableHtmlFromPatch } : latestResult
          )
          if (canDownloadPdf) {
            generatePdf?.().catch((err) => {
              if (err instanceof APIError && err.statusCode === 402) return
              generalLogger.warn('[ManualLayout] PDF re-generation after valuation edit failed', {
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }
        }
        return false
      }
    },
    [generatePdf, persistedReportLookupId, setResult, canDownloadPdf]
  )

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
                onClick={() => window.open(report.pdfUrl!, '_blank', 'noopener,noreferrer')}
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

  // Sync the preparer baseline from server-confirmed `result` so the dedup
  // reflects the latest persisted state (replaces the legacy
  // `lastPersistedPreparerRef = serializeManualPreparerPayload(...)` effect).
  useEffect(() => {
    persistCoordinator.setBaseline({
      preparerSignature: serializeManualPreparerPayload(
        buildPersistedPreparerMultiplePayload(result)
      ),
    })
  }, [result, persistCoordinator])

  // Pass-9 note: when a materially new result arrives, the consolidated
  // `useManualLayoutResets` hook (above) clears stale acknowledgements. The
  // assistant drawer is intentionally NOT auto-opened — owners want to see
  // the report first. The unread count surfaces on the closed assistant
  // trigger so high-severity warnings stay discoverable.

  useEffect(() => {
    if (!result) return
    if (!shouldWarnSynthesisSkipped(synthesisEvaluation)) return

    const runKey = valuationResultRunKey(result)
    if (runKey === lastSynthesisBlendSkippedRunKeyRef.current) return
    lastSynthesisBlendSkippedRunKeyRef.current = runKey

    toast.warning(t('synthesisBlendSkippedTitle'), {
      description: t('synthesisBlendSkippedDesc'),
    })
  }, [result, synthesisEvaluation, t])

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

  const handleSelectMethodWithOverride = useCallback(
    (method: string, overrideReason?: string, overrideNote?: string) => {
      pendingOverrideRef.current = { reason: overrideReason, note: overrideNote }
      setSelectedMethod(method)
    },
    []
  )

  const handlePlanLockedMethodAction = useCallback(() => {
    openStarterPaywall('methods')
  }, [openStarterPaywall])

  const togglePreSelectedMethodWithPlanGate = useCallback(
    (method: string) => {
      if (allowedMethodKeys !== null && !allowedMethodKeys.includes(method)) {
        openStarterPaywall('methods')
        return
      }
      togglePreSelectedMethod(method)
    },
    [allowedMethodKeys, togglePreSelectedMethod, openStarterPaywall]
  )

  const handlePreSelectMethod = useCallback(
    (method: string) => {
      if (!isUpfrontMethodAllowedForNav(method, preSelectableMethodsForNav)) return
      if (allowedMethodKeys !== null && !allowedMethodKeys.includes(method)) {
        openStarterPaywall('methods')
        return
      }
      setPreSelectedMethod(isAdaptiveMethodKey(method) ? null : method)
    },
    [setPreSelectedMethod, preSelectableMethodsForNav, allowedMethodKeys, openStarterPaywall]
  )

  // Sync persisted pre-selection when allowed list changes (firm, turnover, hydration).
  useEffect(() => {
    if (
      preSelectedMethod &&
      !isUpfrontMethodAllowedForNav(preSelectedMethod, preSelectableMethodsForNav)
    ) {
      setPreSelectedMethod(null)
    }
  }, [preSelectableMethodsForNav, preSelectedMethod, setPreSelectedMethod])

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

  // ─── Recalculation Confirmation Modal (intercept CTA when changes detected) ───
  const [showRecalculateConfirmation, setShowRecalculateConfirmation] = useState(false)
  const pendingSubmitDataRef = useRef<ValuationFormData | null>(null)
  const pendingPopupFlagsRef = useRef<{ hasFormChanges: boolean; hasNormalizations: boolean }>({
    hasFormChanges: false,
    hasNormalizations: false,
  })
  const recalculateConfirmationOpenRef = useRef(false)
  const submitInProgressRef = useRef(false)

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

        // Step 3.5: Persist all normalizations to Titan BEFORE calculation (UX-critical)
        if (idForApi) {
          const persistOk = await persistNormalizationsBeforeCalculate(idForApi, request)
          if (!submitRun.isStillTarget()) {
            submitRun.endLoading()
            generalLogger.info('[ManualLayout] Dropping stale manual calculation before submit', {
              ...submitRun.staleContext(),
            })
            return
          }
          if (!persistOk) {
            submitRun.endLoading()
            generalLogger.warn('[ManualLayout] Pre-calculate normalization persist failed')
            toast.error(t('persistFailed'), {
              description: t('persistFailedDesc'),
              action: {
                label: t('retry'),
                onClick: () => {
                  if (lastSubmittedDataRef.current) {
                    handleManualSubmit(lastSubmittedDataRef.current)
                  }
                },
              },
            })
            return
          }
        }

        // Step 4: Call real ValuationService
        const calcStartTime = Date.now()
        generalLogger.info('[ManualLayout] Calling valuationService.calculateValuation', {
          companyName: request.company_name,
          industry: request.industry,
        })
        const calcResult = await valuationService.calculateValuation(request)
        const calculationDuration = Date.now() - calcStartTime
        if (!submitRun.isStillTarget()) {
          submitRun.endLoading()
          generalLogger.info('[ManualLayout] Dropping stale manual calculation result', {
            ...submitRun.staleContext(),
          })
          return
        }

        if (!calcResult) {
          submitRun.endLoading()
          toast.error(t('calculationFailed'), {
            description: t('calculationFailedNoResult'),
            action: {
              label: t('retry'),
              onClick: () => {
                if (lastSubmittedDataRef.current) {
                  handleManualSubmit(lastSubmittedDataRef.current)
                }
              },
            },
          })
          return
        }

        const storeForBlend = useManualResultsStore.getState()
        const submitBlend = evaluateSynthesisBlend({
          result: calcResult,
          preSelectedMethods: storeForBlend.preSelectedMethods,
          userWeights: storeForBlend.userWeights,
        })
        const blendRunKey = valuationResultRunKey(calcResult)
        if (
          submitBlend.client.kind === 'blocked' &&
          submitBlend.serverBlended == null &&
          blendRunKey &&
          lastSynthesisBlendSkippedRunKeyRef.current !== blendRunKey
        ) {
          lastSynthesisBlendSkippedRunKeyRef.current = blendRunKey
          const blockerKey = submitBlend.client.blockerMethod
          const labelTail = METHOD_LABEL_KEYS[blockerKey]?.replace(
            'manualInput.methodSelector.',
            ''
          )
          const methodLabel = labelTail
            ? tMethodSelector(labelTail as 'dcf')
            : blockerKey.replace(/_/g, ' ')
          toast.warning(t('synthesisBlendSkippedTitle'), {
            description: t('synthesisBlendSkippedDesc', {
              method: methodLabel,
              reason: submitBlend.client.blockerReason ?? t('synthesisBlendSkippedReasonFallback'),
            }),
          })
        }

        // Step 5: Store result (triggers useEffect bridge → report state)
        setResult(calcResult)
        submitRun.endLoading()
        setDraftStatus('saved')
        setLastSaved(new Date())
        setIsDirty(false)
        lastSubmittedFinancialSnapshotRef.current = buildSubmittedFinancialSnapshot(request)

        // Step 6: Save the authoritative report package first.
        const saveResult = await saveManualCalculationReportAssets({
          reportId: idForApi,
          sessionData: storeSnapshot as unknown as Record<string, unknown>,
          request: request as unknown as Record<string, unknown>,
          taxLatencyItems: useTaxLatencyStore.getState().items,
          valuationResult: calcResult,
          name: sessionName,
          dirtyVersion: useSessionStore.getState().dirtyVersion,
          isStillTarget: submitRun.isStillTarget,
          deps: {
            saveReportAssets: (id, assets) => reportService.saveReportAssets(id, assets),
            markSaved: (dirtyVersion) => useSessionStore.getState().markSaved(dirtyVersion),
          },
        })

        if (saveResult.aborted) return

        if (saveResult.saveError) {
          const errMsg =
            saveResult.saveError instanceof Error
              ? saveResult.saveError.message
              : String(saveResult.saveError)
          generalLogger.error('[ManualLayout] Failed to save report assets', {
            reportId: idForApi,
            error: errMsg,
          })
          toast.error(tReport('saveReportFailed'), {
            description: errMsg,
          })
        }

        // Step 7: Create version (M&A workflow) after the durable save succeeds.
        // Titan creates V1 automatically during the calculate call.
        // Venus only creates a NEW version when there was already a previous version
        // BEFORE this calculation started AND the user made significant changes.
        let versionCreationFailed = false
        if (idForApi && saveResult.durableSaveSucceeded) {
          const versioningResult = await runManualCalculationVersioning({
            reportId: idForApi,
            previousVersion,
            request,
            valuationResult: calcResult,
            calculationDurationMs: calculationDuration,
            userId: user?.id,
            isStillTarget: submitRun.isStillTarget,
            deps: {
              fetchVersions: (id) => useVersionHistoryStore.getState().fetchVersions(id),
              getLatestVersion: (id) => useVersionHistoryStore.getState().getLatestVersion(id),
              createVersion,
              snapshotNormalizationsToVersion,
              logRegeneration: (...args) => valuationAuditService.logRegeneration(...args),
            },
          })

          if (versioningResult.aborted) return

          if (versioningResult.fetchError) {
            const fetchMsg =
              versioningResult.fetchError instanceof Error
                ? versioningResult.fetchError.message
                : String(versioningResult.fetchError)
            generalLogger.warn('[ManualLayout] fetchVersions failed', {
              reportId: idForApi,
              error: fetchMsg,
            })
            toast.warning(tHistory('loadError'), { description: fetchMsg })
          }

          if (versioningResult.versionError) {
            versionCreationFailed = true
            const errMsg =
              versioningResult.versionError instanceof Error
                ? versioningResult.versionError.message
                : String(versioningResult.versionError)
            generalLogger.error('Failed to create version', { reportId: idForApi, error: errMsg })
            toast.error(t('versionCreateFailed'), {
              description: errMsg,
              action: {
                label: t('retry'),
                onClick: () => {
                  if (lastSubmittedDataRef.current) {
                    handleManualSubmit(lastSubmittedDataRef.current)
                  }
                },
              },
            })
          }
          versionCreationFailed = versioningResult.versionCreationFailed

          // Re-sync version history from backend after calculation so panels show latest
          scheduleManualVersionHistorySync({
            timeoutRef: versionSyncTimeoutRef,
            reportId: idForApi,
            fetchVersions: (id) => useVersionHistoryStore.getState().fetchVersions(id),
            isStillTarget: submitRun.isStillTarget,
            onError: (err) => {
              generalLogger.warn('[ManualLayout] Version history sync failed', {
                error: err instanceof Error ? err.message : String(err),
              })
              toast.warning(tHistory('loadError'), {
                description: err instanceof Error ? err.message : undefined,
              })
            },
          })
        } else if (idForApi) {
          generalLogger.warn('[ManualLayout] Skipping version sync until report save succeeds', {
            reportId: idForApi,
          })
        }

        if (!versionCreationFailed) {
          if (!submitRun.isStillTarget()) return
          toast.success(t('calculationComplete'))
          if (postValuationListingHandoffPendingRef.current) {
            postValuationListingHandoffPendingRef.current = false
            if (isAccountantMode) {
              setPendingPostValuationAgentPrompt(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT)
            }
          }
        }
      } catch (error) {
        if (!submitRun.isStillTarget()) {
          submitRun.endLoading()
          generalLogger.info('[ManualLayout] Dropping stale manual calculation error', {
            ...submitRun.staleContext(),
          })
          return
        }
        submitRun.endLoading()
        if (error instanceof ValidationError && error.context?.code === 'EXTREME_MULTIPLE') {
          toast.error(tPreparer('extremeServerToast'), {
            description: error.message,
          })
          generalLogger.warn('[ManualLayout] EXTREME_MULTIPLE rejected by Titan', {
            message: error.message,
          })
          return
        }
        if (error instanceof CreditError) {
          toast.error(tErrors('calculation.insufficientCredits'), {
            description: error.message,
          })
          generalLogger.warn('[ManualLayout] Insufficient credits for calculation', {
            message: error.message,
          })
          return
        }
        if (error instanceof RateLimitError) {
          toast.error(tErrors('rateLimit.title'), {
            description: error.message || tErrors('rateLimit.description'),
          })
          generalLogger.warn('[ManualLayout] Rate limited during calculation', {
            message: error.message,
          })
          return
        }
        const isSessionExpired = error instanceof AuthenticationError || isAuthError(error)
        const title = isSessionExpired ? tErrors('session.expired') : t('calculationFailed')
        const description = isSessionExpired
          ? tErrors('authentication.expired')
          : error instanceof Error
            ? error.message
            : t('unknownError')
        toast.error(title, {
          description,
          action: isSessionExpired
            ? { label: tErrors('session.reloadPage'), onClick: () => window.location.reload() }
            : {
                label: t('retry'),
                onClick: () => {
                  if (lastSubmittedDataRef.current) {
                    handleManualSubmit(lastSubmittedDataRef.current)
                  }
                },
              },
        })
        generalLogger.error('[ManualLayout] Form submission failed', {
          error: description,
          isSessionExpired,
        })
      }
    },
    [
      reportId,
      resolvedReportId,
      formStoreData,
      updateFormData,
      trySetCalculating,
      setCalculating,
      setResult,
      getLatestVersion,
      createVersion,
      sessionName,
      user?.id,
      t,
      tErrors,
      tPreparer,
      tMethodSelector,
      result,
      preSelectedMethod,
      selectedMethod,
      synthesisSelection,
      beginManualSubmitRun,
      isAccountantMode,
    ]
  )

  // ─── Wrapped Submit: Intercept to show RecalculateConfirmationPopup when changes detected ───
  const hasAnyNormalization = normalizationItems.some((n) => n.status === 'accepted')
  const currentVersion = resolvedReportId ? getLatestVersion(resolvedReportId) : null
  const currentVersionNumber = currentVersion?.versionNumber ?? 0
  const hasExistingValuation = hasExistingValuationVersion(currentVersion)

  const wrappedOnSubmit = useCallback(
    async (data: ValuationFormData) => {
      if (recalculateConfirmationOpenRef.current || submitInProgressRef.current) {
        return
      }
      submitInProgressRef.current = true
      try {
        if (!reportId) {
          await handleManualSubmit(data)
          return
        }
        // Dirty-state interceptor: only show "Create V2" when we already have a valuation.
        // For first-ever calculation, we're creating V1 — never show the version popup.
        if (report && isDirty && hasExistingValuation) {
          generalLogger.info(
            '[ManualLayout] Dirty state detected, showing recalculation confirmation',
            {
              isDirty,
              currentVersionNumber,
            }
          )
          pendingSubmitDataRef.current = data
          pendingPopupFlagsRef.current = {
            hasFormChanges: true,
            hasNormalizations: hasAnyNormalization,
          }
          recalculateConfirmationOpenRef.current = true
          setShowRecalculateConfirmation(true)
          return
        }
        // Use resolved UUID for version API - Titan expects UUID, session key causes 404
        const idForVersions = resolvedReportId || reportId
        // If no valid report id (e.g. 'new' before first calc), skip version check → first valuation
        if (!idForVersions || typeof idForVersions !== 'string' || idForVersions.trim() === '') {
          await handleManualSubmit(data)
          return
        }
        // Sync versions before submit so currentVersion is fresh (avoids stale hasFormChanges)
        await useVersionHistoryStore
          .getState()
          .fetchVersions(idForVersions)
          .catch((err) => {
            generalLogger.warn('[ManualLayout] Pre-submit fetchVersions failed', {
              error: err instanceof Error ? err.message : String(err),
            })
            toast.warning(tHistory('loadError'), {
              description: err instanceof Error ? err.message : undefined,
            })
            // Non-blocking: proceed with submit even if fetch fails
          })
        const latestVersion = getLatestVersion(idForVersions)
        const hasExistingValuationNow = hasExistingValuationVersion(latestVersion)
        if (!hasExistingValuationNow) {
          await handleManualSubmit(data)
          return
        }
        const venusFormData = mapClarityFormToVenusStore(
          data,
          useManualFormStore.getState().formData
        )
        updateFormData(venusFormData)
        const storeSnapshot = useManualFormStore.getState().formData
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildManualCalculationRequest({
          formData: storeSnapshot,
          locale: validLocale as 'nl' | 'en',
          selectedMethod: preSelectedMethod ?? selectedMethod,
          identifiers: { reportId: idForVersions },
          synthesisSelection,
        })

        const previousVersion = getLatestVersion(idForVersions)
        if (!previousVersion) {
          await handleManualSubmit(data)
          return
        }
        const changes = detectVersionChanges(previousVersion.formData, request)
        const hasFormChanges = areChangesSignificant(changes)

        // Defense-in-depth: only show popup when we have a report (first valuation has no report yet)
        if (
          report &&
          shouldOpenVersionConfirmation({
            currentVersion: previousVersion,
            hasFormChanges,
            hasAnyNormalization,
            isConfirmationOpen: recalculateConfirmationOpenRef.current,
          })
        ) {
          generalLogger.info(
            '[ManualLayout] Changes detected, showing recalculation confirmation',
            {
              hasFormChanges,
              hasAnyNormalization,
              currentVersionNumber: previousVersion.versionNumber,
            }
          )
          pendingSubmitDataRef.current = data
          pendingPopupFlagsRef.current = { hasFormChanges, hasNormalizations: hasAnyNormalization }
          recalculateConfirmationOpenRef.current = true
          setShowRecalculateConfirmation(true)
          return
        }
        await handleManualSubmit(data)
      } finally {
        submitInProgressRef.current = false
      }
    },
    [
      reportId,
      resolvedReportId,
      report,
      isDirty,
      hasExistingValuation,
      currentVersionNumber,
      formStoreData,
      currentLocale,
      getLatestVersion,
      handleManualSubmit,
      hasAnyNormalization,
      tHistory,
      preSelectedMethod,
      selectedMethod,
      synthesisSelection,
    ]
  )

  const handleConfirmRecalculate = useCallback(() => {
    const pending = pendingSubmitDataRef.current
    recalculateConfirmationOpenRef.current = false
    setShowRecalculateConfirmation(false)
    pendingSubmitDataRef.current = null
    if (pending) handleManualSubmit(pending)
  }, [handleManualSubmit])

  // ─── Chat Handlers (bi-directional sync) ───
  const handleApplyFieldUpdate = useCallback(
    (field: string, value: unknown) => {
      const bridge = buildManualChatFieldUpdateBridge(field, value)
      if (bridge.collectedDataKey) {
        setCollectedData((prev) => ({ ...prev, [bridge.collectedDataKey!]: value }))
      }
      if (Object.keys(bridge.formPatch).length > 0) {
        updateFormData(bridge.formPatch)
      }
      toast.success(
        t('fieldUpdated', {
          field,
          value: formatManualChatFieldUpdateValue(value, currentLocale),
        })
      )
      setChatMessages((prev) => [
        ...prev,
        buildManualSystemChatMessage({
          id: crypto.randomUUID(),
          content: t('fieldApplied', { field }),
        }),
      ])
    },
    [updateFormData, currentLocale, t]
  )

  const handleChatMessage = useCallback(
    async (
      content: string,
      attachments?: File[],
      detectedValues?: ParsedValue[],
      parsedCommands?: ParsedCommand[]
    ) => {
      // Allow non-empty user messages (e.g. quality-warning CTAs) while
      // history hydrates; only block empty triggers during load.
      if (isLoadingHistory && !content.trim()) return

      const userMessage = buildManualUserChatMessage({
        id: crypto.randomUUID(),
        content,
        attachments,
        createObjectUrl: (attachment) => URL.createObjectURL(attachment),
      })
      setChatMessages((prev) => [...prev, userMessage])
      setIsChatGenerating(true)

      try {
        // Handle parsed commands (local, no AI call needed)
        if (parsedCommands?.length) {
          parsedCommands.forEach((cmd) => handleApplyFieldUpdate(cmd.field, cmd.value))
          await new Promise((r) => setTimeout(r, 500))
          setChatMessages((prev) => [
            ...prev,
            buildManualAssistantChatMessage({
              id: crypto.randomUUID(),
              content: formatManualParsedCommandResponse({
                parsedCommands,
                currentLocale,
                heading: t('normApplied'),
              }),
            }),
          ])
          setIsChatGenerating(false)
          return
        }

        if (detectedValues?.length) {
          setPendingUpdates((prev) => [
            ...prev,
            ...buildPendingUpdatesFromDetectedValues(detectedValues),
          ])
        }

        const { aiChatService } = await import('../../../services/ai/AIChatService')
        const aiRequest = buildManualAIChatRequest({
          message: content,
          reportId: manualChatReportId || undefined,
          currentLocale,
          collectedData: collectedData as Record<string, unknown>,
          latestFormData: latestFormDataRef.current,
          fieldContext,
          normalizationItems,
          conversationId: conversationStore.conversationId || undefined,
          chatMessages,
          versionCount: getManualChatVersionCount(
            useVersionHistoryStore.getState().versions,
            manualChatReportId || resolvedReportId || reportId
          ),
          audience: isAccountantMode ? 'advisor' : 'owner',
        })

        // Use streaming for real-time response + tool indicators
        const streamingMsgId = crypto.randomUUID()
        let streamedContent = ''

        setChatMessages((prev) => [
          ...prev,
          buildManualAssistantChatMessage({ id: streamingMsgId }),
        ])

        if (streamCleanupRef.current) {
          streamCleanupRef.current()
          streamCleanupRef.current = null
        }

        streamCleanupRef.current = aiChatService.streamMessage(aiRequest, {
          onText: (text) => {
            streamedContent += text
            setChatMessages((prev) =>
              patchManualChatMessage(prev, streamingMsgId, { content: streamedContent })
            )
          },
          onToolStart: (toolName) => {
            conversationStore.setToolInProgress(toolName)
          },
          onToolResult: (toolName, result) => {
            conversationStore.setToolInProgress(null)
            const cards = parseManualChatStreamToolResult(toolName, result, () =>
              crypto.randomUUID()
            )
            if (!cards) return

            setChatMessages((prev) =>
              appendManualChatToolCardsToMessages(prev, streamingMsgId, cards)
            )

            // Mirror the parallel state hooks the onError fallback uses, so
            // accept-all flows and pending-update tracking work identically
            // whether or not the stream survived.
            if (cards.fieldUpdates) {
              setPendingUpdates((prev) => [...prev, ...cards.fieldUpdates!])
            }
            if (cards.normalisationSuggestions) {
              handleNormalisationSuggestions(cards.normalisationSuggestions)
            }
          },
          onDone: (responseConversationId) => {
            streamCleanupRef.current = null
            conversationStore.setToolInProgress(null)
            setIsChatGenerating(false)

            if (responseConversationId && !conversationStore.conversationId) {
              conversationStore.setConversationId(responseConversationId)
            }
          },
          onQuotaExhausted: (_credits) => {
            streamCleanupRef.current = null
            conversationStore.setToolInProgress(null)
            setIsChatGenerating(false)

            setChatMessages((prev) =>
              patchManualChatMessage(prev, streamingMsgId, {
                content: t('quotaExhausted'),
                isError: true,
              })
            )
          },
          onError: (error) => {
            streamCleanupRef.current = null
            conversationStore.setToolInProgress(null)
            setIsChatGenerating(false)

            // If streaming fails, fall back to non-streaming
            generalLogger.warn('Streaming failed, falling back to non-streaming', { error })
            aiChatService
              .sendMessage({ ...aiRequest, stream: false })
              .then((aiResponse) => {
                // Quota exhaustion from the non-streaming fallback — show the
                // upgrade copy instead of the fake local response. This
                // matches what onQuotaExhausted does for the streaming path.
                if (aiResponse.requires_upgrade) {
                  setChatMessages((prev) =>
                    patchManualChatMessage(prev, streamingMsgId, {
                      content: t('quotaExhausted'),
                      isError: true,
                    })
                  )
                  return
                }

                if (aiResponse.conversationId && !conversationStore.conversationId) {
                  conversationStore.setConversationId(aiResponse.conversationId)
                }

                const responseCards = addIdsToManualChatToolCards(aiResponse, () =>
                  crypto.randomUUID()
                )
                setChatMessages((prev) =>
                  patchManualChatMessage(prev, streamingMsgId, {
                    content: aiResponse.content,
                    ...responseCards,
                  })
                )

                if (aiResponse.fallback) {
                  toast.info(t('aiUnavailable'), {
                    description: t('aiUnavailableDesc'),
                    duration: 4000,
                  })
                }
                if (responseCards.fieldUpdates) {
                  setPendingUpdates((prev) => [...prev, ...responseCards.fieldUpdates!])
                }
                handleNormalisationSuggestions(responseCards.normalisationSuggestions)
              })
              .catch(() => {
                setChatMessages((prev) =>
                  patchManualChatMessage(prev, streamingMsgId, {
                    content: t('chatError'),
                    isError: true,
                  })
                )
                setIsChatGenerating(false)
              })
          },
        })
      } catch {
        conversationStore.setToolInProgress(null)
        setChatMessages((prev) => [
          ...prev,
          buildManualAssistantChatMessage({
            id: crypto.randomUUID(),
            content: t('chatError'),
            isError: true,
          }),
        ])
        setIsChatGenerating(false)
      }
    },
    [
      collectedData,
      handleApplyFieldUpdate,
      reportId,
      manualChatReportId,
      resolvedReportId,
      fieldContext,
      normalizationItems,
      chatMessages,
      conversationStore,
      isLoadingHistory,
      currentLocale,
    ] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (!isManualAgentNextRunValuation(initialAgentNext)) return
    if (agentNextConsumedRef.current) return
    if (!manualChatReportId) return

    if (!chatDrawerOpen) {
      setChatDrawerOpen(true)
      return
    }

    if (
      isChatGenerating ||
      isLoadingHistory ||
      conversationStore.lastLoadedReportId !== manualChatReportId
    ) {
      return
    }

    agentNextConsumedRef.current = true

    if (typeof window !== 'undefined') {
      if (new URL(window.location.href).searchParams.has('agent_next')) {
        window.history.replaceState(
          window.history.state,
          '',
          stripAgentNextFromHref(window.location.href)
        )
      }
    }

    void handleChatMessage(MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT)
  }, [
    initialAgentNext,
    manualChatReportId,
    chatDrawerOpen,
    isChatGenerating,
    isLoadingHistory,
    conversationStore.lastLoadedReportId,
    handleChatMessage,
  ])

  useEffect(() => {
    if (!pendingPostValuationAgentPrompt) return
    if (!manualChatReportId) return

    if (!chatDrawerOpen) {
      setChatDrawerOpen(true)
      return
    }

    if (
      isChatGenerating ||
      isLoadingHistory ||
      conversationStore.lastLoadedReportId !== manualChatReportId
    ) {
      return
    }

    const prompt = pendingPostValuationAgentPrompt
    setPendingPostValuationAgentPrompt(null)
    void handleChatMessage(prompt)
  }, [
    pendingPostValuationAgentPrompt,
    manualChatReportId,
    chatDrawerOpen,
    isChatGenerating,
    isLoadingHistory,
    conversationStore.lastLoadedReportId,
    handleChatMessage,
  ])

  // AI suggestions: add as pending; Titan persist happens on accept (handleAcceptNormalisation)
  const handleNormalisationSuggestions = useCallback(
    (suggestions: unknown[] | undefined) => {
      if (!suggestions?.length) return
      const { items, reviewSuggestions } = buildManualAiNormalizationSuggestions({
        suggestions,
        filingYear: getCurrentFilingYear(),
        createId: () => crypto.randomUUID(),
      })
      normalizationActions.addItems(items)
      const idForApi = resolvedReportId || reportId
      if (idForApi) normalizationActions.persistToSession(idForApi)
      setSuggestedNormalisations((prev) => [...prev, ...reviewSuggestions])
    },
    [normalizationActions, reportId, resolvedReportId]
  ) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcceptUpdate = useCallback((field: string) => {
    trackAIFieldUpdate()
    setPendingUpdates((prev) => prev.filter((u) => u.field !== field))
  }, [])

  const handleRejectUpdate = useCallback(
    (field: string) => {
      setPendingUpdates((prev) => prev.filter((u) => u.field !== field))
      toast.info(t('suggestionRejected'))
    },
    [t]
  )

  // Retry a failed assistant message by resending the preceding user message
  const handleRetry = useCallback(
    (errorMessageId: string) => {
      if (isChatGenerating || isLoadingHistory) return
      const retryPlan = buildManualChatRetryPlan(chatMessages, errorMessageId)
      if (!retryPlan) return
      // Abort any lingering stream
      if (streamCleanupRef.current) {
        streamCleanupRef.current()
        streamCleanupRef.current = null
      }
      // Remove the error message
      setChatMessages(retryPlan.messages)
      // Resend
      handleChatMessage(retryPlan.retryPrompt)
    },
    [chatMessages, handleChatMessage, isChatGenerating, isLoadingHistory]
  )

  // Start a fresh conversation — full state reset
  const handleNewConversation = useCallback(() => {
    if (streamCleanupRef.current) {
      streamCleanupRef.current()
      streamCleanupRef.current = null
    }
    setIsChatGenerating(false)
    conversationStore.setToolInProgress(null)
    setChatMessages([])
    setPendingUpdates([])
    conversationStore.clearMessages()
    conversationStore.setConversationId(null)
  }, [conversationStore])

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

  // ─── Field Help (opens Chat with context) - Clarity parity: full getContextualQuestion ───
  const handleFieldHelpRequest = useCallback(
    (context: FieldHelpContext) => {
      setFieldContext(buildManualFieldContext(context))
      setChatDrawerOpen(true)

      setTimeout(() => handleChatMessage(buildManualFieldHelpQuestion(context, currentLocale)), 300)
    },
    [handleChatMessage, currentLocale]
  )

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

  // ─── Auto-recalculate valuation with normalized EBITDA ───
  // IMPORTANT: Do NOT manually mutate EBITDA here. buildValuationRequest reads accepted
  // normalizations from useNormalizationStore and applies them. Mutating formStore EBITDA
  // would cause double-counting because buildValuationRequest adds adjustments on top.
  //
  // Navigation-cancellation primitives — close the cross-report `setResult`
  // clobber documented in the audit. `valuationService.calculateValuation` is
  // a long-running POST that we cannot abort today (service-contract change
  // would be needed). The next-best thing is to gate the post-await writes:
  // if the component has unmounted OR the active lookup id has changed
  // mid-flight, the stale result never reaches the global store.
  const recalcMountedRef = useIsMountedRef()
  const recalcLookupIdRef = useLatestRef<string | undefined>(resolvedReportId || reportId)
  const recalculateWithNormalizations = useCallback(
    async (normalizations: NormalizationItem[]) => {
      const idForApi = resolvedReportId || reportId
      if (!report || !idForApi) return

      // Capture the lookup id at start. If navigation happens mid-flight,
      // the post-await `isStillRelevant()` guards bail before any writes
      // reach the global `useManualResultsStore` / `setReport`.
      const startLookupId = idForApi
      const isStillRelevant = () =>
        recalcMountedRef.current && recalcLookupIdRef.current === startLookupId

      const acceptedNorms = normalizations.filter((n) => n.status === 'accepted')

      try {
        // Pass normalizations directly to avoid a redundant store read
        const recalcLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const latestFinancialOverrides = mapClarityFormToVenusStore(
          {
            ...collectedData,
            ...latestFormDataRef.current,
          },
          formStoreData
        )
        const requestSource = buildManualNormalizationRecalcSource({
          formStoreData,
          latestFinancialOverrides,
        })
        const request = buildManualCalculationRequest({
          formData: requestSource,
          normalizations,
          locale: recalcLocale as 'nl' | 'en',
          selectedMethod: preSelectedMethod ?? selectedMethod,
          identifiers: calculationRequestIdentifiers,
          synthesisSelection,
        })

        mergePreparerMultipleIntoRequest(request as unknown as Record<string, unknown>)
        const prepN = usePreparerMultipleStore.getState()
        if (shouldBlockExtremePreparerMultiple(prepN, result?.multiples_valuation)) {
          toast.error(tPreparer('extremeWarning'))
          return
        }

        const calcResult = await valuationService.calculateValuation(request)
        // Cross-report navigation guard: if the user navigated to a different
        // report (or unmounted the component) while the calc was in flight,
        // drop the stale result on the floor — it would clobber the new
        // report's state otherwise.
        if (!isStillRelevant()) return
        if (calcResult) {
          setResult(calcResult)
          setDraftStatus('saved')
          setLastSaved(new Date())
          try {
            await reportService.saveReportAssets(
              idForApi,
              buildManualReportAssets({
                sessionData: requestSource as unknown as Record<string, unknown>,
                request: request as unknown as Record<string, unknown>,
                taxLatencyItems: useTaxLatencyStore.getState().items,
                valuationResult: calcResult,
                name: sessionName,
              })
            )
          } catch (saveError) {
            generalLogger.warn(
              '[ManualLayout] Failed to sync recalculated normalization report assets',
              {
                reportId: idForApi,
                error: saveError instanceof Error ? saveError.message : String(saveError),
              }
            )
          }
          if (!isStillRelevant()) return
          toast.success(t('recalculatedWithNorms'), {
            description: t('recalculatedWithNormsDesc', { count: acceptedNorms.length }),
          })
        }
      } catch (error) {
        if (!isStillRelevant()) return
        generalLogger.warn('[ManualLayout] Normalization recalculation failed (non-blocking)', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(t('normRecalcFailed'), { description: t('normRecalcFailedDesc') })
      }
    },
    [
      report,
      reportId,
      resolvedReportId,
      formStoreData,
      valuationService,
      setResult,
      sessionName,
      tPreparer,
      calculationRequestIdentifiers.reportId,
      calculationRequestIdentifiers.sessionKey,
      linkedIdentifier,
      collectedData,
      result,
      currentLocale,
      t,
      preSelectedMethod,
      selectedMethod,
      synthesisSelection,
    ]
  )

  const handleNormalizationsChange = useCallback(
    async (norms: NormalizationItem[]) => {
      const previousItems = useNormalizationStore.getState().items
      useNormalizationStore.getState().setItems(norms)

      if (
        buildAcceptedNormalizationSignature(previousItems) ===
        buildAcceptedNormalizationSignature(norms)
      ) {
        return
      }

      const idForApi = resolvedReportId || reportId
      if (!idForApi) return

      const allYears = buildManualNormalizationPersistenceYears({
        financialYears,
        previousItems,
        nextItems: norms,
      })

      try {
        await persistOrDeleteNormalizationsForYears(idForApi, allYears, originalEBITDAByYear, norms)
      } catch (error) {
        generalLogger.warn('[ManualLayout] Sync after normalization edit failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      await recalculateWithNormalizations(norms)
    },
    [
      financialYears,
      normalizationActions,
      originalEBITDAByYear,
      reportId,
      resolvedReportId,
      recalculateWithNormalizations,
    ]
  )

  // ─── Auto-recalculate when tax latencies change (post-valuation review) ───
  // TaxLatencySection mutates useTaxLatencyStore directly (no callback prop).
  // Without this subscription, latency-only edits would update the UI but leave the
  // cached valuation result (and PDF/equity bridge) stale until the user touched a
  // normalization row or pressed Calculate again. Mirrors the normalization auto-recalc
  // path; buildManualValuationRequest reads tax latencies from the store directly.
  //
  // The subscription effect intentionally does NOT depend on
  // `recalculateWithNormalizations` (which is a useCallback with ~17 deps that
  // change on every form-field edit). Re-creating the subscription on every
  // keystroke would tear down the pending debounce timer and cause user latency
  // edits to be silently dropped if any other form field changes within 400 ms.
  // Instead we keep the latest callback in a ref and read it inside the timer.
  const recalculateWithNormalizationsRef = useRef(recalculateWithNormalizations)
  useEffect(() => {
    recalculateWithNormalizationsRef.current = recalculateWithNormalizations
  }, [recalculateWithNormalizations])
  useEffect(() => {
    if (!report) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let lastSignature = buildManualTaxLatencySignature(useTaxLatencyStore.getState().items)
    let lastMutationSeq = useTaxLatencyStore.getState()._mutationSeq

    // Concurrency guard: serialise recalcs and use a generation counter so a
    // late-arriving response from an earlier call cannot clobber the result of
    // a newer one within the SAME report.
    //
    // The cross-report race — user edits latency on report A, then navigates
    // to report B before `calculateValuation` resolves — is now closed by the
    // `recalcMountedRef` + `recalcLookupIdRef` guards inside
    // `recalculateWithNormalizations`. `calculateValuation` is still
    // unabortable (a service-contract change would be the proper fix), but
    // the stale response is dropped before it can reach `setResult`.
    let recalcGeneration = 0
    let inflightGeneration: number | null = null
    let pendingAfterInflight = false

    const runRecalc = async () => {
      recalcGeneration += 1
      const myGeneration = recalcGeneration
      inflightGeneration = myGeneration
      try {
        await recalculateWithNormalizationsRef.current(useNormalizationStore.getState().items)
      } finally {
        // If another mutation arrived while this call was in-flight, schedule a
        // single follow-up recalc so the latest store state is reflected. Only
        // applies to the *latest* generation — older ones just no-op on exit.
        if (inflightGeneration === myGeneration) {
          inflightGeneration = null
          if (pendingAfterInflight) {
            pendingAfterInflight = false
            void runRecalc()
          }
        }
      }
    }

    const unsub = useTaxLatencyStore.subscribe((state) => {
      // Only react to mutations (state ref changes from devtools etc. shouldn't fire us).
      if (state._mutationSeq === lastMutationSeq) return
      lastMutationSeq = state._mutationSeq

      const signature = buildManualTaxLatencySignature(state.items)
      const changed = signature !== lastSignature
      // Update baseline unconditionally so a no-op programmatic set() (e.g. clear()
      // when items are already empty, or version-restore to the same snapshot)
      // doesn't leave us comparing against a stale signature next tick.
      lastSignature = signature

      // Programmatic mutations (version restore, session hydration, abandon-clear)
      // must NOT trigger an auto-recalc — they reflect a restored/hydrated valuation
      // that already has its own result. Cancel any pending user-edit debounce so
      // it cannot fire AFTER the programmatic mutation completes and clobber the
      // restored result, then bail.
      if (state._lastMutationSource !== 'user') {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        pendingAfterInflight = false
        return
      }

      if (!changed) return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (inflightGeneration !== null) {
          // A recalc is already running. Mark that we need ONE follow-up after
          // it completes; collapse multiple rapid edits into a single trailing
          // recalc instead of queueing N stale ones.
          pendingAfterInflight = true
          return
        }
        void runRecalc()
      }, 400)
    })

    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
      pendingAfterInflight = false
    }
    // We intentionally depend on `Boolean(report)` rather than `report` itself.
    // `setReport(...)` is invoked from many unrelated paths (htmlReport patches,
    // metadata updates, version restore) and each call changes object identity.
    // Depending on the object would tear down + re-mount this effect on every
    // such update — clearing the pending `debounceTimer` and silently dropping
    // any latency edit the user made within the prior 400 ms. The effect body
    // only uses `report` as an "is this report ready" gate (see the early
    // return), so the boolean carries all the information we actually need.
  }, [Boolean(report)])

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

  // ─── Version Restore ───
  // Receives full ValuationVersion from HistoryPanel (looked up from store)
  const handleVersionRestore = useCallback(
    async (version: unknown) => {
      try {
        const restorePlan = buildManualVersionRestorePlan(version)
        if (!restorePlan) return
        const { versionNumber } = restorePlan

        // 1. Notify backend (graceful — don't block on failure)
        const idForApi = resolvedReportId || reportId
        if (idForApi && versionNumber) {
          import('../../../services/api/version/VersionAPI')
            .then(({ VersionAPI }) => {
              const api = new VersionAPI()
              api.restoreVersion(idForApi, versionNumber).catch(() => {
                generalLogger.warn(
                  '[ManualLayout] Backend restore notification failed (non-blocking)'
                )
              })
            })
            .catch((err) => {
              generalLogger.warn('[ManualLayout] VersionAPI import failed', {
                error: err instanceof Error ? err.message : String(err),
              })
            })
        }

        // 2. Hydrate form with version's form data (ValuationVersion.formData)
        if (restorePlan.formData) {
          updateFormData(restorePlan.formData as Parameters<typeof updateFormData>[0])
        }

        // 3. Set valuation result with htmlReport merged from version
        if (restorePlan.valuationResult) {
          setResult(restorePlan.valuationResult)
        }

        // 4. Restore normalizations from normalization_data snapshot
        if (restorePlan.normalizations.length > 0) {
          normalizationActions.setItems(restorePlan.normalizations)
        }

        // 5. Restore tax latencies from version snapshot. The valuation result was
        // already restored in step 3 via setResult(version.valuationResult); both
        // store mutations below pass `{ source: 'system' }` so the latency-change
        // auto-recalc subscription skips them and does not overwrite the restored
        // result with a fresh calculation. Candidates are not part of the recalc
        // signature (only items are), so they don't need source tagging.
        if (restorePlan.taxLatencyItems.length > 0) {
          useTaxLatencyStore.getState().setItems(restorePlan.taxLatencyItems, { source: 'system' })
        } else {
          useTaxLatencyStore.getState().clear({ source: 'system' })
        }

        useTaxLatencyStore.getState().setCandidates(restorePlan.taxLatencyCandidates)

        // 6. Update version history active version and re-fetch from backend
        //    (restore creates a new version copy on the backend)
        if (idForApi && versionNumber) {
          useVersionHistoryStore.getState().setActiveVersion(idForApi, versionNumber)
          await useVersionHistoryStore.getState().fetchVersions(idForApi)
        }

        setRightPanelView('preview')
        toast.success(t('versionRestored', { version: versionNumber ?? '' }))
      } catch (error) {
        generalLogger.warn('[ManualLayout] Version restore failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(t('versionRestoreFailed'))
      }
    },
    [reportId, resolvedReportId, updateFormData, setResult, normalizationActions]
  )

  // ─── CSV / “import” UI → normalization hints only (NOT Hermes MAR ingestion) ───
  // Calls /api/ai/normalize → gap-analysis style suggestions. Full ledger ingest must go
  // Hermes aggregate + Titan sync; see docs/financial-ingestion/CSV_UNIFIED_PIPELINE.md.
  const handleCSVImportComplete = useCallback(
    async (source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable', _fileName?: string) => {
      const sourceLabel = MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS[source]
      toast.success(t('importStarted', { source: sourceLabel }), {
        description: t('importStartedDesc'),
      })

      try {
        // Request AI-powered normalization analysis
        const response = await fetch('/api/ai/normalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            sessionId: reportId,
            source,
            companyName: collectedData.companyName,
            industry: collectedData.industry,
            financialData: collectedData,
          }),
        })

        let suggestions: unknown[] = []
        if (response.ok) {
          const data = (await response.json()) as { suggestions?: unknown[] }
          suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
        }

        const {
          items: unifiedItems,
          reviewSuggestions,
          chatSuggestions,
        } = buildManualImportedNormalizationSuggestions({
          suggestions,
          source,
          filingYear: getCurrentFilingYear(),
        })

        setSuggestedNormalisations(reviewSuggestions)
        normalizationActions.setItems(unifiedItems)
        openUnifiedNormalizationModal({ track: false })
        setChatDrawerOpen(true)

        // Save normalizations to session (draft state). Titan persist happens on accept/reject
        // via handleAcceptNormalisation or sync effect — avoids persisting pending items to Titan.
        const idForApi = resolvedReportId || reportId
        if (idForApi) normalizationActions.persistToSession(idForApi)

        setChatMessages((prev) => [
          ...prev,
          {
            ...buildManualAssistantChatMessage({
              id: crypto.randomUUID(),
              content: t('importAnalyzed', { source: sourceLabel, count: unifiedItems.length }),
            }),
            normalisationSuggestions: chatSuggestions,
          },
        ])
      } catch (error) {
        generalLogger.error('[ManualLayout] CSV import analysis failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(t('importAnalysisFailed'), { description: t('importAnalysisFailedDesc') })
      }
    },
    [reportId, resolvedReportId, collectedData, normalizationActions, t]
  )

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
    onResolveIssueWithAssistant: (issue: StudioIssue) => {
      setChatDrawerOpen(true)
      handleChatMessage(formatStartupAssistantPrompt(issue.assistantPrompt[assistantLocale]))
      setAcknowledgedStartupIssues((prev) => {
        const next = new Set(prev)
        next.add(issue.id)
        return next
      })
    },
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

  const handleResolveQualityWarning = useCallback(
    (warningType: string, prompt: string) => {
      // Open the assistant if not already open and forward the prefilled
      // prompt. We mark the warning acknowledged here too: the advisor has
      // explicitly engaged with it. If the underlying issue persists, a
      // re-run will surface the warning again.
      setChatDrawerOpen(true)
      handleChatMessage(prompt)
      setAcknowledgedQualityWarnings((prev) => {
        const next = new Set(prev)
        next.add(warningType)
        return next
      })
    },
    [handleChatMessage, setChatDrawerOpen]
  )

  const handleDismissQualityWarning = useCallback((warningType: string) => {
    setAcknowledgedQualityWarnings((prev) => {
      const next = new Set(prev)
      next.add(warningType)
      return next
    })
  }, [])

  const handleResolveStartupIssue = useCallback(
    (issueId: string, prompt: string) => {
      setChatDrawerOpen(true)
      handleChatMessage(prompt)
      setAcknowledgedStartupIssues((prev) => {
        const next = new Set(prev)
        next.add(issueId)
        return next
      })
    },
    [handleChatMessage]
  )

  const handleDismissStartupIssue = useCallback((issueId: string) => {
    setAcknowledgedStartupIssues((prev) => {
      const next = new Set(prev)
      next.add(issueId)
      return next
    })
  }, [])

  const handleJumpToStartupIssue = useCallback(
    (issueId: string) => {
      const issue = startupIssueById.get(issueId)
      if (!issue || typeof window === 'undefined') return
      const anchor = getManualStartupIssueAnchor(issue.step)
      if (!anchor) return
      const el = document.getElementById(anchor)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [startupIssueById]
  )

  // ─────────────────────────────────────────
  // AI propose-only action handlers (run_valuation, generate_report)
  //
  // These respond to inline action cards rendered by the chat drawer when the
  // assistant's tool registry returns a `pending_approval` payload.
  // - Approve `run_valuation` → fire the existing `handleManualSubmit` with the
  //   cached request payload (matches the user clicking Calculate). If the user
  //   hasn't submitted yet this session, fall back to a toast pointing them at
  //   the form's primary Calculate button.
  // - Approve `generate_report` → fire the existing `generatePdf` flow. No
  //   extra credit is consumed (the PDF reuses the persisted valuation result).
  // - Reject (both) → mark the proposal locally so the card greys out; no
  //   server-side state changes.
  //
  // Decision is stored on the message's request entry, NOT in a separate store,
  // so a refresh re-fetches history and re-renders proposals as fresh pending.
  // ─────────────────────────────────────────
  const handleApproveValuationRun = useCallback(
    (proposalId: string, _reportId?: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'valuationRunRequests', proposalId, 'approved')
      )
      const submitData = lastSubmittedDataRef.current ?? buildLiveValuationSubmitData()
      postValuationListingHandoffPendingRef.current = true
      void handleManualSubmit(submitData)
    },
    [buildLiveValuationSubmitData, handleManualSubmit, setChatMessages]
  )

  const handleRejectValuationRun = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'valuationRunRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  const handleApproveReportGeneration = useCallback(
    (proposalId: string, _reportId?: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'reportGenerationRequests', proposalId, 'approved')
      )
      if (generatePdf) {
        generatePdf().catch((err: unknown) => {
          generalLogger.warn('[ManualLayout] AI-approved PDF generation failed', {
            error: err instanceof Error ? err.message : String(err),
          })
          toast.error(
            // TODO i18n
            'PDF generatie mislukt. Probeer opnieuw via de download-knop in het rapport.'
          )
        })
      } else {
        toast.info(
          // TODO i18n
          'PDF generatie nog niet beschikbaar — bereken eerst de waardering.'
        )
      }
    },
    [generatePdf, setChatMessages]
  )

  const handleRejectReportGeneration = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'reportGenerationRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  // Sellability compute fires through Venus's /api/sellability/score proxy
  // (which forwards to Titan). Free — no credit. On success we surface the
  // new score on the inline card AND raise a toast so it's visible whether or
  // not the chat drawer is scrolled to the proposal.
  const handleApproveSellabilityRun = useCallback(
    async (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'sellabilityRunRequests', proposalId, 'approved')
      )
      try {
        const sellability = await runManualSellabilityScore()
        if (sellability.kind === 'scored') {
          setChatMessages((prev) =>
            applyManualChatSellabilityComputedScore(prev, proposalId, {
              score: sellability.score,
              band: sellability.band,
              confidence: sellability.confidence,
            })
          )
          toast.success(
            // TODO i18n
            `Sellability: ${sellability.score}/100 (${sellability.band})`
          )
        } else {
          toast.info(/* TODO i18n */ 'Sellability berekend.')
        }
      } catch (err) {
        generalLogger.warn('[ManualLayout] AI-approved sellability compute failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        toast.error(
          // TODO i18n
          'Sellability berekening mislukt. Probeer het opnieuw via je owner profile in Mercury.'
        )
      }
    },
    [setChatMessages]
  )

  const handleRejectSellabilityRun = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'sellabilityRunRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

  const handleApproveListingCreate = useCallback(
    (proposalId: string, targetReportId?: string, targetAccountantCustomerId?: string | null) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'listingCreateRequests', proposalId, 'approved')
      )

      const reportIdForListing = resolveManualCanonicalReportId({
        targetReportId,
        session,
        resolvedReportId,
        routeReportId: reportId,
        resultValuationId: result?.valuation_id,
        activeSessionKey,
      })
      if (!reportIdForListing) {
        toast.error(
          // TODO i18n
          'Geen waarderingsrapport gevonden om de listing voor te bereiden.'
        )
        return
      }

      const relationshipId = resolveManualListingRelationshipId({
        targetAccountantCustomerId,
        clientContextId,
        contextRelationshipId: ctxRelationshipId,
        fallbackRelationshipId: useClientContext.getState()?.relationshipId,
      })

      trackReturnToMercury()
      window.location.href = buildManualListingWizardUrl({
        mercuryUrl: getMercuryUrl(),
        locale: mercuryLocale,
        reportId: reportIdForListing,
        relationshipId,
      })
    },
    [
      activeSessionKey,
      clientContextId,
      ctxRelationshipId,
      mercuryLocale,
      reportId,
      result?.valuation_id,
      resolvedReportId,
      session,
      session?.reportId,
      setChatMessages,
    ]
  )

  const handleRejectListingCreate = useCallback(
    (proposalId: string) => {
      setChatMessages((prev) =>
        markManualChatProposalDecision(prev, 'listingCreateRequests', proposalId, 'rejected')
      )
    },
    [setChatMessages]
  )

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
        onCancel={() => {
          recalculateConfirmationOpenRef.current = false
          setShowRecalculateConfirmation(false)
          pendingSubmitDataRef.current = null
        }}
        isCreating={isGenerating || isCalculating}
        hasFormChanges={pendingPopupFlagsRef.current.hasFormChanges}
        hasNormalizations={pendingPopupFlagsRef.current.hasNormalizations}
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
        onUploadClick={() => {}}
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
              <div ref={reportPanelRef} className="h-full bg-background flex flex-col">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AnimatePresence mode="wait">
                    {rightPanelView === 'preview' ? (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={springDefault}
                        className="valuation-report-container h-full overflow-y-auto bg-background"
                      >
                        {report?.htmlReport ? (
                          <div className="relative">
                            {isMethodSwitchRendering && (
                              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                                <div className="flex items-center gap-2 rounded-lg bg-background/90 px-4 py-2 shadow-sm">
                                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  <span className="text-sm text-foreground/70">
                                    {t('updatingReport')}
                                  </span>
                                </div>
                              </div>
                            )}
                            {liveMultipleReportPreview && (
                              <div className="sticky top-0 z-[5] border-b border-primary/15 bg-primary/[0.06] px-4 py-3 backdrop-blur-sm">
                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">
                                      {t('previewEquityValue')}
                                    </p>
                                    <p className="text-sm text-foreground/70">
                                      {t('previewEquityBlurb')}
                                    </p>
                                  </div>
                                  <div className="text-left md:text-right">
                                    <p className="text-lg font-mono font-semibold tabular-nums text-primary">
                                      €
                                      {(
                                        liveMultipleReportPreview.previewEquity / 1_000_000
                                      ).toFixed(2)}
                                      M
                                    </p>
                                    <p className="text-[11px] font-mono tabular-nums text-foreground/55">
                                      {liveMultipleReportPreview.delta >= 0 ? '+' : '-'}€
                                      {(Math.abs(liveMultipleReportPreview.delta) / 1_000).toFixed(
                                        0
                                      )}
                                      K · {liveMultipleReportPreview.appliedMultiple.toFixed(2)}×
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Cap-table simulator was previously rendered here as a
                              React slider above the HTML report. The same data is now
                              the single source of truth in the canonical Jinja report
                              (`startup_one_pager.html` + `startup_cap_table.html`), so
                              the duplicate mount has been removed to give founders a
                              clean, single-source result surface. */}
                            <div className="valuation-report">
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: HTMLProcessor.sanitize(report.htmlReport),
                                }}
                              />
                            </div>
                          </div>
                        ) : isGenerating || isCalculating ? (
                          <div className="h-full flex flex-col bg-background">
                            <div className="flex items-center justify-center gap-2 py-4">
                              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm text-foreground/70">
                                {tReport('generating.title')}
                              </span>
                            </div>
                            <ReportSkeleton />
                          </div>
                        ) : (
                          <ReportPlaceholder />
                        )}
                      </motion.div>
                    ) : rightPanelView === 'history' ? (
                      <motion.div
                        key="history"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={springDefault}
                        className="h-full bg-background"
                      >
                        <Suspense fallback={<PanelSkeleton />}>
                          <HistoryPanel
                            report={report}
                            reportId={reportId}
                            onVersionRestore={handleVersionRestore}
                          />
                        </Suspense>
                      </motion.div>
                    ) : report?.htmlReport ? (
                      <motion.div
                        key="html-report"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={springDefault}
                        className="valuation-report-container h-full overflow-y-auto bg-background relative"
                      >
                        {isMethodSwitchRendering && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                            <div className="flex items-center gap-2 rounded-lg bg-background/90 px-4 py-2 shadow-sm">
                              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm text-foreground/70">
                                {t('updatingReport')}
                              </span>
                            </div>
                          </div>
                        )}
                        {liveMultipleReportPreview && (
                          <div className="sticky top-0 z-[5] border-b border-primary/15 bg-primary/[0.06] px-4 py-3 backdrop-blur-sm">
                            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">
                                  {t('previewEquityValue')}
                                </p>
                                <p className="text-sm text-foreground/70">
                                  {t('previewEquityBlurb')}
                                </p>
                              </div>
                              <div className="text-left md:text-right">
                                <p className="text-lg font-mono font-semibold tabular-nums text-primary">
                                  €
                                  {(liveMultipleReportPreview.previewEquity / 1_000_000).toFixed(2)}
                                  M
                                </p>
                                <p className="text-[11px] font-mono tabular-nums text-foreground/55">
                                  {liveMultipleReportPreview.delta >= 0 ? '+' : '-'}€
                                  {(Math.abs(liveMultipleReportPreview.delta) / 1_000).toFixed(0)}K
                                  · {liveMultipleReportPreview.appliedMultiple.toFixed(2)}×
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Cap-table simulator deliberately omitted — the canonical
                          Jinja report (`startup_one_pager.html` + `startup_cap_table.html`)
                          is the single source of truth for the simulator card. */}
                        <div className="valuation-report">
                          <div
                            dangerouslySetInnerHTML={{
                              __html: HTMLProcessor.sanitize(report.htmlReport),
                            }}
                          />
                        </div>
                      </motion.div>
                    ) : isGenerating || isCalculating ? (
                      <motion.div
                        key="report"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={springDefault}
                        className="h-full bg-background"
                      >
                        <ReportSkeleton />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={springDefault}
                        className="h-full bg-background"
                      >
                        <ReportPlaceholder />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
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
        onRetryMethodDataLoad={() => setReportHydrationRetryNonce((n) => n + 1)}
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

      {/* Starter paywall — methods, normalization hub, or version history (Free tier teasers).
          The advisor SaaS Starter plan (€1,490/year billed yearly, list €1,788) is the wrong upgrade path for
          business owners — they should be funneled into the C2B2B referral loop
          instead (invite an advisor → advisor pays SaaS → BO unlocks branded PDF).
          See `.cursor/rules/plg-client-invite-loop.mdc` and
          `.cursor/rules/plg-watermark-branding.mdc` for the audience contract. */}
      {methodPaywallOpen &&
        (() => {
          const isBusinessOwnerAudience = !showFullAdvisorMethodNav
          const mercuryUrl = getMercuryUrl()
          const businessDashboardUrl = buildManualMercuryBusinessDashboardUrl({
            mercuryUrl,
            locale: currentLocale,
          })
          const advisorPricingUrl = buildManualMercuryPricingUrl({
            mercuryUrl,
            locale: currentLocale,
          })

          const titleNl =
            methodPaywallReason === 'methods'
              ? isBusinessOwnerAudience
                ? 'Meer methodes via uw adviseur'
                : 'Upgrade voor alle methodes'
              : methodPaywallReason === 'normalization'
                ? isBusinessOwnerAudience
                  ? 'Normalisaties via uw adviseur'
                  : 'EBITDA-normalisatie & belastinglatenties'
                : methodPaywallReason === 'version_history'
                  ? isBusinessOwnerAudience
                    ? 'Versiebeheer via uw adviseur'
                    : 'Overschrijven, verfijnen & auditspoor'
                  : methodPaywallReason === 'synthesis'
                    ? isBusinessOwnerAudience
                      ? 'Waarderingssynthese via uw adviseur'
                      : 'Waarderingssynthese'
                    : isBusinessOwnerAudience
                      ? 'Krijg uw merkrapport — deel met uw adviseur'
                      : 'PDF-download vanaf Starter'

          const titleEn =
            methodPaywallReason === 'methods'
              ? isBusinessOwnerAudience
                ? 'More methods via your advisor'
                : 'Upgrade for all methods'
              : methodPaywallReason === 'normalization'
                ? isBusinessOwnerAudience
                  ? 'Normalization via your advisor'
                  : 'EBITDA normalization & tax latencies'
                : methodPaywallReason === 'version_history'
                  ? isBusinessOwnerAudience
                    ? 'Version control via your advisor'
                    : 'Overwrite, refine & audit trail'
                  : methodPaywallReason === 'synthesis'
                    ? isBusinessOwnerAudience
                      ? 'Valuation synthesis via your advisor'
                      : 'Valuation Synthesis'
                    : isBusinessOwnerAudience
                      ? 'Get your branded report — share with your advisor'
                      : 'PDF download from Starter'

          const bodyNl = isBusinessOwnerAudience
            ? methodPaywallReason === 'pdf_download'
              ? 'Uw gratis rapport blijft online beschikbaar met watermerk. Voor een merkversie zonder watermerk in PDF: nodig uw boekhouder of M&A-adviseur uit. Zij beheren het abonnement — voor u blijft alles gratis.'
              : 'Deze functie is onderdeel van het Starter-abonnement van uw adviseur. Nodig uw boekhouder of M&A-adviseur uit zodat zij deze functies voor uw rapport kunnen ontgrendelen — voor u blijft het gebruik gratis.'
            : methodPaywallReason === 'methods'
              ? 'Je gratis plan bevat Upswitch marktbenadering, DCF, EBITDA, gecorrigeerd NAV en liquidatiewaarde (read-only, geen PDF-download). Upgrade naar Starter voor alle 10 methodes, manuele controle over elke aanpassing, downloadbare rapporten zonder watermerk in uw huisstijl en live Benelux sector-multiples.'
              : methodPaywallReason === 'normalization'
                ? 'De volledige normalisatiehub (incl. belastinglatenties) zit in Starter. Je krijgt ook gepersonaliseerde PDF-rapporten, volledige manuele controle en de mogelijkheid om waarderingen te overschrijven met volledig auditspoor.'
                : methodPaywallReason === 'version_history'
                  ? 'Overschrijven & verfijnen bij wijzigende cijfers — met volledig auditspoor — vanaf Starter.'
                  : methodPaywallReason === 'synthesis'
                    ? 'Combineer meerdere waarderingsmethodes met een gewogen gemiddelde en verdedig uw keuze in het PDF-rapport. Upgrade naar Starter voor de volledige waarderingssynthese.'
                    : 'Uw gratis rapport is read-only met watermerk. Upgrade naar Starter voor downloadbare PDF-rapporten zonder watermerk in uw huisstijl en alle 9 methodes.'

          const bodyEn = isBusinessOwnerAudience
            ? methodPaywallReason === 'pdf_download'
              ? 'Your free report stays available online with a watermark. For a branded watermark-free PDF, invite your accountant or M&A advisor. They manage the subscription — your access stays free.'
              : 'This feature is part of your advisor’s Starter plan. Invite your accountant or M&A advisor so they can unlock these features on your report — your access stays free.'
            : methodPaywallReason === 'methods'
              ? 'Your free plan includes Upswitch market approach, DCF, EBITDA, and adjusted NAV (read-only, no PDF download). Upgrade to Starter for all 9 methods, manual control over every adjustment, downloadable watermark-free branded reports, and live Benelux sector multiples.'
              : methodPaywallReason === 'normalization'
                ? 'The full normalization hub (incl. tax latencies) is on Starter together with branded PDFs, full manual control, and the ability to overwrite valuations with full audit trail.'
                : methodPaywallReason === 'version_history'
                  ? 'Overwrite & refine as financials evolve — with full audit trail — from Starter.'
                  : methodPaywallReason === 'synthesis'
                    ? 'Blend multiple valuation methods with weighted averages and defend your choice in the PDF report. Upgrade to Starter for the full valuation synthesis.'
                    : 'Your free report is read-only with a watermark. Upgrade to Starter for downloadable watermark-free PDF reports with your branding and all 9 methods.'

          const ctaHref = isBusinessOwnerAudience ? businessDashboardUrl : advisorPricingUrl
          const ctaLabel = isBusinessOwnerAudience
            ? currentLocale === 'nl'
              ? 'Open mijn dashboard'
              : 'Open my dashboard'
            : getStarterPlanSummary(currentLocale)

          return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-popover border border-foreground/10 rounded-xl p-6 max-w-md w-full shadow-xl">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-foreground mb-2">
                    {currentLocale === 'nl' ? titleNl : titleEn}
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {currentLocale === 'nl' ? bodyNl : bodyEn}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMethodPaywallOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-muted hover:bg-foreground/10 text-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    {currentLocale === 'nl' ? 'Sluiten' : 'Close'}
                  </button>
                  <a
                    href={ctaHref}
                    className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors text-center"
                  >
                    {ctaLabel}
                  </a>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
