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
 *   + FullscreenReportModal, NormalisationSuggestionModal, UnifiedNormalizationModal
 *
 * @module features/manual/components/ManualLayout
 */

import { AnimatePresence, motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  trackAIFieldUpdate,
  trackAINormalizationAccept,
  trackNormalizationOpen,
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
  type FieldContext,
  FullscreenReportModal,
  InviteClientModal,
  HistoryPanel,
  ManualInputPanel,
  type NormalisationSuggestion,
  NormalisationSuggestionModal,
  type NormalizationItem,
  type RightPanelView,
  UnifiedNormalizationModal,
  type ValuationReportData,
} from '../../../components/calculator'
import { NewValuationModal } from '../../../components/NewValuationModal'
import { RecalculateConfirmationPopup } from '../../../components/normalization/RecalculateConfirmationPopup'
import { ReportPlaceholder } from '../../../components/skeletons/ReportPlaceholder'
import { ReportSkeleton } from '../../../components/skeletons/ReportSkeleton'
import { springDefault } from '../../../design-system/components/motion'
// Design System
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../../design-system/components/Resizable'
// Venus infrastructure (auth, session, stores, services)
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapPrefill } from '../../../hooks/useBootstrapPrefill'
import { useBootstrapSync } from '../../../hooks/useBootstrapSync'
import { usePdfGeneration } from '../../../hooks/usePdfGeneration'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import {
  getSafeMercuryReturnUrl,
  isLegacyReturnUrl,
} from '../../../lib/return-url'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import { reportService, valuationService } from '../../../services'
import { looksLikeNaceCode } from '../../../services/naceBusinessTypeService'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useConversationStore } from '../../../store/useConversationStore'
import {
  enableNormalizationAutoPersist,
  mapBackendCategoryToFrontend,
  mapFrontendCategoryToBackend,
  setNormalizationToastMessages,
  useNormalizationStore,
} from '../../../store/useNormalizationStore'
import {
  enableTaxLatencyAutoPersist,
  useTaxLatencyStore,
} from '../../../store/useTaxLatencyStore'
import { useClientContext } from '../../../stores/clientContext'
import { useSessionStore } from '../../../store/useSessionStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { AuthenticationError } from '../../../types/errors'
import type {
  ValuationResponse,
  ValuationFormData as VenusFormData,
} from '../../../types/valuation'
import { buildValuationRequest } from '../../../utils/buildValuationRequest'
import {
  persistNormalizationsBeforeCalculate,
  persistOrDeleteNormalizationsForYears,
} from '../../../utils/normalizationPersist'
import { EMBEDDED_STORAGE_KEY } from '../../../hooks/useEmbeddedMode'
import { getLastFullFiscalYear } from '../../../utils/fiscalYear'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import { HTMLProcessor } from '../../../utils/htmlProcessor'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { isAuthError } from '../../../utils/errorDetection'
import { generalLogger } from '../../../utils/logger'
import { getReportedEbitdaBaseline } from '../../../utils/normalizationMath'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import { hasExistingValuationVersion, shouldOpenVersionConfirmation } from '../../../utils/versionConfirmation'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '../../../utils/versionDiffDetection'

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
  businessType?: string
  industry?: string
  country?: string
  yearFounded?: string
  ownerManagers?: number
  fteEmployees?: number
  equityStake?: number
  /** Financial data from ManualInputPanel (for AI context before submit) */
  revenue?: number
  ebitda?: number
  yearlyFinancials?: Array<{ year: string; revenue: number; ebitda: number }>
  current_year_data?: { year: number; revenue: number; ebitda: number }
}

/** Compute display initials from user name (Titan/Mercury profile) */
function getUserInitials(user: { name?: string; email?: string } | null): string {
  if (!user?.name) return (user?.email?.[0] || 'G').toUpperCase()
  const names = user.name.trim().split(/\s+/)
  if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase()
  return user.name.substring(0, 2).toUpperCase()
}

// ─────────────────────────────────────────
// MOBILE HOOK
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// SUSPENSE FALLBACK
// ─────────────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-foreground/10" />
        <div className="w-24 h-3 rounded bg-foreground/10" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// MOBILE HOOK
// ─────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

// ─────────────────────────────────────────
// DEFAULT NORMALIZATION SUGGESTIONS
// Used as fallback when AI analysis is unavailable.
// These represent the most common normalization categories for Belgian SMEs.
// ─────────────────────────────────────────

function generateDefaultNormalizationSuggestions(
  source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable',
  nh: (key: string) => string
) {
  const labels = {
    yuki: 'Yuki',
    exact: 'Exact Online',
    odoo: 'Odoo',
    octopus: 'Octopus',
    accountable: 'Accountable',
  }
  return [
    {
      id: `${source}-1`,
      code: '620',
      description: nh('defaultSuggestions.ownerSalaryAboveMarket'),
      category: 'salary',
      amount: 60000,
      reason: nh('defaultSuggestions.salaryDiffReason'),
      sourceRef: `${labels[source]} 620xxx`,
      status: 'pending',
    },
    {
      id: `${source}-2`,
      code: '610',
      description: nh('defaultSuggestions.officeRent'),
      category: 'rent',
      amount: 24000,
      reason: nh('defaultSuggestions.rentAboveMarketReason'),
      sourceRef: `${labels[source]} 610xxx`,
      status: 'pending',
    },
    {
      id: `${source}-3`,
      code: '614',
      description: nh('defaultSuggestions.directorVehicle'),
      category: 'vehicle',
      amount: 18000,
      reason: nh('defaultSuggestions.vehicleReason'),
      sourceRef: nh('sources.manual'),
      status: 'pending',
    },
    {
      id: `${source}-4`,
      code: '647',
      description: nh('defaultSuggestions.oneTimeLegal'),
      category: 'one-time',
      amount: 35000,
      reason: nh('defaultSuggestions.acquisitionDispute'),
      sourceRef: `${labels[source]}`,
      status: 'pending',
    },
    {
      id: `${source}-5`,
      code: '650',
      description: nh('defaultSuggestions.familyOnPayroll'),
      category: 'personal',
      amount: 45000,
      reason: nh('defaultSuggestions.partnerNoRole'),
      sourceRef: nh('sources.manual'),
      status: 'pending',
    },
  ]
}

// ─────────────────────────────────────────
// FORM DATA BRIDGE
// Maps ManualInputPanel's ValuationFormData (camelCase, multi-year)
// to Venus store's ValuationFormData (snake_case, API format)
// ─────────────────────────────────────────

function mapClarityFormToVenusStore(data: any): Partial<VenusFormData> {
  const allYears = (data.yearlyFinancials || [])
    .filter(
      (yf: any) =>
        yf.year &&
        ((Number(yf.revenue) || 0) > 0 ||
          (yf.ebitda !== '' && yf.ebitda !== null && yf.ebitda !== undefined))
    )
    .sort((a: any, b: any) => parseInt(b.year) - parseInt(a.year))

  const current = allYears[0]
  const historical = allYears.slice(1)

  return {
    company_name: data.companyName || '',
    country_code: (data.country || 'BE').toUpperCase(),
    industry: data.industry || 'services',
    business_model: data.businessType || 'services',
    founding_year: parseInt(data.yearFounded) || new Date().getFullYear() - 5,
    number_of_owners: data.ownerManagers || 1,
    number_of_employees: data.fteEmployees,
    shares_for_sale: data.equityStake || 100,
    business_type: data.businessStructure || 'company',
    revenue: current?.revenue,
    ebitda: current?.ebitda,
    current_year_data: current
      ? {
          year: parseInt(current.year),
          revenue: current.revenue,
          ebitda: current.ebitda,
        }
      : undefined,
    historical_years_data: historical.map((h: any) => ({
      year: parseInt(h.year),
      revenue: h.revenue,
      ebitda: h.ebitda,
    })),
    ...(data.kboNumber && { kbo_number: data.kboNumber }),
    ...(data.naceCode && { nace_code: data.naceCode }),
    ...(data.naceDescription && { nace_description: data.naceDescription }),
    ...(data.legalForm && { legal_form: data.legalForm }),
    ...((data.businessType || data.businessTypeCode) && {
      business_type_id: data.businessType || data.businessTypeCode,
    }),
  }
}

// ─────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────

interface ManualLayoutProps {
  reportId: string
  onComplete: (result: ValuationResponse) => void
  initialVersion?: number
  initialMode?: 'edit' | 'view'
  initialTab?: 'preview' | 'history'
  urlAction?: string
  /** Open chat drawer on mount when URL has drawer=open (Clarity parity) */
  initialDrawerOpen?: boolean
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
}) => {
  const router = useTransitionRouter()
  const t = useTranslations('toast')
  const tReport = useTranslations('report')
  const tHistory = useTranslations('historyPanel')
  const tErrors = useTranslations('errors')
  const nh = useTranslations('normalizationHub')
  const isMobile = useIsMobile()

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
    } catch {}
  }, [])

  // Provide i18n for normalization store toasts (store cannot use hooks).
  // Contract: getter receives keys like 'normalizationNotSaved'; t is useTranslations('toast')
  // so t(key) resolves to toast.normalizationNotSaved etc.
  useEffect(() => {
    setNormalizationToastMessages((key) => t(key))
    return () => setNormalizationToastMessages(null)
  }, [t])
  const reportPanelRef = useRef<HTMLDivElement>(null)

  // Venus infrastructure
  const { user } = useAuth()
  const { identity, isAccountantFlow } = useBootstrap()
  useBootstrapSync()
  useBootstrapPrefill() // Ensures form store gets Mercury/bootstrap data (Manual flow doesn't render ValuationForm)

  const { isCalculating, error, result, trySetCalculating, setCalculating, setResult } =
    useManualResultsStore()
  const { updateFormData } = useManualFormStore()
  const formStoreData = useManualFormStore((s) => s.formData)
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const sessionError = useSessionStore((s) => s.errorMessage)
  const reportIdFromSession = useSessionStore((s) => s.session?.reportId)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const sessionName = useSessionStore((s) => s.session?.name)
  const { createVersion, getLatestVersion } = useVersionHistoryStore()
  const {
    generatePdf,
    downloadPdf,
    isGenerating: isPdfGenerating,
    isReady: isPdfReady,
  } = usePdfGeneration(reportId)

  const currentLocale = useLocale()

  // ─── Accountant Mode Detection (hooks must be before any early returns) ───
  const [isAccountantMode, setIsAccountantMode] = useState(false)
  const [clientContextName, setClientContextName] = useState<string | undefined>(undefined)
  const [clientContextId, setClientContextId] = useState<string | undefined>(undefined)
  const [accountantDisplayName, setAccountantDisplayName] = useState<string | undefined>(undefined)

  useEffect(() => {
    // Detect accountant mode from client context store
    import('../../../stores/clientContext')
      .then(({ useClientContext }) => {
        const ctx = useClientContext.getState()
        if (ctx.isActingAsClient && ctx.client) {
          setIsAccountantMode(true)
          setClientContextName(ctx.client.fullName || ctx.client.email || undefined)
          // CRITICAL: Only use relationshipId (accountant_customers.id) for navigation.
          // ctx.client.id is the Supabase Auth user UUID (owner_user_id) which is NOT
          // a valid accountant_customers ID and would cause 404 on Mercury client detail pages.
          setClientContextId(ctx.relationshipId ?? undefined)
          // Use the accountant's own name for the toolbar identity display
          if (ctx.accountant) {
            setAccountantDisplayName(ctx.accountant.fullName || ctx.accountant.email || undefined)
          }
        }
      })
      .catch(() => {
        // Non-critical
      })
  }, [])

  // Resolve session key (val_xxx) to UUID for Titan API calls - session.reportId is set after first calculation
  // Titan requires session_id 8–128 chars; prefer UUID when available, else session_key (val_xxx)
  const resolvedReportId = useMemo(() => {
    if (!reportId) return reportId
    if (reportId === 'new' && session?.reportId) return session.reportId
    // When reportId is 'new' but session.reportId undefined, use session_key (Titan may not have created report yet)
    if (reportId === 'new' && session) {
      const sk = (session as any)?.key ?? (session as any)?.session_key
      if (sk && sk.length >= 8) return sk
    }
    if (typeof reportId === 'string' && reportId.startsWith('val_') && session?.reportId) {
      return session.reportId
    }
    return reportId
  }, [reportId, session?.reportId, session])

  // Session matches when reportId equals session.reportId (UUID) or session.key (session key)
  const sessionMatchesReport =
    session &&
    (session.reportId === reportId || (session as any)?.key === reportId)

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
  // Detect if session has existing data but report hasn't been built yet (prevents placeholder flash)
  const isRestoringExistingReport =
    !report &&
    !isGenerating &&
    !!session &&
    (() => {
      const sd = (session.sessionData || session) as any
      return !!(sd.valuationResult || sd.valuation_result || sd.htmlReport || sd.html_report)
    })()
  // Unblock UI as soon as SessionRestorationService signals completion.
  // Keep a 5s safety timeout as a last resort in case the signal is never set.
  const [restoreTimeoutFired, setRestoreTimeoutFired] = useState(false)
  useEffect(() => {
    if (!isRestoringExistingReport) {
      setRestoreTimeoutFired(false)
      return
    }
    const id = setTimeout(() => {
      setRestoreTimeoutFired(true)
      generalLogger.warn(
        '[ManualLayout] isRestoringExistingReport safety timeout fired - unblocking right panel'
      )
    }, 5000)
    return () => clearTimeout(id)
  }, [isRestoringExistingReport])
  const effectiveIsRestoringExistingReport =
    isRestoringExistingReport && !restorationComplete && !restoreTimeoutFired
  const [reportStatus, setReportStatus] = useState<'draft' | 'final'>('draft')
  const [isExporting, setIsExporting] = useState(false)
  const [downloadHistory, setDownloadHistory] = useState<
    { id: string; fileName: string; timestamp: Date; size: string }[]
  >([])
  const [showNewValuationModal, setShowNewValuationModal] = useState(false)
  const [isConfirmingNewValuation, setIsConfirmingNewValuation] = useState(false)

  // ─── Panel View State ───
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(initialTab ?? 'preview')

  // ─── Chat Co-pilot State ───
  const [chatDrawerOpen, setChatDrawerOpen] = useState(initialDrawerOpen)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatGenerating, setIsChatGenerating] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const conversationStore = useConversationStore()
  const streamCleanupRef = useRef<(() => void) | null>(null)

  // Load conversation history from server and sync to local chat state.
  // When reportId changes (e.g. accountant switches clients), reload for the new report.
  useEffect(() => {
    const needsLoad =
      reportId &&
      chatDrawerOpen &&
      !isLoadingHistory &&
      conversationStore.lastLoadedReportId !== reportId
    if (needsLoad) {
      setIsLoadingHistory(true)
      conversationStore
        .loadHistory(reportId)
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
  }, [reportId, chatDrawerOpen, conversationStore.lastLoadedReportId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      streamCleanupRef.current?.()
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
  const [pendingUpdates, setPendingUpdates] = useState<
    { field: string; value: any; label: string }[]
  >([])

  // ─── Normalization State (Unified Store) ───
  const normalizationItems = useNormalizationStore((s) => s.items)
  const normalizationActions = useNormalizationStore()
  const [suggestedNormalisations, setSuggestedNormalisations] = useState<any[]>([])
  /** Latest financial data from ManualInputPanel (for AI context before submit) */
  const latestFormDataRef = useRef<Partial<CollectedData>>({})

  const getLiveYearlyFinancials = useCallback(() => {
    const latestYearlyFinancials = Array.isArray(latestFormDataRef.current?.yearlyFinancials)
      ? (latestFormDataRef.current?.yearlyFinancials as Array<{
          year: string
          revenue: number
          ebitda: number
        }>)
      : []
    if (latestYearlyFinancials.length > 0) {
      return [...latestYearlyFinancials].sort((a, b) => Number(b.year) - Number(a.year))
    }

    const allYears: Array<{ year: string; revenue: number; ebitda: number }> = []
    const cyd = formStoreData.current_year_data as
      | { year?: number; revenue?: number; ebitda?: number }
      | undefined
    if (cyd?.year && cyd.year >= 2000 && cyd.year <= 2100) {
      allYears.push({
        year: String(cyd.year),
        revenue: Number(cyd.revenue) || 0,
        ebitda: Number(cyd.ebitda) || 0,
      })
    }
    if (formStoreData.historical_years_data?.length) {
      for (const y of formStoreData.historical_years_data as any[]) {
        if (
          y.year >= 2000 &&
          y.year <= 2100 &&
          !allYears.some((existing) => existing.year === String(y.year))
        ) {
          allYears.push({
            year: String(y.year),
            revenue: Number(y.revenue) || 0,
            ebitda: Number(y.ebitda) || 0,
          })
        }
      }
    }

    return allYears.sort((a, b) => Number(b.year) - Number(a.year))
  }, [formStoreData.current_year_data, formStoreData.historical_years_data])

  // Derive financial years from the latest live form snapshot for the normalization modal.
  const financialYears = (() => {
    const years = new Set<number>([getLastFullFiscalYear()])
    getLiveYearlyFinancials().forEach((yearData) => {
      const year = Number(yearData.year)
      if (Number.isFinite(year) && year >= 2000 && year <= 2100) {
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
    if (!(getLastFullFiscalYear() in byYear)) {
      const fallbackCurrentEbitda =
        latestFormDataRef.current?.ebitda ??
        latestFormDataRef.current?.current_year_data?.ebitda ??
        formStoreData?.current_year_data?.ebitda ??
        formStoreData?.ebitda
      const parsedFallbackCurrentEbitda = Number(fallbackCurrentEbitda)
      if (Number.isFinite(parsedFallbackCurrentEbitda)) {
        byYear[getLastFullFiscalYear()] = parsedFallbackCurrentEbitda
      }
    }
    return byYear
  })()

  // For normalization modal: use REPORTED EBITDA (before adjustments), not normalized.
  // report.ebitda is the normalized value used in valuation — using it would show wrong
  // Origineel (e.g. €99K instead of €100K) and double-apply adjustments.
  const getOriginalEbitdaForDisplay = useCallback(() => {
    const year = getLastFullFiscalYear()
    return getReportedEbitdaBaseline({
      year,
      originalEBITDAByYear,
      fallbackCandidates: [
        formStoreData?.current_year_data?.ebitda,
        latestFormDataRef.current?.current_year_data?.ebitda,
        latestFormDataRef.current?.ebitda,
        (result as any)?.current_year_data?.ebitda_normalization_metadata?.reported_ebitda,
        (result as any)?.reported_ebitda,
        (report as any)?.reportedEbitda ?? (report as any)?.reported_ebitda,
      ],
    })
  }, [formStoreData?.current_year_data?.ebitda, formStoreData?.ebitda, originalEBITDAByYear, report, result])

  // ─── Modal State ───
  const [showFullscreenModal, setShowFullscreenModal] = useState(false)
  const [showInviteClientModal, setShowInviteClientModal] = useState(false)
  const [showNormalisationModal, setShowNormalisationModal] = useState(false)
  const [showUnifiedNormalizationModal, setShowUnifiedNormalizationModal] = useState(false)
  const [currentNormalisationSuggestion, setCurrentNormalisationSuggestion] =
    useState<NormalisationSuggestion | null>(null)

  // ─── Draft State ───
  const [draftStatus, setDraftStatus] = useState<'draft' | 'saved' | 'saving'>('draft')
  const [lastSaved, setLastSaved] = useState<Date | undefined>(undefined)

  // ─── Collected Data (bi-directional sync) ───
  // business_type_id = Titan API business type ID (e.g. "restaurant"); business_type = legal structure ("company")
  const formCompanyName = useManualFormStore((s) => s.formData.company_name)
  const formBusinessTypeId = useManualFormStore((s) => s.formData.business_type_id)
  const formIndustry = useManualFormStore((s) => s.formData.industry)
  const formCountry = useManualFormStore((s) => s.formData.country_code)
  const formYearFounded = useManualFormStore((s) => s.formData.founding_year)
  const formKboNumber = useManualFormStore((s) => s.formData.kbo_number)
  const formLegalForm = useManualFormStore((s) => s.formData.legal_form)
  const formCity = useManualFormStore((s) => s.formData.city)
  const formPostalCode = useManualFormStore((s) => s.formData.postal_code)
  const formNaceCode = useManualFormStore((s) => s.formData.nace_code)
  const formNaceDescription = useManualFormStore((s) => s.formData.nace_description)
  const resultCompanyName = result?.company_name
  const companyName = formCompanyName || resultCompanyName

  const formAddress = [formPostalCode, formCity].filter(Boolean).join(' ')
  const formNumber_of_employees = useManualFormStore((s) => s.formData.number_of_employees)
  const [collectedData, setCollectedData] = useState<CollectedData>({
    companyName: companyName || '',
    kboNumber: formKboNumber || '',
    legalForm: formLegalForm || '',
    businessStructure: mapLegalFormToBusinessStructure(formLegalForm || '') || undefined,
    address: formAddress || '',
    naceCode: formNaceCode || '',
    naceDescription: formNaceDescription || '',
    businessType: formBusinessTypeId || '',
    industry: formIndustry || '',
    country: formCountry || 'BE',
    yearFounded: formYearFounded ? String(formYearFounded) : '',
    ownerManagers: 1,
    fteEmployees: formNumber_of_employees,
    equityStake: 100,
  })

  /** Dirty state: user edited financial inputs after a report was generated. Reset on successful submit. */
  const [isDirty, setIsDirty] = useState(false)
  /** Snapshot of financial data from last successful submit. Used to detect edits. */
  const lastSubmittedFinancialSnapshotRef = useRef<{
    revenue?: number
    ebitda?: number
    yearlyFinancials?: Array<{ year: string; revenue: number; ebitda: number }>
  } | null>(null)

  const handleFormDataChange = useCallback(
    (data: Record<string, unknown>) => {
      latestFormDataRef.current = {
        ...latestFormDataRef.current,
        ...(data as Partial<CollectedData>),
      }
      // Mark dirty when report exists and user changed financial inputs
      if (!result) return
      const yf = (data.yearlyFinancials || []) as Array<{
        year: string
        revenue: number
        ebitda: number
      }>
      const current = yf[0]
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
      const ebitdaMatch = ebitdaNum === undefined || snapEbitda === undefined || ebitdaNum === snapEbitda
      const sortYf = (arr: Array<{ year: string; revenue: number; ebitda: number }>) =>
        [...arr].sort((a, b) => parseInt(b.year) - parseInt(a.year))
      const norm = (y: { year: string; revenue: number; ebitda: number }) => ({
        y: y.year,
        r: Number(y.revenue),
        e: Number(y.ebitda),
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
    [result]
  )

  // When report is restored (e.g. from URL) without our submit, set baseline from form store so we can detect edits
  useEffect(() => {
    if (!result || lastSubmittedFinancialSnapshotRef.current) return
    const cyd = formStoreData.current_year_data as
      | { year?: number; revenue?: number; ebitda?: number }
      | undefined
    const hy = (formStoreData.historical_years_data || []) as Array<{
      year: number
      revenue: number
      ebitda: number
    }>
    const hasFinancials =
      (cyd && ((cyd.revenue ?? 0) > 0 || (cyd.ebitda ?? 0) !== 0)) ||
      hy.some((h) => (h.revenue ?? 0) > 0 || (h.ebitda ?? 0) !== 0)
    if (!hasFinancials) return
    const allYf = [
      ...(cyd ? [{ year: String(cyd.year), revenue: cyd.revenue ?? 0, ebitda: cyd.ebitda ?? 0 }] : []),
      ...hy.map((h) => ({ year: String(h.year), revenue: h.revenue, ebitda: h.ebitda })),
    ].sort((a, b) => parseInt(b.year) - parseInt(a.year))
    lastSubmittedFinancialSnapshotRef.current = {
      revenue: cyd?.revenue ?? formStoreData.revenue,
      ebitda: cyd?.ebitda ?? formStoreData.ebitda,
      yearlyFinancials: allYf,
    }
    setIsDirty(false)
  }, [result, formStoreData.current_year_data, formStoreData.historical_years_data, formStoreData.revenue, formStoreData.ebitda])

  // Reset dirty state when switching reports
  useEffect(() => {
    lastSubmittedFinancialSnapshotRef.current = null
    setIsDirty(false)
  }, [reportId])

  // Sync form store changes into collectedData
  useEffect(() => {
    setCollectedData((prev) => {
      const next = { ...prev }
      if (companyName && companyName !== prev.companyName) next.companyName = companyName
      if ((formBusinessTypeId ?? '') !== prev.businessType)
        next.businessType = formBusinessTypeId ?? ''
      if (formIndustry && formIndustry !== prev.industry) next.industry = formIndustry
      if (formCountry && formCountry !== prev.country) next.country = formCountry
      const yearStr = formYearFounded ? String(formYearFounded) : ''
      if (yearStr && yearStr !== prev.yearFounded) next.yearFounded = yearStr
      if (formKboNumber && formKboNumber !== prev.kboNumber) next.kboNumber = formKboNumber
      if (formLegalForm && formLegalForm !== prev.legalForm) next.legalForm = formLegalForm
      const derivedBusinessStructure = mapLegalFormToBusinessStructure(formLegalForm || '')
      next.businessStructure = derivedBusinessStructure || prev.businessStructure || undefined
      if (formAddress && formAddress !== prev.address) next.address = formAddress
      if (formNaceCode && formNaceCode !== prev.naceCode) next.naceCode = formNaceCode
      if (formNaceDescription && formNaceDescription !== prev.naceDescription)
        next.naceDescription = formNaceDescription
      return next
    })
  }, [
    companyName,
    formBusinessTypeId,
    formIndustry,
    formCountry,
    formYearFounded,
    formKboNumber,
    formLegalForm,
    formAddress,
    formNaceCode,
    formNaceDescription,
  ])

  // Hydrate collectedData and form store from session when form store is empty or missing NACE/business_type
  // Ensures initialData is populated on first render so ManualInputPanel can set selectedCompany from prefill
  // Relaxed: also run when session has nace_code or business_type_id but form does not (even if form has company_name)
  useEffect(() => {
    const sessionData = (session?.sessionData || {}) as Record<string, unknown>
    const businessInfo = (sessionData._businessInfo || {}) as Record<string, unknown>
    const merged = { ...businessInfo, ...sessionData }
    const hasSessionPrefill =
      (merged.company_name as string)?.trim() ||
      (merged.companyName as string)?.trim() ||
      merged.kbo_number ||
      merged.kboNumber ||
      (merged.legal_form as string)?.trim() ||
      (merged.legalForm as string)?.trim()
    const formStoreEmpty =
      !formCompanyName?.trim() && !formKboNumber?.trim() && !formLegalForm?.trim()
    const sessionHasNace = !!(merged.nace_code || merged.naceCode)
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
    const sessionNace = (merged.nace_code || merged.naceCode) as string
    const sessionNaceDesc = (merged.nace_description || merged.naceDescription) as string
    const sessionCountry = (merged.country_code || merged.countryCode || merged.country) as string
    const sessionYear = merged.founding_year ?? merged.founded_year
    const sessionBusinessType = (merged.business_type_id ||
      merged.businessTypeId ||
      merged.business_type) as string
    const sessionIndustry = merged.industry as string
    // Skip NACE-shaped values: session may have "56.101" in business_type_id; let bootstrap/NACE lookup handle it
    const shouldUseSessionBusinessType =
      sessionBusinessType && !looksLikeNaceCode(sessionBusinessType)

    // Sync to form store: only fill missing fields to avoid overwriting user input or bootstrap data
    const formUpdates: Record<string, unknown> = {}
    if (sessionCompany && !formCompanyName?.trim()) formUpdates.company_name = sessionCompany
    if (sessionKbo && !formKboNumber?.trim()) formUpdates.kbo_number = sessionKbo
    if (sessionLegal && !formLegalForm?.trim()) formUpdates.legal_form = sessionLegal
    const sessionPostalCode = (merged.postal_code || merged.postalCode) as string
    const sessionCity = merged.city as string
    if (sessionPostalCode && !formPostalCode?.trim()) formUpdates.postal_code = sessionPostalCode
    if (sessionCity && !formCity?.trim()) formUpdates.city = sessionCity
    if (sessionNace && !formNaceCode?.trim()) formUpdates.nace_code = sessionNace
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
    session?.sessionData,
    formCompanyName,
    formKboNumber,
    formLegalForm,
    formNaceCode,
    formBusinessTypeId,
    formPostalCode,
    formCity,
    formYearFounded,
    formIndustry,
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

  // Enable auto-persist for tax latency store
  useEffect(() => {
    const unsub = enableTaxLatencyAutoPersist(() => reportId || undefined)
    return unsub
  }, [reportId])

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  const versions = useVersionHistoryStore(
    (s) => s.versions[resolvedReportId || reportId] || []
  )
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current')

  // NOTE: Version fetching is owned by HistoryPanel (single owner pattern).
  // Do NOT fetch here to avoid duplicate API calls and race conditions.

  // Map versions to CalculatorNav format
  const versionHistoryForNav = React.useMemo(() => {
    if (versions.length === 0 && report) {
      return [
        {
          id: 'current',
          label: t('currentVersion'),
          priceRange: {
            min: Math.round(report.valuation * 0.85),
            max: Math.round(report.valuation * 1.15),
          },
          askPrice: report.valuation,
          timestamp: report.generatedAt,
          isActive: true,
        },
      ]
    }
    return versions.map((v) => {
      const vr = v.valuationResult as any
      const mid = Number(
        vr?.valuation_midpoint ||
          vr?.equity_value_mid ||
          vr?.details?.valuation_midpoint ||
          vr?.details?.equity_value_mid ||
          0
      )
      const low = Number(
        vr?.valuation_min ||
          vr?.equity_value_low ||
          vr?.details?.valuation_min ||
          vr?.details?.equity_value_low ||
          0
      )
      const high = Number(
        vr?.valuation_max ||
          vr?.equity_value_high ||
          vr?.details?.valuation_max ||
          vr?.details?.equity_value_high ||
          0
      )
      const ask = Number(
        vr?.recommended_asking_price || vr?.details?.recommended_asking_price || mid || 0
      )
      return {
        id: v.id,
        label: v.versionLabel,
        priceRange: { min: low, max: high },
        askPrice: ask,
        timestamp: v.createdAt,
        isActive: v.isActive,
      }
    })
  }, [versions, report])

  const handleSelectVersion = useCallback(
    (id: string) => {
      setSelectedVersionId(id)
      const version = versions.find((v) => v.id === id)
      if (version?.valuationResult) {
        const enrichedResult = {
          ...version.valuationResult,
          html_report: version.valuationResult.html_report || version.htmlReport || undefined,
        }
        setResult(enrichedResult)
        toast.info(t('versionLoaded', { label: version.versionLabel }))
      }
    },
    [versions, setResult]
  )

  // ─── Bridge: Result from Venus API → Report for Clarity components ───
  useEffect(() => {
    if (result) {
      onComplete(result)

      const r = result as any
      const equityMid =
        Number(r.equity_value_mid ?? r.valuation_midpoint ?? r.details?.equity_value_mid) || 0
      const equityLow =
        Number(r.equity_value_low ?? r.valuation_min ?? r.details?.equity_value_low) || 0
      const equityHigh =
        Number(r.equity_value_high ?? r.valuation_max ?? r.details?.equity_value_high) || 0
      const ebitda = Number(r.current_year_data?.ebitda) || 0
      const normalizedEbitda = Number(r.latest_normalized_ebitda) || ebitda
      const revenue = r.current_year_data?.revenue || 0
      const ebitdaMultiple = r.multiples_valuation?.ebitda_multiple || 0
      const p25 = r.multiples_valuation?.p25_ebitda_multiple
      const p75 = r.multiples_valuation?.p75_ebitda_multiple
      const confidence = (r.overall_confidence ?? r.details?.overall_confidence)?.toLowerCase() as
        | 'high'
        | 'medium'
        | 'low'
        | undefined

      const askingPrice =
        Number(r.recommended_asking_price ?? r.details?.recommended_asking_price) || 0
      const htmlReport = r.html_report ?? r.details?.html_report

      setReport({
        id: reportId || r.valuation_id || r.id || 'draft',
        companyName: r.company_name ?? r.business_name ?? tReport('defaultCompanyName'),
        valuation: equityMid,
        valuationLow: equityLow || undefined,
        valuationHigh: equityHigh || undefined,
        ebitda,
        normalizedEbitda: normalizedEbitda || undefined,
        multiple: ebitdaMultiple,
        multipleRange: p25 != null && p75 != null ? { low: p25, high: p75 } : undefined,
        generatedAt: new Date(),
        confidenceLevel: confidence || 'medium',
        htmlReport: htmlReport || undefined,
        recommendedAskingPrice: askingPrice || undefined,
        metrics: [
          { label: tReport('metrics.avgRevenue'), value: `€${(revenue / 1_000_000).toFixed(2)}M` },
          {
            label: tReport('metrics.ebitdaMargin'),
            value: revenue ? `${((ebitda / revenue) * 100).toFixed(1)}%` : '—',
          },
          {
            label: tReport('metrics.sector'),
            value: r.business_type ?? r.details?.business_type ?? tReport('defaultSector'),
          },
        ],
      })
      setDraftStatus('saved')
      setLastSaved(new Date())

      setRightPanelView('preview')

      // On mobile, auto-open fullscreen modal since there's no right panel
      if (isMobile && htmlReport) {
        setShowFullscreenModal(true)
      }

      if (reportId && htmlReport) {
        generatePdf?.().catch((err) => {
          generalLogger.warn('[ManualLayout] Background PDF generation failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
    }
  }, [result, onComplete, reportId, generatePdf, isMobile, tReport])

  // Store last submitted data for retry capability
  const lastSubmittedDataRef = useRef<any>(null)

  // ─── Recalculation Confirmation Modal (intercept CTA when changes detected) ───
  const [showRecalculateConfirmation, setShowRecalculateConfirmation] = useState(false)
  const pendingSubmitDataRef = useRef<any>(null)
  const pendingPopupFlagsRef = useRef<{ hasFormChanges: boolean; hasNormalizations: boolean }>({
    hasFormChanges: false,
    hasNormalizations: false,
  })
  const recalculateConfirmationOpenRef = useRef(false)
  const submitInProgressRef = useRef(false)

  // ─── Manual Form Submit Handler (REAL - wired to Venus services) ───
  const handleManualSubmit = useCallback(
    async (data: any) => {
      // Validation
      if (!data.companyName?.trim()) {
        toast.error(t('companyNameMissing'), { description: t('companyNameMissingDesc') })
        return
      }
      if (!data.businessType?.trim()) {
        toast.error(t('businessTypeMissing'), { description: t('businessTypeMissingDesc') })
        return
      }
      if (
        !data.yearlyFinancials?.some(
          (yf: any) =>
            Number(yf.revenue) > 0 &&
            yf.ebitda !== '' &&
            yf.ebitda !== null &&
            yf.ebitda !== undefined &&
            Number.isFinite(Number(yf.ebitda))
        )
      ) {
        toast.error(t('financialDataIncomplete'), { description: t('financialDataIncompleteDesc') })
        return
      }

      // Prevent double submission
      const wasSet = trySetCalculating()
      if (!wasSet) return

      // Store for retry capability
      lastSubmittedDataRef.current = data

      setIsGenerating(true)

      // Sync collected data for UI (incl. fteEmployees for restore/0 FTE owner-only)
      setCollectedData({
        companyName: data.companyName,
        businessType: data.businessType,
        industry: data.industry,
        country: data.country,
        yearFounded: data.yearFounded,
        ownerManagers: data.ownerManagers,
        fteEmployees: data.fteEmployees,
        equityStake: data.equityStake,
      })

      try {
        // Step 1: Map ManualInputPanel form data → Venus store format
        const venusFormData = mapClarityFormToVenusStore(data)
        updateFormData(venusFormData)

        // Step 2: Build API request from store
        const storeSnapshot = { ...formStoreData, ...venusFormData }
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildValuationRequest(storeSnapshot, undefined, validLocale as 'nl' | 'en')
        ;(request as any).dataSource = 'manual'
        const idForApi = resolvedReportId || reportId
        if (idForApi) (request as any).reportId = idForApi

        // Step 3: Detect version changes for M&A workflow (use resolved UUID for version API)
        let previousVersion: any = null
        let changes: any = null
        if (idForApi) {
          previousVersion = getLatestVersion(idForApi)
          if (previousVersion) {
            changes = detectVersionChanges(previousVersion.formData, request)
            generalLogger.info('Regeneration detected', {
              reportId,
              previousVersion: previousVersion.versionNumber,
              totalChanges: changes.totalChanges,
            })
          }
        }

        // Step 3.5: Persist all normalizations to Titan BEFORE calculation (UX-critical)
        if (idForApi) {
          const persistOk = await persistNormalizationsBeforeCalculate(idForApi, request as any)
          if (!persistOk) {
            setCalculating(false)
            setIsGenerating(false)
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

        if (!calcResult) {
          setCalculating(false)
          setIsGenerating(false)
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

        // Step 5: Store result (triggers useEffect bridge → report state)
        setResult(calcResult)
        setCalculating(false)
        setIsGenerating(false)
        setDraftStatus('saved')
        setLastSaved(new Date())
        setIsDirty(false)
        const cyd = (request as any).current_year_data
        const hy = (request as any).historical_years_data || []
        const allYf = [
          ...(cyd ? [{ year: String(cyd.year), revenue: cyd.revenue, ebitda: cyd.ebitda }] : []),
          ...hy.map((h: any) => ({ year: String(h.year), revenue: h.revenue, ebitda: h.ebitda })),
        ]
          .filter((y: any) => y.revenue > 0 || y.ebitda !== 0)
          .sort((a: any, b: any) => parseInt(b.year) - parseInt(a.year))
        lastSubmittedFinancialSnapshotRef.current = {
          revenue: cyd?.revenue ?? (request as any).revenue,
          ebitda: cyd?.ebitda ?? (request as any).ebitda,
          yearlyFinancials: allYf,
        }

        // Step 6: Create version (M&A workflow)
        // Titan creates V1 automatically during the calculate call.
        // Venus only creates a NEW version when there was already a previous version
        // BEFORE this calculation started AND the user made significant changes.
        let versionCreationFailed = false
        if (idForApi) {
          let latestAfterFetch: { versionNumber: number } | null = null
          try {
            await useVersionHistoryStore.getState().fetchVersions(idForApi)
            latestAfterFetch = useVersionHistoryStore.getState().getLatestVersion(idForApi)
          } catch (fetchErr) {
            const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
            generalLogger.warn('[ManualLayout] fetchVersions failed', { reportId: idForApi, error: fetchMsg })
            toast.warning(tHistory('loadError'), { description: fetchMsg })
            // Continue - calculation succeeded; versions may be stale
          }

          if (latestAfterFetch !== null) {
            try {
            // Log regeneration when Titan created version (first calculation)
            if (!previousVersion && latestAfterFetch) {
              valuationAuditService.logRegeneration(
                idForApi,
                latestAfterFetch.versionNumber,
                { totalChanges: 0, significantChanges: [] },
                calculationDuration,
                user?.id
              )
            }

            if (previousVersion) {
              // Re-calculation: a version existed BEFORE we called calculate.
              // Titan created a new version server-side. Check if Venus should
              // also snapshot (only if the changes are significant vs the pre-calc state).
              const effectivePrevious = latestAfterFetch ?? previousVersion
              const effectiveChanges = detectVersionChanges(previousVersion.formData, request)

              // Log when Titan created new version (effectivePrevious > previousVersion)
              if (effectivePrevious.versionNumber > previousVersion.versionNumber) {
                valuationAuditService.logRegeneration(
                  idForApi,
                  effectivePrevious.versionNumber,
                  effectiveChanges,
                  calculationDuration,
                  user?.id
                )
              }

              // Only create a Venus-side version when there are significant form-data changes
              // relative to the version that existed BEFORE the calculation.
              if (
                areChangesSignificant(effectiveChanges) &&
                effectivePrevious.versionNumber === previousVersion.versionNumber
              ) {
                const newVersion = await createVersion({
                  reportId: idForApi,
                  formData: request,
                  valuationResult: calcResult,
                  htmlReport: calcResult.html_report || undefined,
                  changesSummary: effectiveChanges,
                  versionLabel: generateAutoLabel(
                    effectivePrevious.versionNumber + 1,
                    effectiveChanges
                  ),
                })
                await snapshotNormalizationsToVersion(idForApi, newVersion.id)

                // Log regeneration to audit trail (accountant compliance)
                valuationAuditService.logRegeneration(
                  idForApi,
                  newVersion.versionNumber,
                  effectiveChanges,
                  calculationDuration,
                  user?.id
                )
              }
            }
            // else: first calculation — Titan already created V1, nothing to do
            } catch (versionError) {
              versionCreationFailed = true
              const errMsg =
                versionError instanceof Error ? versionError.message : String(versionError)
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
              // Continue to save report - calculation succeeded, persist it
            }
          }

          // Always re-sync version history from backend after calculation so panels show latest
          setTimeout(() => {
            useVersionHistoryStore
              .getState()
              .fetchVersions(idForApi)
              .catch((err) => {
                generalLogger.warn('[ManualLayout] Version history sync failed', {
                  error: err instanceof Error ? err.message : String(err),
                })
                toast.warning(tHistory('loadError'), {
                  description: err instanceof Error ? err.message : undefined,
                })
              })
          }, 1500)
        }

        // Step 7: Save complete report package to backend
        if (idForApi) {
          try {
            await reportService.saveReportAssets(idForApi, {
              sessionData: storeSnapshot,
              valuationResult: calcResult,
              htmlReport: calcResult.html_report || undefined,
              name: sessionName,
            })
            useSessionStore.getState().markSaved()
          } catch (saveError) {
            const errMsg =
              saveError instanceof Error ? saveError.message : String(saveError)
            generalLogger.error('[ManualLayout] Failed to save report assets', {
              reportId: idForApi,
              error: errMsg,
            })
            toast.error(tReport('saveReportFailed'), {
              description: errMsg,
            })
          }
        }

        if (!versionCreationFailed) {
          toast.success(t('calculationComplete'))
        }
      } catch (error) {
        setCalculating(false)
        setIsGenerating(false)
        const isSessionExpired =
          error instanceof AuthenticationError || isAuthError(error)
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
    ]
  )

  // ─── Wrapped Submit: Intercept to show RecalculateConfirmationPopup when changes detected ───
  const hasAnyNormalization = normalizationItems.some((n) => n.status === 'accepted')
  const currentVersion = resolvedReportId ? getLatestVersion(resolvedReportId) : null
  const currentVersionNumber = currentVersion?.versionNumber ?? 0
  const hasExistingValuation = hasExistingValuationVersion(currentVersion)

  const wrappedOnSubmit = useCallback(
    async (data: any) => {
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
          generalLogger.info('[ManualLayout] Dirty state detected, showing recalculation confirmation', {
            isDirty,
            currentVersionNumber,
          })
          pendingSubmitDataRef.current = data
          pendingPopupFlagsRef.current = { hasFormChanges: true, hasNormalizations: hasAnyNormalization }
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
        await useVersionHistoryStore.getState().fetchVersions(idForVersions).catch((err) => {
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
        const venusFormData = mapClarityFormToVenusStore(data)
        const storeSnapshot = { ...formStoreData, ...venusFormData }
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildValuationRequest(storeSnapshot, undefined, validLocale as 'nl' | 'en')
        ;(request as any).dataSource = 'manual'
        ;(request as any).reportId = idForVersions

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
          generalLogger.info('[ManualLayout] Changes detected, showing recalculation confirmation', {
            hasFormChanges,
            hasAnyNormalization,
            currentVersionNumber: previousVersion.versionNumber,
          })
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
      showRecalculateConfirmation,
      hasExistingValuation,
      currentVersionNumber,
      formStoreData,
      currentLocale,
      getLatestVersion,
      handleManualSubmit,
      hasAnyNormalization,
      tHistory,
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
    (field: string, value: any) => {
      const fieldToDataKey: Record<string, string> = {
        business_type_id: 'businessType',
        nace_code: 'naceCode',
        nace_description: 'naceDescription',
        company_name: 'companyName',
        kbo_number: 'kboNumber',
        legal_form: 'legalForm',
        country_code: 'country',
        founding_year: 'yearFounded',
        address: 'address',
        ownerManagers: 'ownerManagers',
        number_of_employees: 'fteEmployees',
        fteEmployees: 'fteEmployees',
        equityStake: 'equityStake',
      }
      const dataKey = fieldToDataKey[field] ?? field
      // Address fields (postal_code, city) update form store only; collectedData syncs via form store
      const isAddressOnlyField =
        field === 'postal_code' || field === 'postalCode' || field === 'city'
      if (!isAddressOnlyField) {
        setCollectedData((prev) => ({ ...prev, [dataKey]: value }))
      }
      // Sync to form store so form store stays in sync with chat/AI updates
      const strVal = typeof value === 'string' ? value.trim() : ''
      const hasStr = strVal.length > 0
      const yearVal = typeof value === 'number' ? value : parseInt(String(value), 10)
      const hasYear = !Number.isNaN(yearVal)

      if (field === 'businessType' || field === 'business_type_id') {
        if (hasStr) updateFormData({ business_type_id: strVal })
      } else if (field === 'nace_code' || field === 'naceCode') {
        if (hasStr) updateFormData({ nace_code: strVal })
      } else if (field === 'nace_description' || field === 'naceDescription') {
        if (hasStr) updateFormData({ nace_description: strVal })
      } else if (field === 'company_name' || field === 'companyName') {
        if (hasStr) updateFormData({ company_name: strVal })
      } else if (field === 'kbo_number' || field === 'kboNumber') {
        if (hasStr) updateFormData({ kbo_number: strVal })
      } else if (field === 'legal_form' || field === 'legalForm') {
        if (hasStr) updateFormData({ legal_form: strVal })
      } else if (field === 'country_code' || field === 'country') {
        if (hasStr) updateFormData({ country_code: strVal })
      } else if (field === 'founding_year' || field === 'yearFounded') {
        if (hasYear) updateFormData({ founding_year: yearVal })
      } else if (field === 'industry') {
        if (hasStr) updateFormData({ industry: strVal })
      } else if (field === 'postal_code' || field === 'postalCode') {
        if (hasStr) updateFormData({ postal_code: strVal })
      } else if (field === 'city') {
        if (hasStr) updateFormData({ city: strVal })
      } else if (field === 'address') {
        if (hasStr) {
          // Belgian format often "1234 City" - try to split postal code from city
          const match = strVal.match(/^(\d{4})\s+(.+)$/)
          if (match) {
            updateFormData({ postal_code: match[1], city: match[2].trim() })
          } else {
            updateFormData({ city: strVal })
          }
        }
      } else if (field === 'ownerManagers' || field === 'owner_managers') {
        const n = typeof value === 'number' ? value : parseInt(String(value), 10)
        if (!Number.isNaN(n) && n >= 0) updateFormData({ number_of_owners: n })
      } else if (field === 'fteEmployees' || field === 'number_of_employees') {
        const n = typeof value === 'number' ? value : parseInt(String(value), 10)
        if (!Number.isNaN(n) && n >= 0) updateFormData({ number_of_employees: n })
      } else if (field === 'equityStake' || field === 'equity_stake') {
        const n = typeof value === 'number' ? value : parseInt(String(value), 10)
        if (!Number.isNaN(n) && n >= 0 && n <= 100) updateFormData({ shares_for_sale: n })
      }
      const currencyLocale = currentLocale === 'en' ? 'en-BE' : 'nl-BE'
      toast.success(
        t('fieldUpdated', {
          field,
          value:
            typeof value === 'number' ? `€${value.toLocaleString(currencyLocale)}` : String(value),
        })
      )
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: t('fieldApplied', { field }),
          timestamp: new Date(),
        },
      ])
    },
    [updateFormData, currentLocale, t]
  )

  const handleChatMessage = useCallback(
    async (
      content: string,
      attachments?: File[],
      detectedValues?: any[],
      parsedCommands?: any[]
    ) => {
      if (isLoadingHistory) return

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
        attachments: attachments?.map((f) => ({
          name: f.name,
          type: f.type,
          url: URL.createObjectURL(f),
        })),
      }
      setChatMessages((prev) => [...prev, userMessage])
      setIsChatGenerating(true)

      try {
        // Handle parsed commands (local, no AI call needed)
        if (parsedCommands?.length) {
          parsedCommands.forEach((cmd: any) => handleApplyFieldUpdate(cmd.field, cmd.value))
          await new Promise((r) => setTimeout(r, 500))
          const currencyLocale = currentLocale === 'en' ? 'en-BE' : 'nl-BE'
          const commandsList = parsedCommands
            .map((cmd: any) => `- **${cmd.label}** → €${cmd.value.toLocaleString(currencyLocale)}`)
            .join('\n')
          setChatMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: `${t('normApplied')}\n\n${commandsList}`,
              timestamp: new Date(),
            },
          ])
          setIsChatGenerating(false)
          return
        }

        if (detectedValues?.length) {
          setPendingUpdates((prev) => [
            ...prev,
            ...detectedValues.map((dv: any) => ({
              field: dv.field,
              value: dv.value,
              label: dv.label,
            })),
          ])
        }

        // Build enriched context for Claude
        const accepted = normalizationItems.filter((n) => n.status === 'accepted')
        const pending = normalizationItems.filter((n) => n.status === 'pending')
        const totalAdjustment = accepted.reduce((sum, n) => sum + n.adjustment, 0)
        const categories = [...new Set(normalizationItems.map((n) => n.category))]
        const formFields = Object.entries(collectedData).filter(
          ([, v]) => v !== '' && v !== undefined && v !== null
        )
        const formCompletenessScore = Math.round((formFields.length / 7) * 100)
        const versions = (resolvedReportId || reportId)
          ? useVersionHistoryStore.getState().versions[resolvedReportId || reportId] || []
          : []

        const latestFinancials = latestFormDataRef.current
        const enrichedFormData = {
          ...collectedData,
          revenue: latestFinancials.revenue ?? collectedData.revenue,
          ebitda: latestFinancials.ebitda ?? collectedData.ebitda,
          yearlyFinancials: latestFinancials.yearlyFinancials ?? collectedData.yearlyFinancials,
          current_year_data: latestFinancials.current_year_data ?? collectedData.current_year_data,
          _normalizationSummary: {
            total: normalizationItems.length,
            accepted: accepted.length,
            pending: pending.length,
            totalAdjustment,
            categories,
          },
          _formCompleteness: formCompletenessScore,
          _versionCount: versions.length,
        }

        const { aiChatService } = await import('../../../services/ai/AIChatService')

        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const aiRequest = {
          message: content,
          sessionId: reportId || undefined,
          reportId: reportId || undefined,
          companyName: collectedData.companyName,
          conversationId: conversationStore.conversationId || undefined,
          fieldContext: fieldContext || undefined,
          normalizations: normalizationItems,
          formData: enrichedFormData,
          locale: validLocale as 'en' | 'nl',
          history: chatMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-10)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        }

        // Use streaming for real-time response + tool indicators
        const streamingMsgId = crypto.randomUUID()
        let streamedContent = ''

        setChatMessages((prev) => [
          ...prev,
          { id: streamingMsgId, role: 'assistant' as const, content: '', timestamp: new Date() },
        ])

        if (streamCleanupRef.current) {
          streamCleanupRef.current()
          streamCleanupRef.current = null
        }

        streamCleanupRef.current = aiChatService.streamMessage(aiRequest, {
          onText: (text) => {
            streamedContent += text
            setChatMessages((prev) =>
              prev.map((m) => (m.id === streamingMsgId ? { ...m, content: streamedContent } : m))
            )
          },
          onToolStart: (toolName) => {
            conversationStore.setToolInProgress(toolName)
          },
          onToolResult: (_toolName, _result) => {
            conversationStore.setToolInProgress(null)
          },
          onDone: (responseConversationId) => {
            streamCleanupRef.current = null
            conversationStore.setToolInProgress(null)
            setIsChatGenerating(false)

            if (responseConversationId && !conversationStore.conversationId) {
              conversationStore.setConversationId(responseConversationId)
            }
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
                if (aiResponse.conversationId && !conversationStore.conversationId) {
                  conversationStore.setConversationId(aiResponse.conversationId)
                }

                setChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? {
                          ...m,
                          content: aiResponse.content,
                          fieldUpdates: aiResponse.fieldUpdates,
                          normalisationSuggestions: aiResponse.normalisationSuggestions?.map(
                            (s: any) => ({
                              ...s,
                              id: crypto.randomUUID(),
                              status: 'pending',
                              multiple: 5.2,
                            })
                          ),
                        }
                      : m
                  )
                )

                if (aiResponse.fallback) {
                  toast.info(t('aiUnavailable'), {
                    description: t('aiUnavailableDesc'),
                    duration: 4000,
                  })
                }
                if (aiResponse.fieldUpdates) {
                  setPendingUpdates((prev) => [...prev, ...aiResponse.fieldUpdates!])
                }
                handleNormalisationSuggestions(aiResponse.normalisationSuggestions)
              })
              .catch(() => {
                setChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId ? { ...m, content: t('chatError'), isError: true } : m
                  )
                )
                setIsChatGenerating(false)
              })
          },
        })
      } catch {
        conversationStore.setToolInProgress(null)
        setChatMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: t('chatError'),
            isError: true,
            timestamp: new Date(),
          },
        ])
        setIsChatGenerating(false)
      }
    },
    [
      collectedData,
      handleApplyFieldUpdate,
      reportId,
      fieldContext,
      normalizationItems,
      chatMessages,
      conversationStore,
      isLoadingHistory,
      currentLocale,
    ] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // AI suggestions: add as pending; Titan persist happens on accept (handleAcceptNormalisation)
  const handleNormalisationSuggestions = useCallback(
    (suggestions: any[] | undefined) => {
      if (!suggestions?.length) return
      const newItems: NormalizationItem[] = suggestions.map((s: any) => ({
        id: crypto.randomUUID(),
        ledgerCode: s.ledgerCode || '',
        ledgerName: s.description,
        category: mapBackendCategoryToFrontend(s.category) || 'other',
        type: (s.isAddback ? 'add' : 'subtract') as 'add' | 'subtract',
        value: Math.abs(s.amount),
        adjustment: s.amount,
        reason: s.reason,
        source: 'ai' as any,
        sourceRef: 'Claude AI',
        status: 'pending' as any,
        applyAllYears: false,
        year: new Date().getFullYear() - 1,
      }))
      normalizationActions.addItems(newItems)
      if (reportId) normalizationActions.persistToSession(reportId)
      setSuggestedNormalisations((prev: any[]) => [
        ...prev,
        ...newItems.map((n) => ({
          id: n.id,
          code: n.ledgerCode,
          description: n.ledgerName,
          category: n.category,
          amount: n.adjustment,
          reason: n.reason,
          sourceRef: 'Claude AI',
          status: 'pending',
        })),
      ])
    },
    [normalizationActions, reportId]
  ) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcceptUpdate = useCallback((field: string) => {
    trackAIFieldUpdate()
    setPendingUpdates((prev) => prev.filter((u) => u.field !== field))
  }, [])

  const handleRejectUpdate = useCallback((field: string) => {
    setPendingUpdates((prev) => prev.filter((u) => u.field !== field))
    toast.info(t('suggestionRejected'))
  }, [])

  // Retry a failed assistant message by resending the preceding user message
  const handleRetry = useCallback(
    (errorMessageId: string) => {
      if (isChatGenerating || isLoadingHistory) return
      const msgIndex = chatMessages.findIndex((m) => m.id === errorMessageId)
      if (msgIndex < 0) return
      // Abort any lingering stream
      if (streamCleanupRef.current) {
        streamCleanupRef.current()
        streamCleanupRef.current = null
      }
      // Find the user message that preceded the error
      let userMessage: string | undefined
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (chatMessages[i].role === 'user') {
          userMessage = chatMessages[i].content
          break
        }
      }
      if (!userMessage) return
      // Remove the error message
      setChatMessages((prev) => prev.filter((m) => m.id !== errorMessageId))
      // Resend
      handleChatMessage(userMessage)
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

  // ─── Export Handler (server-side only — no client-side fallbacks) ───
  const handleExport = useCallback(async () => {
    if (!report) return
    setIsExporting(true)

    const filename = `${report.companyName?.replace(/\s+/g, '-') || tReport('defaultFilename')}-Schattingsrapport.pdf`

    try {
      if (isPdfReady) {
        await downloadPdf(undefined, filename)
      } else if (resolvedReportId || reportId) {
        const idForPdf = resolvedReportId || reportId
        toast.loading(t('pdfGenerating'), { id: 'pdf-gen' })
        const pdfUrl = await generatePdf()
        if (pdfUrl) {
          toast.dismiss('pdf-gen')
          await downloadPdf(undefined, filename)
        } else {
          // Async path: PDF is generating in background. Poll until ready or timeout.
          const maxWaitMs = 120_000
          const pollIntervalMs = 2_000
          let elapsed = 0
          while (elapsed < maxWaitMs) {
            const res = await fetch(`/api/valuations/${idForPdf}/pdf`, {
              method: 'GET',
              credentials: 'include',
            })
            const data = res.ok ? await res.json().catch(() => null) : null
            if (data?.status === 'ready' && data?.pdfUrl) {
              toast.dismiss('pdf-gen')
              await downloadPdf(undefined, filename)
              break
            }
            await new Promise((r) => setTimeout(r, pollIntervalMs))
            elapsed += pollIntervalMs
          }
          if (elapsed >= maxWaitMs) {
            toast.dismiss('pdf-gen')
            toast.error(t('pdfExportFailed'), {
              description: t('pdfExportFailedDesc'),
            })
            return
          }
        }
      } else {
        toast.error(t('pdfExportFailed'), {
          description: t('pdfExportFailedDesc'),
        })
        return
      }

      setDownloadHistory((prev) => [
        {
          id: crypto.randomUUID(),
          fileName: filename,
          timestamp: new Date(),
          size: 'PDF',
        },
        ...prev,
      ])
      toast.success(t('pdfDownloaded'))
    } catch (error) {
      toast.dismiss('pdf-gen')
      generalLogger.error('[ManualLayout] PDF export failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(t('pdfExportFailed'), { description: t('pdfExportFailedDesc') })
    } finally {
      setIsExporting(false)
    }
  }, [report, reportId, resolvedReportId, isPdfReady, downloadPdf, generatePdf, tReport])

  // ─── Navigation Handlers ───
  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleExitClientView = useCallback(() => {
    try {
      import('../../../stores/clientContext')
        .then(({ useClientContext }) => {
          const ctx = useClientContext.getState()
          ctx.clearClientContext()
        })
        .catch((err) => {
          generalLogger.warn('[ManualLayout] Client context cleanup failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        })

      // Try to close embedded mode (sends postMessage to parent)
      try {
        window.parent?.postMessage({ type: 'venus-close', source: 'venus' }, '*')
      } catch {}

      const validLocale =
        currentLocale && (currentLocale === 'en' || currentLocale === 'nl') ? currentLocale : 'en'
      let returnUrl: string | null = null
      let sourceApp: string | null = null
      try {
        returnUrl = sessionStorage.getItem('upswitch_return_url')
        sourceApp = sessionStorage.getItem('upswitch_source')
      } catch {}

      const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
        clientContextId: clientContextId ?? undefined,
        locale: validLocale,
        sourceApp: sourceApp ?? undefined,
      })
      window.location.href = targetUrl
    } catch (error) {
      generalLogger.error('[ManualLayout] handleExitClientView failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        window.location.href = `${getMercuryUrl()}/en/accountant/dashboard`
      } catch {}
    }
  }, [clientContextId, currentLocale])

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
  const [rawRecentValuations, setRawRecentValuations] = useState<
    Array<{ id: string; companyName: string; updatedAt: Date; isDraft?: boolean }>
  >([])

  const fetchRecentValuations = useCallback(() => {
    const headers: HeadersInit = {}
    try {
      const ctx = useClientContext.getState()
      if (ctx.isActingAsClient && ctx.getContextHeaders) {
        Object.assign(headers, ctx.getContextHeaders())
      }
    } catch {
      /* clientContext not available */
    }

    fetch('/api/reports?limit=5&offset=0', {
      credentials: 'include',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    })
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data) => {
        const reports = data.reports || data.data || data.items || data.sessions || []
        setRawRecentValuations(
          (Array.isArray(reports) ? reports : []).slice(0, 5).map((r: any) => ({
            id: r.id || r.report_id || r.reportId,
            companyName:
              r.company_name || r.companyName || r.name || t('unnamed'),
            updatedAt: new Date(r.updated_at || r.updatedAt || r.created_at || Date.now()),
            isDraft: r.status === 'draft' || r.status === 'in_progress',
          }))
        )
      })
      .catch((err) => {
        generalLogger.warn('[ManualLayout] Failed to load recent valuations', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, [t])

  useEffect(() => {
    fetchRecentValuations()
  }, [fetchRecentValuations])

  // Augment with current session when it's not in the reports list (e.g. pre-first-calculation or session_key vs UUID)
  // CRITICAL: Always show current valuation in dropdown - prevents "Geen recente schattingen" when viewing one
  // Prefer session.reportId (UUID) over session.key - Titan returns UUIDs, session key causes 404
  const recentValuations = useMemo(() => {
    const currentId =
      session?.reportId ||
      (reportId && reportId !== 'new' ? reportId : null) ||
      (session as any)?.key
    const idForMatch = resolvedReportId || currentId
    const inList =
      idForMatch &&
      rawRecentValuations.some(
        (v) =>
          v.id === idForMatch ||
          v.id === currentId ||
          v.id === session?.reportId ||
          v.id === (session as any)?.key ||
          v.id === reportId ||
          v.id === resolvedReportId
      )
    // Prepend when: we have a current report (reportId or report) and it's not in the list
    const shouldPrepend =
      (currentId || (reportId && reportId !== 'new') || report) && !inList
    if (shouldPrepend && (currentId || reportId)) {
      const companyName =
        report?.companyName?.trim() ||
        collectedData.companyName?.trim() ||
        session?.name ||
        (isAccountantFlow && identity.clientContext?.clientCompanyName?.trim()) ||
        t('unnamed')
      const updatedAt =
        session?.updatedAt instanceof Date
          ? session.updatedAt
          : session?.createdAt instanceof Date
            ? session.createdAt
            : report?.generatedAt instanceof Date
              ? report.generatedAt
              : new Date()
      const prependedId = session?.reportId || resolvedReportId || currentId || reportId
      return [
        { id: prependedId, companyName, updatedAt, isDraft: !report },
        ...rawRecentValuations,
      ]
    }
    return rawRecentValuations
  }, [
    rawRecentValuations,
    reportId,
    resolvedReportId,
    session?.reportId,
    (session as any)?.key,
    session?.name,
    session?.updatedAt,
    session?.createdAt,
    collectedData.companyName,
    isAccountantFlow,
    identity.clientContext?.clientCompanyName,
    report,
    t,
  ])

  const handleNewValuation = useCallback(() => {
    setShowNewValuationModal(true)
  }, [])

  const handleConfirmNewValuation = useCallback(() => {
    setIsConfirmingNewValuation(true)
    const prefilled =
      collectedData.companyName?.trim() ||
      (isAccountantFlow && identity.clientContext?.clientCompanyName?.trim())
    try {
      // Store current form data for prefill on new valuation (business + financials)
      try {
        const formData = useManualFormStore.getState().formData
        const normItems = useNormalizationStore.getState().items.filter((n) => n.status === 'accepted')
        const prefillPayload: Record<string, unknown> = {
          ...formData,
          _fromNewValuation: true,
          _normCount: normItems.length,
        }
        // Exclude large/blob and non-serializable fields
        delete (prefillPayload as any).html_report
        delete (prefillPayload as any).valuation_result
        // Safe stringify: skip functions, undefined, symbols
        const json = JSON.stringify(prefillPayload, (_, v) =>
          typeof v === 'function' || typeof v === 'symbol' ? undefined : v
        )
        if (json && json.length < 500_000) {
          sessionStorage.setItem('venus_new_valuation_prefill', json)
        }
      } catch {
        /* sessionStorage unavailable or serialization failed */
      }
      // Reset all local state so user can start fresh without being stuck
      useSessionStore.getState().clearSession()
      useManualFormStore.getState().resetForm()
      useManualResultsStore.getState().clearResults()
      useManualResultsStore.getState().setCalculating(false)
      useNormalizationStore.getState().clear()
      useTaxLatencyStore.getState().clear()
      if (reportId) useVersionHistoryStore.getState().clearVersions(reportId)
      setShowNewValuationModal(false)
      // Use full page navigation to ensure clean slate and UI unlock (avoids skeleton trap)
      const baseUrl = `/${currentLocale}/reports/new`
      const params = new URLSearchParams()
      if (prefilled) params.set('prefilledQuery', prefilled)
      // Preserve accountant client context so new valuation stays linked to same client
      const ctx = useClientContext.getState()
      const relId = clientContextId ?? ctx?.relationshipId
      if ((isAccountantMode || ctx?.isActingAsClient) && relId) {
        params.set('clientId', relId)
      }
      // Preserve other context from current URL (clientToken, return_url, source)
      if (typeof window !== 'undefined') {
        const current = new URLSearchParams(window.location.search)
        for (const key of ['clientToken', 'return_url', 'source', 'flow', 'mode']) {
          const v = current.get(key)
          if (v && !params.has(key)) params.set(key, v)
        }
      }
      const fullUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl
      window.location.href = fullUrl
    } finally {
      setIsConfirmingNewValuation(false)
    }
  }, [
    currentLocale,
    reportId,
    collectedData.companyName,
    isAccountantFlow,
    identity.clientContext?.clientCompanyName,
    isAccountantMode,
    clientContextId,
  ])

  const handleSelectValuation = useCallback(
    (id: string) => {
      router.push(`/${currentLocale}/reports/${id}`)
    },
    [router, currentLocale]
  )

  const [deletingValuationId, setDeletingValuationId] = useState<string | null>(null)
  const deleteInProgressRef = useRef<string | null>(null)

  const handleDeleteValuation = useCallback(
    async (id: string) => {
      // Guard: prevent concurrent delete (ref is synchronous; state is async and can race)
      if (deleteInProgressRef.current === id) return
      deleteInProgressRef.current = id
      setDeletingValuationId(id)
      try {
        await reportService.deleteReport(id)
        // Clear session cache so deleted report doesn't reappear from localStorage
        try {
          const { globalSessionCache } = await import('../../../utils/sessionCacheManager')
          globalSessionCache.remove(id)
        } catch {
          // Non-fatal
        }
        const isCurrentReport =
          id === reportId ||
          id === resolvedReportId ||
          id === session?.reportId ||
          id === (session as any)?.key
        if (isCurrentReport) {
          useSessionStore.getState().clearSession()
          const remaining = rawRecentValuations.filter((v) => v.id !== id)
          const isEmbedded =
            isAccountantMode &&
            typeof window !== 'undefined' &&
            sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true'

          // Always notify Mercury when embedded so it invalidates cache (avoids stale "1 bedrijfsschatting")
          if (isEmbedded && typeof window !== 'undefined') {
            const redirectTo = `/${currentLocale}/accountant/dashboard`
            window.parent.postMessage(
              {
                type: 'venus-report-deleted',
                redirectTo,
                clientId: clientContextId ?? undefined,
                reportId: id,
                keepOpen: remaining.length > 0, // Don't close if more valuations remain
                source: 'venus',
              },
              '*'
            )
          }

          if (remaining.length > 0) {
            // Navigate to most recent remaining valuation (both accountant and client)
            router.push(`/${currentLocale}/reports/${remaining[0].id}`)
          } else {
            // No valuations left: accountant → return_url or Mercury dashboard, client → new valuation
            // CRITICAL: Redirect immediately to avoid "stuck" state (e.g. concept-only delete, embedded parent not responding)
            let redirectUrl: string
            if (isAccountantMode) {
              try {
                const returnUrl = typeof window !== 'undefined' ? sessionStorage.getItem('upswitch_return_url') : null
                const sourceApp = typeof window !== 'undefined' ? sessionStorage.getItem('upswitch_source') : null
                redirectUrl = getSafeMercuryReturnUrl(returnUrl, {
                  clientContextId: clientContextId ?? undefined,
                  locale: currentLocale,
                  sourceApp: sourceApp ?? undefined,
                })
              } catch {
                redirectUrl = `${getMercuryUrl()}/${currentLocale}/accountant/dashboard`
              }
            } else {
              redirectUrl = `/${currentLocale}/reports/new`
            }
            window.location.href = redirectUrl
          }
        } else {
          setRawRecentValuations((prev) => prev.filter((v) => v.id !== id))
          fetchRecentValuations() // Refetch to sync with backend
          // Notify Mercury when embedded (delete from sidebar) so it invalidates valuations list
          const isEmbedded =
            isAccountantMode &&
            typeof window !== 'undefined' &&
            sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true'
          if (isEmbedded) {
            window.parent.postMessage(
              {
                type: 'venus-report-deleted',
                reportId: id,
                clientId: clientContextId ?? undefined,
                keepOpen: true, // Stay open - we're viewing a different report
                source: 'venus',
              },
              '*'
            )
          }
        }
      } catch (err) {
        toast.error(tReport('deleteReportFailed'), {
          description: err instanceof Error ? err.message : undefined,
        })
      } finally {
        deleteInProgressRef.current = null
        setDeletingValuationId(null)
      }
    },
    [
      reportId,
      resolvedReportId,
      session?.reportId,
      rawRecentValuations,
      isAccountantMode,
      clientContextId,
      router,
      currentLocale,
      tReport,
      fetchRecentValuations,
    ]
  )

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      // Redirect to Mercury login (Venus uses Titan auth; accountants enter from Mercury)
      const mercuryBaseUrl = getMercuryUrl()
      window.location.href = `${mercuryBaseUrl}/${currentLocale}/auth/login?returnUrl=${encodeURIComponent(window.location.origin + `/${currentLocale}/reports/new`)}`
    } catch {
      const mercuryBaseUrl = getMercuryUrl()
      window.location.href = `${mercuryBaseUrl}/${currentLocale}`
    }
  }, [currentLocale])

  const handleAccountSettings = useCallback(() => {
    // Settings page lives in Mercury (cross-app navigation)
    const mercuryBaseUrl = getMercuryUrl()
    const locale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'en'
    window.location.href = `${mercuryBaseUrl}/${locale}/accountant/settings`
  }, [currentLocale])

  const handleSwitchWorkspace = useCallback(() => {
    // When embedded from Mercury (return_url exists), go to Mercury clients; else Venus home
    if (typeof window !== 'undefined') {
      try {
        const returnUrl = sessionStorage.getItem('upswitch_return_url')
        const sourceApp = sessionStorage.getItem('upswitch_source')
        if (returnUrl && !isLegacyReturnUrl(returnUrl) && sourceApp?.includes('mercury')) {
          const { relationshipId } = useClientContext.getState()
          const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
            clientContextId: relationshipId ?? undefined,
            locale: currentLocale,
            sourceApp: sourceApp ?? undefined,
          })
          window.location.href = targetUrl
          return
        }
      } catch (error) {
        generalLogger.warn('[ManualLayout] handleSwitchWorkspace: sessionStorage unavailable, falling back to Venus home', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    router.push(`/${currentLocale}/home`)
  }, [router, currentLocale])

  // Accountant dropdown navigation (Mercury parity)
  // Venus locales (en, nl) map 1:1 to Mercury; fallback to 'en' for robustness
  const mercuryLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'en'

  const handleNavigateToDashboard = useCallback(() => {
    const mercuryBaseUrl = getMercuryUrl()
    window.location.href = `${mercuryBaseUrl}/${mercuryLocale}/accountant/dashboard`
  }, [mercuryLocale])

  const handleNavigateToBilling = useCallback(() => {
    const mercuryBaseUrl = getMercuryUrl()
    window.location.href = `${mercuryBaseUrl}/${mercuryLocale}/accountant/settings?tab=billing`
  }, [mercuryLocale])

  const handleNavigateToHelp = useCallback(() => {
    const mercuryBaseUrl = getMercuryUrl()
    window.location.href = `${mercuryBaseUrl}/${mercuryLocale}/help`
  }, [mercuryLocale])

  // ─── Field Help (opens Chat with context) - Clarity parity: full getContextualQuestion ───
  const handleFieldHelpRequest = useCallback(
    (context: any) => {
      setFieldContext({
        field: context.field,
        label: context.label,
        value: context.value,
        hint: context.hint,
      })
      setChatDrawerOpen(true)

      const label = (context.label || '').toLowerCase()
      const isEN = currentLocale === 'en'

      const getContextualQuestion = (): string => {
        if (context.normalizationType) {
          switch (context.normalizationType) {
            case 'salary':
              return isEN
                ? `What is a market-rate salary for ${label}?`
                : `Wat is een marktconform salaris voor ${label}?`
            case 'rent':
              return isEN
                ? `Is the rent for ${label} at market rate?`
                : `Is de huurprijs voor ${label} marktconform?`
            case 'vehicle':
              return isEN
                ? `How much private use can be normalized for ${label}?`
                : `Hoeveel privégebruik kan genormaliseerd worden voor ${label}?`
            case 'one-time':
              return isEN
                ? `Is ${label} a one-time cost that should be normalized?`
                : `Is ${label} een eenmalige kost die genormaliseerd moet worden?`
            case 'personal':
              return isEN
                ? `What portion of ${label} is personal?`
                : `Welk deel van ${label} is privégerelateerd?`
          }
        }
        switch (context.field) {
          case 'ownerManagers':
            return isEN
              ? 'How many owner-managers is typical for this type of business?'
              : 'Hoeveel eigenaar-managers is gebruikelijk voor dit type bedrijf?'
          case 'ebitda':
            return isEN
              ? `Which normalizations are relevant for the EBITDA of ${context.label}?`
              : `Welke normalisaties zijn relevant voor de EBITDA van ${context.label}?`
          case 'ownerSalary':
            return isEN
              ? 'What is a market-rate owner salary for this business?'
              : 'Wat is een marktconform eigenaarssalaris voor dit bedrijf?'
          case 'rent':
            return isEN ? 'Is this rent at market rate?' : 'Is deze huurprijs marktconform?'
          case 'vehicle':
            return isEN
              ? 'How much private use can be normalized for vehicle costs?'
              : 'Hoeveel privégebruik kan genormaliseerd worden voor autokosten?'
          default:
            if (context.grootboekCode) {
              return isEN
                ? `Analyze ledger account ${context.grootboekCode} (${context.label}) for normalization`
                : `Analyseer grootboekrekening ${context.grootboekCode} (${context.label}) voor normalisatie`
            }
            return isEN ? `Help me with ${label}` : `Help me met ${label}`
        }
      }

      setTimeout(() => handleChatMessage(getContextualQuestion()), 300)
    },
    [handleChatMessage, currentLocale]
  )

  // ─── Normalization Handlers (unified store) - Clarity parity: open modal, do not replace left panel ───
  const handleShowNormalisationReview = useCallback(() => {
    trackNormalizationOpen()
    setShowUnifiedNormalizationModal(true)
  }, [])

  const handleNormalizationsChange = useCallback(
    async (norms: NormalizationItem[]) => {
      const previousItems = useNormalizationStore.getState().items
      useNormalizationStore.getState().setItems(norms)

      const acceptedSignature = (items: NormalizationItem[]) =>
        JSON.stringify(
          items
            .filter((item) => item.status === 'accepted')
            .map((item) => ({
              id: item.id,
              type: item.type,
              value: item.value,
              adjustment: item.adjustment,
              year: item.year,
              applyAllYears: item.applyAllYears,
              applyYears: item.applyYears ?? [],
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
        )

      if (acceptedSignature(previousItems) === acceptedSignature(norms)) return

      const idForApi = resolvedReportId || reportId
      if (!idForApi) return

      const allYears = Array.from(
        new Set([
          ...financialYears,
          ...previousItems.flatMap((item) => getYearsToPersist(item)),
          ...norms.flatMap((item) => getYearsToPersist(item)),
        ])
      ).filter((year) => Number.isFinite(year))

      try {
        await persistOrDeleteNormalizationsForYears(
          idForApi,
          allYears,
          originalEBITDAByYear,
          norms
        )
      } catch (error) {
        generalLogger.warn('[ManualLayout] Sync after normalization edit failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      await recalculateWithNormalizations(norms)
    },
    [financialYears, normalizationActions, originalEBITDAByYear, reportId, resolvedReportId]
  )

  const getYearsToPersist = useCallback(
    (item: NormalizationItem): number[] => {
      const allDataYears = financialYears
      return item.applyAllYears
        ? allDataYears
        : item.applyYears?.length
          ? item.applyYears
          : [item.year]
    },
    [financialYears]
  )

  const handleAcceptNormalisation = useCallback(
    async (id: string) => {
      trackAINormalizationAccept()
      normalizationActions.acceptItem(id)
      setSuggestedNormalisations((prev: any[]) =>
        prev.map((n: any) => (n.id === id ? { ...n, status: 'accepted' } : n))
      )
      const idForApi = resolvedReportId || reportId
      if (idForApi) {
        const item = useNormalizationStore.getState().items.find((n) => n.id === id)
        if (item) {
          const years = getYearsToPersist(item)
          try {
            await persistOrDeleteNormalizationsForYears(
              idForApi,
              years,
              originalEBITDAByYear,
              useNormalizationStore.getState().items
            )
          } catch (error) {
            generalLogger.warn('[ManualLayout] Titan persist failed after accept — rolling back', {
              id,
              error: error instanceof Error ? error.message : String(error),
            })
            normalizationActions.updateItem(id, { status: 'pending' })
            setSuggestedNormalisations((prev: any[]) =>
              prev.map((n: any) => (n.id === id ? { ...n, status: 'pending' } : n))
            )
            toast.error(t('persistFailed'), { description: t('persistFailedDesc') })
            return
          }
        }
      }
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [reportId, resolvedReportId, normalizationActions, getYearsToPersist, originalEBITDAByYear, t]
  )

  const handleRejectNormalisation = useCallback(
    async (id: string) => {
      normalizationActions.rejectItem(id)
      setSuggestedNormalisations((prev: any[]) =>
        prev.map((n: any) => (n.id === id ? { ...n, status: 'rejected' } : n))
      )
      const idForApi = resolvedReportId || reportId
      if (idForApi) {
        const item = useNormalizationStore.getState().items.find((n) => n.id === id)
        if (item) {
          const years = getYearsToPersist(item)
          const norms = useNormalizationStore.getState().items
          try {
            await persistOrDeleteNormalizationsForYears(
              idForApi,
              years,
              originalEBITDAByYear,
              norms
            )
          } catch (error) {
            generalLogger.warn('[ManualLayout] Titan persist failed after reject — rolling back', {
              id,
              error: error instanceof Error ? error.message : String(error),
            })
            normalizationActions.updateItem(id, { status: 'pending' })
            setSuggestedNormalisations((prev: any[]) =>
              prev.map((n: any) => (n.id === id ? { ...n, status: 'pending' } : n))
            )
            toast.error(t('persistFailed'), { description: t('persistFailedDesc') })
            return
          }
        }
      }
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [reportId, resolvedReportId, normalizationActions, getYearsToPersist, originalEBITDAByYear, t]
  )

  // ─── Auto-recalculate valuation with normalized EBITDA ───
  // IMPORTANT: Do NOT manually mutate EBITDA here. buildValuationRequest reads accepted
  // normalizations from useNormalizationStore and applies them. Mutating formStore EBITDA
  // would cause double-counting because buildValuationRequest adds adjustments on top.
  const recalculateWithNormalizations = useCallback(
    async (normalizations: NormalizationItem[]) => {
      const idForApi = resolvedReportId || reportId
      if (!report || !idForApi) return

      const acceptedNorms = normalizations.filter((n) => n.status === 'accepted')

      try {
        // Pass normalizations directly to avoid a redundant store read
        const recalcLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const latestFinancialOverrides = mapClarityFormToVenusStore({
          ...collectedData,
          ...latestFormDataRef.current,
        })
        const requestSource = {
          ...formStoreData,
          ...latestFinancialOverrides,
          current_year_data: latestFinancialOverrides.current_year_data ?? formStoreData.current_year_data,
          historical_years_data:
            latestFinancialOverrides.historical_years_data ?? formStoreData.historical_years_data,
          revenue: latestFinancialOverrides.revenue ?? formStoreData.revenue,
          ebitda: latestFinancialOverrides.ebitda ?? formStoreData.ebitda,
        } as VenusFormData
        const request = buildValuationRequest(
          requestSource,
          normalizations,
          recalcLocale as 'nl' | 'en'
        )
        ;(request as any).dataSource = 'manual'
        ;(request as any).reportId = idForApi

        const calcResult = await valuationService.calculateValuation(request)
        if (calcResult) {
          setResult(calcResult)
          setDraftStatus('saved')
          setLastSaved(new Date())
          try {
            await reportService.saveReportAssets(idForApi, {
              sessionData: requestSource,
              valuationResult: calcResult,
              htmlReport: calcResult.html_report || undefined,
              name: sessionName,
            })
          } catch (saveError) {
            generalLogger.warn('[ManualLayout] Failed to sync recalculated normalization report assets', {
              reportId: idForApi,
              error: saveError instanceof Error ? saveError.message : String(saveError),
            })
          }
          toast.success(t('recalculatedWithNorms'), {
            description: t('recalculatedWithNormsDesc', { count: acceptedNorms.length }),
          })
        }
      } catch (error) {
        generalLogger.warn('[ManualLayout] Normalization recalculation failed (non-blocking)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [report, reportId, resolvedReportId, formStoreData, buildValuationRequest, valuationService, setResult, sessionName]
  )

  // ─── Version Restore ───
  // Receives full ValuationVersion from HistoryPanel (looked up from store)
  const handleVersionRestore = useCallback(
    async (version: any) => {
      try {
        const versionNumber = version.versionNumber || version.version

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
        if (version.formData) {
          updateFormData(version.formData)
        }

        // 3. Set valuation result with htmlReport merged from version
        if (version.valuationResult) {
          const enrichedResult = {
            ...version.valuationResult,
            html_report: version.valuationResult.html_report || version.htmlReport || undefined,
          }
          setResult(enrichedResult)
        }

        // 4. Restore normalizations from normalization_data snapshot
        if (version.normalization_data && typeof version.normalization_data === 'object') {
          // Convert year-keyed normalization_data back to NormalizationItem[]
          const items: NormalizationItem[] = []
          for (const [yearStr, data] of Object.entries(
            version.normalization_data as Record<string, any>
          )) {
            if (data?.adjustments && Array.isArray(data.adjustments)) {
              const year = Number(yearStr)
              for (let idx = 0; idx < data.adjustments.length; idx++) {
                const adj = data.adjustments[idx]
                const amount = Number(adj.amount ?? adj.adjustment ?? 0)
                const rawCat = adj.category || ''
                const category: NormalizationItem['category'] = [
                  'salary',
                  'rent',
                  'vehicle',
                  'one-time',
                  'personal',
                  'depreciation',
                  'other',
                ].includes(rawCat)
                  ? (rawCat as NormalizationItem['category'])
                  : mapBackendCategoryToFrontend(rawCat) || 'other'
                items.push({
                  id: `version-${year}-${idx}-${Math.random().toString(36).substring(2, 8)}`,
                  ledgerCode: adj.ledger_code || '',
                  ledgerName: adj.ledger_name || adj.note || adj.category || '',
                  category,
                  type: amount >= 0 ? 'add' : 'subtract',
                  value: Math.abs(amount),
                  adjustment: amount,
                  reason: adj.note || adj.reason,
                  source: 'manual',
                  sourceRef: 'version',
                  status: 'accepted',
                  applyAllYears: false,
                  year,
                })
              }
            }
          }
          if (items.length > 0) {
            normalizationActions.setItems(items)
          }
        }

        // 5. Restore tax latencies from version snapshot
        if (version.tax_latency_data && Array.isArray(version.tax_latency_data) && version.tax_latency_data.length > 0) {
          useTaxLatencyStore.getState().setItems(version.tax_latency_data)
        } else {
          useTaxLatencyStore.getState().clear()
        }

        // 6. Update version history active version and re-fetch from backend
        //    (restore creates a new version copy on the backend)
        if (idForApi && versionNumber) {
          useVersionHistoryStore.getState().setActiveVersion(idForApi, versionNumber)
          await useVersionHistoryStore.getState().fetchVersions(idForApi)
        }

        setRightPanelView('preview')
        toast.success(t('versionRestored', { version: versionNumber }))
      } catch (error) {
        generalLogger.warn('[ManualLayout] Version restore failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(t('versionRestoreFailed'))
      }
    },
    [reportId, resolvedReportId, updateFormData, setResult, normalizationActions]
  )

  // ─── CSV Import → Normalization Hub ───
  const handleCSVImportComplete = useCallback(
    async (
      source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable',
      _fileName?: string
    ) => {
      const labels = {
        yuki: 'Yuki',
        exact: 'Exact Online',
        odoo: 'Odoo',
        octopus: 'Octopus',
        accountable: 'Accountable',
      }
      toast.success(t('importStarted', { source: labels[source] }), {
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

        let suggestions: any[] = []
        if (response.ok) {
          const data = await response.json()
          suggestions = data.suggestions || []
        }

        // If AI returns no suggestions, generate sensible defaults based on source
        if (suggestions.length === 0) {
          suggestions = generateDefaultNormalizationSuggestions(source, nh)
        }

        const unifiedItems: NormalizationItem[] = suggestions.map((s: any, idx: number) => ({
          id: s.id || `${source}-${idx + 1}`,
          ledgerCode: s.code || s.ledgerCode || '',
          ledgerName: s.description || s.ledgerName || '',
          category: s.category || 'other',
          type: 'add' as const,
          value: s.amount || s.value || 0,
          adjustment: s.amount || s.adjustment || 0,
          reason: s.reason || '',
          source: source as any,
          sourceRef: s.sourceRef || `${labels[source]}`,
          status: (s.status || 'pending') as any,
          applyAllYears: false, // Default single year; user can change in modal
          year: new Date().getFullYear() - 1,
        }))

        setSuggestedNormalisations(suggestions)
        normalizationActions.setItems(unifiedItems)
        setShowUnifiedNormalizationModal(true)
        setChatDrawerOpen(true)

        // Save normalizations to backend (auto-persist handles session)
        if (reportId) normalizationActions.persistToSession(reportId)

        // Also persist via normalization API for structured storage
        if (reportId) {
          const { normalizationService } = await import(
            '../../../services/ebitdaNormalizationService'
          )
          await normalizationService
            .saveNormalization({
              sessionId: reportId,
              year: new Date().getFullYear() - 1,
              adjustments: unifiedItems.map((n) => ({
                category: mapFrontendCategoryToBackend(n.category),
                amount: n.adjustment,
                description: n.reason,
                ledgerCode: n.ledgerCode,
              })),
              source,
            } as any)
            .catch(() => {
              // Non-blocking: normalization save is best-effort
              generalLogger.info('[ManualLayout] Normalization save to API skipped (non-blocking)')
            })
        }

        setChatMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: t('importAnalyzed', { source: labels[source], count: unifiedItems.length }),
            timestamp: new Date(),
            normalisationSuggestions: suggestions.map((s: any) => ({ ...s, multiple: 5.2 })),
          },
        ])
      } catch (error) {
        generalLogger.error('[ManualLayout] CSV import analysis failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(t('importAnalysisFailed'), { description: t('importAnalysisFailedDesc') })
      }
    },
    [reportId, collectedData, normalizationActions, nh, t]
  )

  // ─── Normalisation Suggestion Modal ───
  const handleNormalisationSuggestionAccept = useCallback(
    (suggestion: NormalisationSuggestion, customValue?: number) => {
      const value = customValue !== undefined ? customValue : suggestion.suggestedValue
      handleApplyFieldUpdate(suggestion.field, value)
      setShowNormalisationModal(false)
      setCurrentNormalisationSuggestion(null)
      const currencyLocale = currentLocale === 'en' ? 'en-BE' : 'nl-BE'
      toast.success(
        t('normNormalized', {
          label: suggestion.label,
          value: value.toLocaleString(currencyLocale),
        })
      )
    },
    [handleApplyFieldUpdate, currentLocale, t]
  )

  const handleNormalisationSuggestionReject = useCallback(() => {
    setShowNormalisationModal(false)
    setCurrentNormalisationSuggestion(null)
    toast.info(t('suggestionRejected'))
  }, [])

  // ─── Shared ManualInputPanel Props ───
  const manualInputProps = {
    onSubmit: wrappedOnSubmit,
    onCSVImportComplete: handleCSVImportComplete,
    isCalculating: isGenerating || isCalculating,
    onFieldHelpRequest: handleFieldHelpRequest,
    quickActions: suggestedNormalisations,
    onQuickActionAccept: handleAcceptNormalisation,
    onQuickActionReject: handleRejectNormalisation,
    onViewAllNormalizations: handleShowNormalisationReview,
    onFormDataChange: handleFormDataChange,
    formDataRef: latestFormDataRef as React.MutableRefObject<Record<string, unknown> | null>,
    hasReport: !!report,
    initialData: {
      companyName: collectedData.companyName,
      kboNumber: collectedData.kboNumber,
      legalForm: collectedData.legalForm,
      businessStructure:
        collectedData.businessStructure ||
        mapLegalFormToBusinessStructure(collectedData.legalForm || ''),
      address: collectedData.address,
      naceCode: collectedData.naceCode,
      naceDescription: collectedData.naceDescription,
      businessType: collectedData.businessType,
      industry: collectedData.industry,
      country: collectedData.country,
      yearFounded: collectedData.yearFounded,
      equityStake: collectedData.equityStake,
      ownerManagers: collectedData.ownerManagers,
      fteEmployees: formStoreData.number_of_employees ?? collectedData.fteEmployees,
      yearlyFinancials: restoredYearlyFinancials,
    },
  }

  // ─── Shared Chat Drawer Props ───
  const cyd = formStoreData?.current_year_data as { ebitda?: number } | undefined
  const hy = (formStoreData?.historical_years_data || []) as Array<{ ebitda?: number }>
  const hasEbitda =
    (cyd && (cyd.ebitda ?? 0) !== 0) || hy.some((h) => (h.ebitda ?? 0) !== 0)
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
    pendingNormalizationsCount: normalizationItems.filter((n) => n.status === 'pending').length,
    onApplyFieldUpdate: handleApplyFieldUpdate,
    pendingUpdates,
    onAcceptUpdate: handleAcceptUpdate,
    onRejectUpdate: handleRejectUpdate,
    onAcceptNormalisation: handleAcceptNormalisation,
    onRejectNormalisation: handleRejectNormalisation,
    hasUploadedData: suggestedNormalisations.length > 0,
    toolInProgress: conversationStore.toolInProgress,
    onOpenNormalizationHub: () => {
      trackNormalizationOpen()
      setShowUnifiedNormalizationModal(true)
      setChatDrawerOpen(false)
    },
    onRetry: handleRetry,
    onNewConversation: handleNewConversation,
  }

  // Stable last full year for originalEBITDA fallback (avoids date-boundary inconsistencies)
  const lastFullYear = getLastFullFiscalYear()

  // ═══════════════════════════════════════
  // MOBILE LAYOUT
  // ═══════════════════════════════════════
  if (isMobile) {
    return (
      <div className="aurora-theme flex flex-col h-[100dvh] bg-background">
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
          userInitials={getUserInitials(
            isAccountantMode && accountantDisplayName ? { name: accountantDisplayName } : user
          )}
          userEmail={user?.email}
          avatarUrl={user?.avatar_url || user?.avatar || user?.profile_picture}
          onOpenAssistant={handleOpenAssistant}
          isAssistantOpen={chatDrawerOpen}
          onOpenNormalization={() => {
            trackNormalizationOpen()
            setShowUnifiedNormalizationModal(true)
          }}
          normalizationCount={normalizationItems.filter((n) => n.status === 'accepted').length}
          openTasksCount={
            suggestedNormalisations.filter((n: any) => n.status === 'pending').length +
            pendingUpdates.length
          }
          isExporting={isExporting}
          recentValuations={recentValuations}
          activeReportId={resolvedReportId || reportId}
          onNewValuation={handleNewValuation}
          isCalculating={isGenerating || isCalculating || effectiveIsRestoringExistingReport}
          onSelectValuation={handleSelectValuation}
          onDeleteValuation={handleDeleteValuation}
          deletingValuationId={deletingValuationId}
          onLogout={handleLogout}
          onAccountSettings={handleAccountSettings}
          onSwitchWorkspace={handleSwitchWorkspace}
          onNavigateToDashboard={handleNavigateToDashboard}
          onNavigateToBilling={handleNavigateToBilling}
          onNavigateToHelp={handleNavigateToHelp}
          isAccountantMode={isAccountantMode}
          onExitClientView={handleExitClientView}
          onInviteClient={isAccountantMode ? () => setShowInviteClientModal(true) : undefined}
        />

        {/* Context Bar - Accountant Mode (mobile, Clarity parity) */}
        {isAccountantMode && (clientContextName || collectedData.companyName) && (
          <ContextBar
            clientName={clientContextName?.split(' ')[0]}
            businessName={collectedData.companyName}
            draftStatus={draftStatus}
            lastSaved={lastSaved}
            onClientClick={() => {
              if (clientContextId) {
                const mercuryUrl = getMercuryUrl()
                window.location.href = `${mercuryUrl}/${mercuryLocale}/accountant/clients/${clientContextId}`
              }
            }}
            onBusinessClick={
              clientContextId
                ? () => {
                    const mercuryUrl = getMercuryUrl()
                    window.location.href = `${mercuryUrl}/${mercuryLocale}/accountant/clients/${clientContextId}`
                  }
                : undefined
            }
            clientApprovalStatus="none"
            onResendApproval={() => toast.info(t('reminderSent'))}
            pendingNormalisations={normalizationItems.filter((n) => n.status === 'pending').length}
            onShowNormalisationReview={handleShowNormalisationReview}
          />
        )}

        <div className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
          <ManualInputPanel key={reportId} {...manualInputProps} />
        </div>

        <ChatAssistantDrawer {...chatDrawerProps} />

        <FullscreenReportModal
          open={showFullscreenModal}
          onOpenChange={setShowFullscreenModal}
          report={report}
          onDownload={handleExport}
          onShare={isAccountantMode && clientContextId ? () => { setShowFullscreenModal(false); setShowInviteClientModal(true) } : undefined}
        />

        <InviteClientModal
          open={showInviteClientModal}
          onOpenChange={setShowInviteClientModal}
          clientId={clientContextId}
          clientEmail={useClientContext.getState()?.client?.email}
          clientName={clientContextName}
          companyName={collectedData.companyName}
          reportId={resolvedReportId || reportId}
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
          onCancel={() => setShowNewValuationModal(false)}
          isConfirming={isConfirmingNewValuation}
        />

        <NormalisationSuggestionModal
          open={showNormalisationModal}
          onOpenChange={setShowNormalisationModal}
          suggestion={currentNormalisationSuggestion}
          onAccept={handleNormalisationSuggestionAccept}
          onReject={handleNormalisationSuggestionReject}
          companyName={collectedData.companyName}
        />

        <UnifiedNormalizationModal
          open={showUnifiedNormalizationModal}
          onOpenChange={setShowUnifiedNormalizationModal}
          companyName={collectedData.companyName || t('company')}
          currentYear={lastFullYear}
          originalEBITDA={getOriginalEbitdaForDisplay()}
          originalEBITDAByYear={originalEBITDAByYear}
          normalizations={normalizationItems}
          onNormalizationsChange={handleNormalizationsChange}
          countryCode={formCountry || 'BE'}
          onUploadClick={() => {}}
          financialYears={financialYears}
          fallbackFormDataRef={latestFormDataRef as React.MutableRefObject<Record<string, unknown> | null>}
        />
      </div>
    )
  }

  // ═══════════════════════════════════════
  // DESKTOP LAYOUT (Resizable Panels)
  // ═══════════════════════════════════════
  return (
    <div className="aurora-theme flex flex-col h-screen bg-background overflow-hidden">
      <CalculatorNav
        companyName={displayCompanyName}
        onBack={handleBack}
        onDownload={handleExport}
        onFullscreen={handleFullscreen}
        onPreview={handlePreview}
        onShowHistory={handleShowHistory}
        hasReport={!!report}
        rightPanelView={rightPanelView}
        userName={
          isAccountantMode && accountantDisplayName
            ? accountantDisplayName
            : user?.name || user?.email || t('guest')
        }
        userInitials={getUserInitials(
          isAccountantMode && accountantDisplayName ? { name: accountantDisplayName } : user
        )}
        userEmail={user?.email}
        avatarUrl={user?.avatar_url || user?.avatar || user?.profile_picture}
        onOpenAssistant={handleOpenAssistant}
        isAssistantOpen={chatDrawerOpen}
        onOpenNormalization={() => setShowUnifiedNormalizationModal(true)}
        normalizationCount={normalizationItems.filter((n) => n.status === 'accepted').length}
        openTasksCount={
          suggestedNormalisations.filter((n: any) => n.status === 'pending').length +
          pendingUpdates.length
        }
        isExporting={isExporting}
        downloadHistory={downloadHistory}
        onRedownload={(item: any) => {
          if (item.url) {
            window.open(item.url, '_blank')
          } else {
            toast.info(t('pdfRegenerating'), { description: t('pdfRegeneratingDesc') })
          }
        }}
        onNavigateToDashboard={handleNavigateToDashboard}
        onNavigateToBilling={handleNavigateToBilling}
        onNavigateToHelp={handleNavigateToHelp}
        valuationSummary={
          report
            ? {
                priceRange: {
                  min: report.valuationLow ?? Math.round(report.valuation * 0.85),
                  max: report.valuationHigh ?? Math.round(report.valuation * 1.15),
                },
                // Voorgestelde Vraagprijs flows to Mercury listing; use when available (world-class: seller sees the number they will publish)
                askPrice: report.recommendedAskingPrice ?? report.valuation,
                confidence: 'high' as const,
              }
            : undefined
        }
        valuationVersions={versionHistoryForNav}
        selectedVersionId={selectedVersionId}
        onSelectVersion={handleSelectVersion}
        onContinueToListing={() => {
          trackReturnToMercury()
          const mercuryBaseUrl = getMercuryUrl()
          const returnPath = clientContextId
            ? `${mercuryBaseUrl}/${mercuryLocale}/accountant/clients/${clientContextId}?from=venus`
            : `${mercuryBaseUrl}/${mercuryLocale}/accountant/clients`
          window.location.href = returnPath
        }}
        recentValuations={recentValuations}
        activeReportId={resolvedReportId || reportId}
        onNewValuation={handleNewValuation}
        isCalculating={isGenerating || isCalculating || effectiveIsRestoringExistingReport}
        onSelectValuation={handleSelectValuation}
        onDeleteValuation={handleDeleteValuation}
        onLogout={handleLogout}
        onAccountSettings={handleAccountSettings}
        onSwitchWorkspace={handleSwitchWorkspace}
        isAccountantMode={isAccountantMode}
        onExitClientView={handleExitClientView}
        onInviteClient={isAccountantMode ? () => setShowInviteClientModal(true) : undefined}
      />

      {/* Context Bar - Accountant Mode (Clarity parity) */}
      {isAccountantMode && (clientContextName || collectedData.companyName) && (
        <ContextBar
          clientName={clientContextName?.split(' ')[0]}
          businessName={collectedData.companyName}
          draftStatus={draftStatus}
          lastSaved={lastSaved}
          onClientClick={() => {
            if (clientContextId) {
              const mercuryUrl = getMercuryUrl()
              window.location.href = `${mercuryUrl}/${mercuryLocale}/accountant/clients/${clientContextId}`
            }
          }}
          onBusinessClick={
            clientContextId
              ? () => {
                  const mercuryUrl = getMercuryUrl()
                  window.location.href = `${mercuryUrl}/${mercuryLocale}/accountant/clients/${clientContextId}`
                }
              : undefined
          }
          clientApprovalStatus="none"
          onResendApproval={() => toast.info(t('reminderSent'))}
          pendingNormalisations={normalizationItems.filter((n) => n.status === 'pending').length}
          onShowNormalisationReview={handleShowNormalisationReview}
        />
      )}

      {/* Main Content: Resizable Panels */}
      <div className="flex-1 min-w-0 overflow-hidden m-4 rounded-xl border border-foreground/[0.06]">
        <ResizablePanelGroup className="h-full w-full">
          {/* Left Panel: Always ManualInputPanel (Clarity parity - no view switching) */}
          <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
            <div className="h-full">
              <ManualInputPanel key={reportId} {...manualInputProps} />
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
                        <div className="valuation-report">
                          <div
                            dangerouslySetInnerHTML={{
                              __html: HTMLProcessor.sanitize(report.htmlReport),
                            }}
                          />
                        </div>
                      ) : (isGenerating || isCalculating) ? (
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
                      className="valuation-report-container h-full overflow-y-auto bg-background"
                    >
                      <div className="valuation-report">
                        <div
                          dangerouslySetInnerHTML={{
                            __html: HTMLProcessor.sanitize(report.htmlReport),
                          }}
                        />
                      </div>
                    </motion.div>
                  ) : (isGenerating || isCalculating) ? (
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

      {/* Chat Co-pilot Drawer (Suspense-wrapped for lazy loading UX) */}
      <Suspense fallback={null}>
        <ChatAssistantDrawer {...chatDrawerProps} />
      </Suspense>

      {/* Fullscreen Report Modal */}
      <FullscreenReportModal
        open={showFullscreenModal}
        onOpenChange={setShowFullscreenModal}
        report={report}
        onDownload={handleExport}
        onShare={isAccountantMode && clientContextId ? () => { setShowFullscreenModal(false); setShowInviteClientModal(true) } : undefined}
      />

      {/* Invite Client Modal */}
      <InviteClientModal
        open={showInviteClientModal}
        onOpenChange={setShowInviteClientModal}
        clientId={clientContextId}
        clientEmail={useClientContext.getState()?.client?.email}
        clientName={clientContextName}
        companyName={collectedData.companyName}
        reportId={resolvedReportId || reportId}
      />

      {/* Recalculation Confirmation (when user changes EBITDA/form and clicks recalculate) */}
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
        onCancel={() => setShowNewValuationModal(false)}
        isConfirming={isConfirmingNewValuation}
      />

      {/* Normalisation Suggestion Modal */}
      <NormalisationSuggestionModal
        open={showNormalisationModal}
        onOpenChange={setShowNormalisationModal}
        suggestion={currentNormalisationSuggestion}
        onAccept={handleNormalisationSuggestionAccept}
        onReject={handleNormalisationSuggestionReject}
        companyName={collectedData.companyName}
      />

      {/* Unified Normalization Modal — single source of truth for all normalization entry points */}
      <UnifiedNormalizationModal
        open={showUnifiedNormalizationModal}
        onOpenChange={setShowUnifiedNormalizationModal}
        companyName={collectedData.companyName || t('company')}
        currentYear={lastFullYear}
        originalEBITDA={getOriginalEbitdaForDisplay()}
        originalEBITDAByYear={originalEBITDAByYear}
        normalizations={normalizationItems}
        onNormalizationsChange={handleNormalizationsChange}
        countryCode={formCountry || 'BE'}
        onUploadClick={() => {}}
        financialYears={financialYears}
        fallbackFormDataRef={latestFormDataRef as React.MutableRefObject<Record<string, unknown> | null>}
      />
    </div>
  )
}
