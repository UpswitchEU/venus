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
 *   ├────────────┬──────────────────────────────────────────┤
 *   │ Left 35%   │ Right 65%                                 │
 *   │ ManualInput│ ValuationReportPanel / Preview / History  │
 *   │ OR         │                                           │
 *   │ NormHub    │                                           │
 *   └────────────┴──────────────────────────────────────────┘
 *   + ChatAssistantDrawer (slide-in from right)
 *   + FullscreenReportModal, NormalisationSuggestionModal, UnifiedNormalizationModal
 *
 * @module features/manual/components/ManualLayout
 */

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, Suspense } from 'react'
import { useTransitionRouter } from 'next-view-transitions'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// Venus infrastructure (auth, session, stores, services)
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import { useBootstrapSync } from '../../../hooks/useBootstrapSync'
import { usePdfGeneration } from '../../../hooks/usePdfGeneration'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useNormalizationStore, enableNormalizationAutoPersist, mapBackendCategoryToFrontend, setNormalizationToastMessages } from '../../../store/useNormalizationStore'
import { CalculatorShellSkeleton } from '../../../components/calculator'
import { valuationService, reportService } from '../../../services'
import { buildValuationRequest } from '../../../utils/buildValuationRequest'
import { DownloadService } from '../../../services/downloadService'
import { generalLogger } from '../../../utils/logger'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '../../../utils/versionDiffDetection'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import type { ValuationResponse, ValuationFormData as VenusFormData } from '../../../types/valuation'

// Design System
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '../../../design-system/components/Resizable'
import { springDefault } from '../../../design-system/components/motion'

// Calculator Components (full Clarity parity)
import {
  CalculatorNav,
  ManualInputPanel,
  ChatAssistantDrawer,
  ValuationReportPanel,
  HistoryPanel,
  FullscreenReportModal,
  NormalisationSuggestionModal,
  NormalizationHub,
  UnifiedNormalizationModal,
  type RightPanelView,
  type ValuationReportData,
  type ChatMessage,
  type FieldContext,
  type NormalisationSuggestion,
  type NormalizationItem,
} from '../../../components/calculator'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

type LeftPanelView = 'input' | 'normalization-hub'

interface CollectedData {
  companyName?: string
  kboNumber?: string
  legalForm?: string
  naceCode?: string
  naceDescription?: string
  businessType?: string
  industry?: string
  country?: string
  yearFounded?: string
  ownerManagers?: number
  equityStake?: number
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

function generateDefaultNormalizationSuggestions(source: 'yuki' | 'exact' | 'odoo') {
  const labels = { yuki: 'Yuki', exact: 'Exact Online', odoo: 'Odoo' }
  return [
    { id: `${source}-1`, code: '620', description: 'Eigenaarssalaris boven marktwaarde', category: 'salary', amount: 60000, reason: 'Marktconform salaris: €120.000 vs €180.000', sourceRef: `${labels[source]} 620xxx`, status: 'pending' },
    { id: `${source}-2`, code: '613', description: 'Huurkosten kantoorpand', category: 'rent', amount: 24000, reason: 'Huurprijs boven marktwaarde', sourceRef: `${labels[source]} 613xxx`, status: 'pending' },
    { id: `${source}-3`, code: '615', description: 'Autokosten directie', category: 'vehicle', amount: 18000, reason: 'Privégebruik directievoertuig: 50%', sourceRef: 'Manueel', status: 'pending' },
    { id: `${source}-4`, code: '640', description: 'Eenmalige juridische kosten', category: 'one-time', amount: 35000, reason: 'Overnamegeschil 2023', sourceRef: `${labels[source]}`, status: 'pending' },
    { id: `${source}-5`, code: '650', description: 'Familielid op payroll', category: 'personal', amount: 45000, reason: 'Partner zonder operationele functie', sourceRef: 'Manueel', status: 'pending' },
  ]
}

// ─────────────────────────────────────────
// CATEGORY MAPPING
// Maps frontend 7 simplified categories → backend 12 canonical categories.
// Used when persisting normalizations to Titan's normalization API.
// ─────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  salary: 'owner_compensation_adjustment',
  rent: 'related_party_transactions',
  vehicle: 'personal_expenses',
  'one-time': 'one_time_expenses',
  personal: 'personal_expenses',
  depreciation: 'depreciation_adjustment',
  other: 'other_adjustments',
}

function mapFrontendCategoryToBackend(category: string): string {
  return CATEGORY_MAP[category] || category
}

// ─────────────────────────────────────────
// FORM DATA BRIDGE
// Maps ManualInputPanel's ValuationFormData (camelCase, multi-year)
// to Venus store's ValuationFormData (snake_case, API format)
// ─────────────────────────────────────────

function mapClarityFormToVenusStore(data: any): Partial<VenusFormData> {
  const allYears = (data.yearlyFinancials || [])
    .filter((yf: any) => yf.year && (yf.revenue > 0 || yf.ebitda > 0))
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
    ebitda: current?.normalizedEbitda || current?.ebitda,
    current_year_data: current
      ? {
          year: parseInt(current.year),
          revenue: current.revenue,
          ebitda: current.normalizedEbitda || current.ebitda,
        }
      : undefined,
    historical_years_data: historical.map((h: any) => ({
      year: parseInt(h.year),
      revenue: h.revenue,
      ebitda: h.normalizedEbitda || h.ebitda,
    })),
    ...(data.kboNumber && { kbo_number: data.kboNumber }),
    ...(data.naceCode && { nace_code: data.naceCode }),
    ...(data.naceDescription && { nace_description: data.naceDescription }),
    ...(data.legalForm && { legal_form: data.legalForm }),
    ...((data.businessType || data.businessTypeCode) && { business_type_id: data.businessType || data.businessTypeCode }),
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

  // Provide i18n for normalization store toasts (store cannot use hooks)
  useEffect(() => {
    setNormalizationToastMessages((key) => t(key))
    return () => setNormalizationToastMessages(null)
  }, [t])
  const reportPanelRef = useRef<HTMLDivElement>(null)

  // Venus infrastructure
  const { user } = useAuth()
  const { identity, isAccountantFlow } = useBootstrap()
  useBootstrapSync()

  const { isCalculating, error, result, trySetCalculating, setCalculating, setResult } = useManualResultsStore()
  const { updateFormData } = useManualFormStore()
  const formStoreData = useManualFormStore((s) => s.formData)
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const sessionError = useSessionStore((s) => s.errorMessage)
  const reportIdFromSession = useSessionStore((s) => s.session?.reportId)
  const sessionName = useSessionStore((s) => s.session?.name)
  const { createVersion, getLatestVersion } = useVersionHistoryStore()
  const { generatePdf, downloadPdf, isGenerating: isPdfGenerating, isReady: isPdfReady } = usePdfGeneration(reportId)

  const currentLocale = useLocale()

  // ─── Accountant Mode Detection (hooks must be before any early returns) ───
  const [isAccountantMode, setIsAccountantMode] = useState(false)
  const [clientContextName, setClientContextName] = useState<string | undefined>(undefined)
  const [clientContextId, setClientContextId] = useState<string | undefined>(undefined)

  useEffect(() => {
    // Detect accountant mode from client context store
    import('../../../stores/clientContext').then(({ useClientContext }) => {
      const ctx = useClientContext.getState()
      if (ctx.isActingAsClient && ctx.client) {
        setIsAccountantMode(true)
        setClientContextName(ctx.client.fullName || ctx.client.email || undefined)
        setClientContextId(ctx.client.id)
      }
    }).catch(() => {
      // Non-critical
    })
  }, [])

  // Async loading: show calculator shell skeleton instead of blocking LoadingState
  const isLoading = status === 'loading'
  const isInitializing = status === 'idle' || status === 'loading'
  if (isLoading || isInitializing || !session || session.reportId !== reportId) {
    return <CalculatorShellSkeleton />
  }
  if (sessionError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-destructive/20 border border-destructive/30 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-destructive mb-2">Session Error</h3>
            <p className="text-destructive/80 mb-6">{sessionError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-lg transition-colors font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Report & Generation State ───
  const [report, setReport] = useState<ValuationReportData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [reportStatus, setReportStatus] = useState<'draft' | 'final'>('draft')
  const [isExporting, setIsExporting] = useState(false)
  const [downloadHistory, setDownloadHistory] = useState<{ id: string; fileName: string; timestamp: Date; size: string }[]>([])

  // ─── Panel View State ───
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>('report')
  const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>('input')

  // ─── Chat Co-pilot State ───
  const [chatDrawerOpen, setChatDrawerOpen] = useState(initialDrawerOpen)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatGenerating, setIsChatGenerating] = useState(false)
  const [fieldContext, setFieldContext] = useState<FieldContext | undefined>(undefined)
  const [pendingUpdates, setPendingUpdates] = useState<{ field: string; value: any; label: string }[]>([])

  // ─── Normalization State (Unified Store) ───
  const normalizationItems = useNormalizationStore((s) => s.items)
  const normalizationActions = useNormalizationStore()
  const [suggestedNormalisations, setSuggestedNormalisations] = useState<any[]>([])

  // ─── Modal State ───
  const [showFullscreenModal, setShowFullscreenModal] = useState(false)
  const [showNormalisationModal, setShowNormalisationModal] = useState(false)
  const [showUnifiedNormalizationModal, setShowUnifiedNormalizationModal] = useState(false)
  const [currentNormalisationSuggestion, setCurrentNormalisationSuggestion] = useState<NormalisationSuggestion | null>(null)

  // ─── Draft State ───
  const [draftStatus, setDraftStatus] = useState<'draft' | 'saved' | 'saving'>('draft')
  const [lastSaved, setLastSaved] = useState<Date | undefined>(undefined)

  // ─── Collected Data (bi-directional sync) ───
  const formCompanyName = useManualFormStore((s) => s.formData.company_name)
  const formBusinessTypeId = useManualFormStore((s) => s.formData.business_type_id)
  const formIndustry = useManualFormStore((s) => s.formData.industry)
  const formCountry = useManualFormStore((s) => s.formData.country_code)
  const formYearFounded = useManualFormStore((s) => s.formData.founding_year)
  const formKboNumber = useManualFormStore((s) => s.formData.kbo_number)
  const formLegalForm = useManualFormStore((s) => s.formData.legal_form)
  const formNaceCode = useManualFormStore((s) => s.formData.nace_code)
  const formNaceDescription = useManualFormStore((s) => s.formData.nace_description)
  const resultCompanyName = result?.company_name
  const companyName = formCompanyName || resultCompanyName

  const [collectedData, setCollectedData] = useState<CollectedData>({
    companyName: companyName || '',
    kboNumber: formKboNumber || '',
    legalForm: formLegalForm || '',
    naceCode: formNaceCode || '',
    naceDescription: formNaceDescription || '',
    businessType: formBusinessTypeId || '',
    industry: formIndustry || '',
    country: formCountry || 'BE',
    yearFounded: formYearFounded ? String(formYearFounded) : '',
    ownerManagers: 1,
    equityStake: 100,
  })

  // Sync form store changes into collectedData
  useEffect(() => {
    setCollectedData((prev) => {
      const next = { ...prev }
      if (companyName && companyName !== prev.companyName) next.companyName = companyName
      if ((formBusinessTypeId ?? '') !== prev.businessType) next.businessType = formBusinessTypeId ?? ''
      if (formIndustry && formIndustry !== prev.industry) next.industry = formIndustry
      if (formCountry && formCountry !== prev.country) next.country = formCountry
      const yearStr = formYearFounded ? String(formYearFounded) : ''
      if (yearStr && yearStr !== prev.yearFounded) next.yearFounded = yearStr
      if (formKboNumber && formKboNumber !== prev.kboNumber) next.kboNumber = formKboNumber
      if (formLegalForm && formLegalForm !== prev.legalForm) next.legalForm = formLegalForm
      if (formNaceCode && formNaceCode !== prev.naceCode) next.naceCode = formNaceCode
      if (formNaceDescription && formNaceDescription !== prev.naceDescription) next.naceDescription = formNaceDescription
      return next
    })
  }, [companyName, formBusinessTypeId, formIndustry, formCountry, formYearFounded, formKboNumber, formLegalForm, formNaceCode, formNaceDescription])

  // Display name for top-left dropdown: collectedData > client context (accountant) > fallback
  const displayCompanyName =
    collectedData.companyName?.trim() ||
    (isAccountantFlow && identity.clientContext?.clientCompanyName?.trim()) ||
    t('newEstimation')

  // Enable auto-persist for normalization store
  useEffect(() => {
    const unsub = enableNormalizationAutoPersist(() => reportId || undefined)
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
  const versions = useVersionHistoryStore((s) => s.versions[reportId] || [])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('current')

  // Fetch versions on mount
  useEffect(() => {
    if (reportId) {
      useVersionHistoryStore.getState().fetchVersions(reportId).catch(() => {
        // Non-critical: versions will show empty
      })
    }
  }, [reportId])

  // Map versions to CalculatorNav format
  const versionHistoryForNav = React.useMemo(() => {
    if (versions.length === 0 && report) {
      return [{
        id: 'current',
        label: t('currentVersion'),
        priceRange: { min: Math.round(report.valuation * 0.85), max: Math.round(report.valuation * 1.15) },
        askPrice: report.valuation,
        timestamp: report.generatedAt,
        isActive: true,
      }]
    }
    return versions.map((v) => {
      const vr = v.valuationResult as any
      return {
        id: v.id,
        label: v.versionLabel,
        priceRange: {
          min: vr?.valuation_low || vr?.valuation_result?.valuation_low || 0,
          max: vr?.valuation_high || vr?.valuation_result?.valuation_high || 0,
        },
        askPrice: vr?.valuation_high || vr?.valuation_result?.valuation_high || 0,
        timestamp: v.createdAt,
        isActive: v.isActive,
      }
    })
  }, [versions, report])

  const handleSelectVersion = useCallback((id: string) => {
    setSelectedVersionId(id)
    const version = versions.find((v) => v.id === id)
    if (version?.valuationResult) {
      setResult(version.valuationResult)
      toast.info(t('versionLoaded', { label: version.versionLabel }))
    }
  }, [versions, setResult])

  // ─── Bridge: Result from Venus API → Report for Clarity components ───
  useEffect(() => {
    if (result) {
      onComplete(result)
      const r = result as any
      setReport({
        id: r.id || 'draft',
        companyName: r.company_name || 'Bedrijfsschatting',
        valuation: r.valuation_result?.valuation_high || 0,
        valuationLow: r.valuation_result?.valuation_low,
        valuationHigh: r.valuation_result?.valuation_high,
        ebitda: r.valuation_result?.normalized_ebitda || 0,
        normalizedEbitda: r.valuation_result?.normalized_ebitda,
        multiple: r.valuation_result?.multiple_high || 0,
        multipleRange: r.valuation_result?.multiple_low
          ? { min: r.valuation_result.multiple_low, max: r.valuation_result.multiple_high }
          : undefined,
        generatedAt: new Date(),
        confidence: 'medium',
        htmlReport: r.html_report || undefined,
        metrics: [
          { label: 'Gem. Omzet', value: `€${((r.financials?.revenue || 0) / 1_000_000).toFixed(2)}M` },
          { label: 'EBITDA Marge', value: `${(((r.valuation_result?.normalized_ebitda || 0) / (r.financials?.revenue || 1)) * 100).toFixed(1)}%` },
          { label: 'Sector', value: r.business_type || 'Services' },
        ],
      })
      setDraftStatus('saved')
      setLastSaved(new Date())
      setShowFullscreenModal(true)

      // Auto-trigger PDF generation in background (fire and forget)
      if (reportId && r.html_report) {
        generatePdf?.().catch(() => {})
      }
    }
  }, [result, onComplete, reportId, generatePdf])

  // Store last submitted data for retry capability
  const lastSubmittedDataRef = useRef<any>(null)

  // ─── Manual Form Submit Handler (REAL - wired to Venus services) ───
  const handleManualSubmit = useCallback(async (data: any) => {
    // Validation
    if (!data.companyName?.trim()) {
      toast.error(t('companyNameMissing'), { description: t('companyNameMissingDesc') })
          return
        }
    if (!data.businessType?.trim()) {
      toast.error(t('businessTypeMissing'), { description: t('businessTypeMissingDesc') })
      return
    }
    if (!data.yearlyFinancials?.some((yf: any) => yf.revenue > 0 && yf.ebitda > 0)) {
      toast.error(t('financialDataIncomplete'), { description: t('financialDataIncompleteDesc') })
      return
    }

    // Prevent double submission
    const wasSet = trySetCalculating()
    if (!wasSet) return

    // Store for retry capability
    lastSubmittedDataRef.current = data

    setIsGenerating(true)

    // Sync collected data for UI
    setCollectedData({
      companyName: data.companyName,
      businessType: data.businessType,
      industry: data.industry,
      country: data.country,
      yearFounded: data.yearFounded,
      ownerManagers: data.ownerManagers,
      equityStake: data.equityStake,
    })

    try {
      // Step 1: Map ManualInputPanel form data → Venus store format
      const venusFormData = mapClarityFormToVenusStore(data)
      updateFormData(venusFormData)

      // Step 2: Build API request from store
      const storeSnapshot = { ...formStoreData, ...venusFormData }
      const request = buildValuationRequest(storeSnapshot)
      ;(request as any).dataSource = 'manual'
      if (reportId) (request as any).reportId = reportId

      // Step 3: Detect version changes for M&A workflow
      let previousVersion: any = null
      let changes: any = null
      if (reportId) {
        previousVersion = getLatestVersion(reportId)
        if (previousVersion) {
          changes = detectVersionChanges(previousVersion.formData, request)
          generalLogger.info('Regeneration detected', {
            reportId,
            previousVersion: previousVersion.versionNumber,
            totalChanges: changes.totalChanges,
          })
        }
      }

      // Step 4: Call real ValuationService
      generalLogger.info('[ManualLayout] Calling valuationService.calculateValuation', {
        companyName: request.company_name,
        industry: request.industry,
      })
      const calcResult = await valuationService.calculateValuation(request)

      if (!calcResult) {
        setCalculating(false)
        setIsGenerating(false)
        toast.error(t('calculationFailed'), {
          description: t('calculationFailedNoResult'),
          action: {
            label: t('retry') || 'Retry',
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

      // Step 6: Create version (M&A workflow)
      if (reportId) {
        try {
          if (previousVersion && changes && areChangesSignificant(changes)) {
            const newVersion = await createVersion({
              reportId,
              formData: request,
              valuationResult: calcResult,
              htmlReport: calcResult.html_report || undefined,
              infoTabHtml: calcResult.info_tab_html || undefined,
              changesSummary: changes,
              versionLabel: generateAutoLabel(previousVersion.versionNumber + 1, changes),
            })
            await snapshotNormalizationsToVersion(reportId, newVersion.id)
          } else if (!previousVersion) {
            const firstVersion = await createVersion({
              reportId,
              formData: request,
              valuationResult: calcResult,
              htmlReport: calcResult.html_report || undefined,
              infoTabHtml: calcResult.info_tab_html || undefined,
              changesSummary: { totalChanges: 0, significantChanges: [] },
              versionLabel: 'v1 - Initial valuation',
            })
            await snapshotNormalizationsToVersion(reportId, firstVersion.id)
          }
        } catch (versionError) {
          generalLogger.error('Failed to create version', {
            reportId,
            error: versionError instanceof Error ? versionError.message : String(versionError),
          })
        }
      }

      // Step 7: Save complete report package to backend
      if (reportId) {
        try {
          await reportService.saveReportAssets(reportId, {
            sessionData: storeSnapshot,
            valuationResult: calcResult,
            htmlReport: calcResult.html_report,
            infoTabHtml: calcResult.info_tab_html,
            name: sessionName,
          })
          useSessionStore.getState().markSaved()
        } catch (saveError) {
          generalLogger.error('[ManualLayout] Failed to save report assets', {
            reportId,
            error: saveError instanceof Error ? saveError.message : String(saveError),
          })
        }
      }

      toast.success(t('calculationComplete'))
    } catch (error) {
      setCalculating(false)
      setIsGenerating(false)
      const message = error instanceof Error ? error.message : t('unknownError')
      toast.error(t('calculationFailed'), {
        description: message,
        action: {
          label: t('retry') || 'Retry',
          onClick: () => {
            if (lastSubmittedDataRef.current) {
              handleManualSubmit(lastSubmittedDataRef.current)
            }
          },
        },
      })
      generalLogger.error('[ManualLayout] Form submission failed', { error: message })
    }
  }, [reportId, formStoreData, updateFormData, trySetCalculating, setCalculating, setResult, getLatestVersion, createVersion, sessionName])

  // ─── Chat Handlers (bi-directional sync) ───
  const handleApplyFieldUpdate = useCallback((field: string, value: any) => {
    const dataKey = field === 'business_type_id' ? 'businessType' : field
    setCollectedData((prev) => ({ ...prev, [dataKey]: value }))
    // Sync businessType to form store (business_type_id) so form store stays in sync
    if ((field === 'businessType' || field === 'business_type_id') && typeof value === 'string') {
      updateFormData({ business_type_id: value })
    }
    toast.success(t('fieldUpdated', { field, value: typeof value === 'number' ? `€${value.toLocaleString('nl-BE')}` : String(value) }))
    setChatMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'system' as const, content: t('fieldApplied', { field }), timestamp: new Date() },
    ])
  }, [updateFormData])

  const handleChatMessage = useCallback(
    async (content: string, attachments?: File[], detectedValues?: any[], parsedCommands?: any[]) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
        attachments: attachments?.map((f) => ({ name: f.name, type: f.type, url: URL.createObjectURL(f) })),
      }
      setChatMessages((prev) => [...prev, userMessage])
      setIsChatGenerating(true)

      try {
        // Handle parsed commands
        if (parsedCommands?.length) {
          parsedCommands.forEach((cmd: any) => handleApplyFieldUpdate(cmd.field, cmd.value))
          await new Promise((r) => setTimeout(r, 500))
          const commandsList = parsedCommands.map((cmd: any) => `- **${cmd.label}** → €${cmd.value.toLocaleString('nl-BE')}`).join('\n')
          setChatMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant' as const, content: `${t('normApplied')}\n\n${commandsList}`, timestamp: new Date() },
          ])
          setIsChatGenerating(false)
          return
        }

        // Handle detected values
        if (detectedValues?.length) {
          setPendingUpdates((prev) => [...prev, ...detectedValues.map((dv: any) => ({ field: dv.field, value: dv.value, label: dv.label }))])
        }

        // Call real AI service (with automatic fallback to local responses)
        // Enrich context with normalization summary and form completeness
        const accepted = normalizationItems.filter((n) => n.status === 'accepted')
        const pending = normalizationItems.filter((n) => n.status === 'pending')
        const totalAdjustment = accepted.reduce((sum, n) => sum + n.adjustment, 0)
        const categories = [...new Set(normalizationItems.map((n) => n.category))]
        const formFields = Object.entries(collectedData).filter(([, v]) => v !== '' && v !== undefined && v !== null)
        const formCompletenessScore = Math.round((formFields.length / 7) * 100)
        const versions = reportId ? (useVersionHistoryStore.getState().versions[reportId] || []) : []

        const enrichedFormData = {
          ...collectedData,
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
        const aiResponse = await aiChatService.sendMessage({
          message: content,
          sessionId: reportId || undefined,
          companyName: collectedData.companyName,
          fieldContext: fieldContext || undefined,
          normalizations: normalizationItems,
          formData: enrichedFormData,
          // Send last 10 messages as context for Claude (filter to user/assistant only)
          history: chatMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-10)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        })

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: aiResponse.content,
          timestamp: new Date(),
          fieldUpdates: aiResponse.fieldUpdates,
          normalisationSuggestions: aiResponse.normalisationSuggestions?.map((s: any) => ({
            ...s,
            id: crypto.randomUUID(),
            status: 'pending',
            multiple: 5.2,
          })),
        }
        setChatMessages((prev) => [...prev, assistantMsg])

        // Notify user if AI fell back to local responses
        if (aiResponse.fallback) {
          toast.info(t('aiUnavailable'), {
            description: t('aiUnavailableDesc'),
            duration: 4000,
          })
        }

        if (aiResponse.fieldUpdates) {
          setPendingUpdates((prev) => [...prev, ...aiResponse.fieldUpdates!])
        }

        // Add AI normalization suggestions to the unified normalizations list
        if (aiResponse.normalisationSuggestions?.length) {
          const newItems: NormalizationItem[] = aiResponse.normalisationSuggestions.map((s: any) => ({
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
          // Also persist AI suggestions to session
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
        }
      } catch {
        setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant' as const, content: t('chatError'), timestamp: new Date() }])
      } finally {
        setIsChatGenerating(false)
      }
    },
    [collectedData, handleApplyFieldUpdate, reportId, fieldContext, normalizationItems, chatMessages]
  )

  const handleAcceptUpdate = useCallback((field: string) => {
    setPendingUpdates((prev) => prev.filter((u) => u.field !== field))
  }, [])

  const handleRejectUpdate = useCallback((field: string) => {
    setPendingUpdates((prev) => prev.filter((u) => u.field !== field))
    toast.info(t('suggestionRejected'))
  }, [])

  // ─── Export Handler (server-side primary, client-side fallback) ───
  const handleExport = useCallback(async () => {
    if (!report) return
    setIsExporting(true)

    let serverPdfSucceeded = false

    try {
      // Path 1: Server-side PDF via Titan API (primary)
      try {
        if (isPdfReady) {
          await downloadPdf()
          serverPdfSucceeded = true
        } else if (reportId) {
          toast.loading(t('pdfGenerating'), { id: 'pdf-gen' })
          await generatePdf()
          toast.dismiss('pdf-gen')
          if (isPdfReady) {
            await downloadPdf()
            serverPdfSucceeded = true
          }
        }
      } catch (serverError) {
        toast.dismiss('pdf-gen')
        generalLogger.warn('[ManualLayout] Server PDF failed, falling back to client-side', {
          error: serverError instanceof Error ? serverError.message : String(serverError),
        })
      }

      // Path 2: Client-side PDF fallback (server unavailable or failed)
      if (!serverPdfSucceeded) {
        toast.info(t('pdfServerUnavailable'))
        const htmlContent = result?.html_report || ''
        await DownloadService.downloadPDF(
          {
            companyName: report.companyName,
            valuationAmount: report.valuation,
            htmlContent,
          },
          {
            format: 'pdf',
            filename: `${report.companyName?.replace(/\s+/g, '-') || 'Rapport'}-Waardering.pdf`,
          }
        )
      }

      setDownloadHistory((prev) => [
        {
          id: crypto.randomUUID(),
          fileName: `${report.companyName?.replace(/\s+/g, '-') || 'Rapport'}-Waardering.pdf`,
          timestamp: new Date(),
          size: 'PDF',
        },
        ...prev,
      ])
      toast.success(t('pdfDownloaded'))
    } catch (error) {
      generalLogger.error('[ManualLayout] PDF export failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(t('pdfExportFailed'), { description: t('pdfExportFailedDesc') })
    } finally {
      setIsExporting(false)
    }
  }, [report, reportId, result, isPdfReady, isPdfGenerating, downloadPdf, generatePdf])

  // ─── Navigation Handlers ───
  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleExitClientView = useCallback(() => {
    try {
      import('../../../stores/clientContext').then(({ useClientContext }) => {
        const ctx = useClientContext.getState()
        ctx.clearClientContext()
      }).catch(() => {})

      // Try to close embedded mode (sends postMessage to parent)
      try {
        window.parent?.postMessage({ type: 'venus:close' }, '*')
      } catch {}

      // Navigate to Mercury
      const mercuryUrl = getMercuryUrl()
      const validLocale = currentLocale && (currentLocale === 'en' || currentLocale === 'nl') ? currentLocale : 'en'

      let returnUrl: string | null = null
      try { returnUrl = sessionStorage.getItem('upswitch_return_url') } catch {}

      if (returnUrl) {
        if (returnUrl.startsWith('http')) {
          window.location.href = returnUrl
        } else {
          window.location.href = `${mercuryUrl}${returnUrl.startsWith('/') ? '' : '/'}${returnUrl}`
        }
        return
      }

      if (clientContextId) {
        window.location.href = `${mercuryUrl}/${validLocale}/accountant/clients/${clientContextId}/valuations`
      } else {
        window.location.href = `${mercuryUrl}/${validLocale}/accountant/dashboard`
      }
    } catch (error) {
      generalLogger.error('[ManualLayout] handleExitClientView failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        window.location.href = `${getMercuryUrl()}/en/accountant/dashboard`
      } catch {}
    }
  }, [clientContextId, currentLocale])

  const handlePreview = useCallback(() => setRightPanelView('preview'), [])
  const handleShowHistory = useCallback(() => setRightPanelView('history'), [])
  const handleFullscreen = useCallback(() => setShowFullscreenModal(true), [])
  const handleOpenAssistant = useCallback(() => setChatDrawerOpen((prev) => !prev), [])

  // ─── Session Navigation (New, Select, Recent) ───
  const [recentValuations, setRecentValuations] = useState<Array<{ id: string; companyName: string; updatedAt: Date; isDraft?: boolean }>>([])

  useEffect(() => {
    // Load recent valuations from reports API (proxies to Titan)
    fetch('/api/reports?limit=5&offset=0', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data) => {
        const reports = data.reports || data.data || data.items || []
        setRecentValuations(
          reports.slice(0, 5).map((r: any) => ({
            id: r.id || r.reportId,
            companyName: r.company_name || r.companyName || t('unnamed'),
            updatedAt: new Date(r.updated_at || r.updatedAt || r.created_at),
            isDraft: r.status === 'draft',
          }))
        )
      })
      .catch(() => {
        // Non-blocking: recent valuations are nice-to-have
      })
  }, [])

  const handleNewValuation = useCallback(() => {
    const prefilled =
      collectedData.companyName?.trim() ||
      (isAccountantFlow && identity.clientContext?.clientCompanyName?.trim())
    const url = `/${currentLocale}/reports/new`
    if (prefilled) {
      router.push(`${url}?prefilledQuery=${encodeURIComponent(prefilled)}`)
    } else {
      router.push(url)
    }
  }, [
    router,
    currentLocale,
    collectedData.companyName,
    isAccountantFlow,
    identity.clientContext?.clientCompanyName,
  ])

  const handleSelectValuation = useCallback(
    (id: string) => {
      router.push(`/${currentLocale}/reports/${id}`)
    },
    [router, currentLocale]
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
    window.location.href = `${mercuryBaseUrl}/${currentLocale}/accountant/settings`
  }, [currentLocale])

  const handleSwitchWorkspace = useCallback(() => {
    router.push(`/${currentLocale}/home`)
  }, [router, currentLocale])

  // ─── Field Help (opens Chat with context) ───
  const handleFieldHelpRequest = useCallback(
    (context: any) => {
      setFieldContext({ field: context.field, label: context.label, value: context.value, hint: context.hint })
      setChatDrawerOpen(true)
      const q =
        context.normalizationType === 'salary'
          ? `Wat is een marktconform salaris voor ${context.label.toLowerCase()}?`
          : context.normalizationType === 'rent'
            ? `Is de huurprijs voor ${context.label.toLowerCase()} marktconform?`
            : context.field === 'ownerManagers'
              ? 'Hoeveel eigenaar-managers is gebruikelijk voor dit type bedrijf?'
              : `Help me met ${context.label.toLowerCase()}`
      setTimeout(() => handleChatMessage(q), 300)
    },
    [handleChatMessage]
  )

  // ─── Normalization Handlers (unified store) ───
  const handleShowNormalisationReview = useCallback(() => setLeftPanelView('normalization-hub'), [])

  const handleAcceptNormalisation = useCallback((id: string) => {
    normalizationActions.acceptItem(id)
    setSuggestedNormalisations((prev: any[]) =>
      prev.map((n: any) => (n.id === id ? { ...n, status: 'accepted' } : n)),
    )
    // Immediate persist to Titan on accept
    if (reportId) {
      const item = useNormalizationStore.getState().items.find((n) => n.id === id)
      if (item) normalizationActions.persistToTitan(reportId, item.year)
    }
    // Real-time recalculation
    recalculateWithNormalizations(useNormalizationStore.getState().items)
  }, [reportId, normalizationActions])

  const handleRejectNormalisation = useCallback((id: string) => {
    normalizationActions.rejectItem(id)
    setSuggestedNormalisations((prev: any[]) =>
      prev.map((n: any) => (n.id === id ? { ...n, status: 'rejected' } : n)),
    )
    // Immediate persist to Titan on reject
    if (reportId) {
      const item = useNormalizationStore.getState().items.find((n) => n.id === id)
      if (item) normalizationActions.persistToTitan(reportId, item.year)
    }
    // Real-time recalculation
    recalculateWithNormalizations(useNormalizationStore.getState().items)
  }, [reportId, normalizationActions])

  // ─── Auto-recalculate valuation with normalized EBITDA ───
  // IMPORTANT: Do NOT manually mutate EBITDA here. buildValuationRequest reads accepted
  // normalizations from useNormalizationStore and applies them. Mutating formStore EBITDA
  // would cause double-counting because buildValuationRequest adds adjustments on top.
  const recalculateWithNormalizations = useCallback(async (normalizations: NormalizationItem[]) => {
    if (!report || !reportId) return

    const acceptedNorms = normalizations.filter((n) => n.status === 'accepted')
    if (acceptedNorms.length === 0) return

    try {
      // buildValuationRequest reads from useNormalizationStore and applies
      // accepted normalizations to the reported EBITDA — single source of truth.
      const request = buildValuationRequest(formStoreData)
      ;(request as any).dataSource = 'manual'
      if (reportId) (request as any).reportId = reportId

      const calcResult = await valuationService.calculateValuation(request)
      if (calcResult) {
        setResult(calcResult)
        setDraftStatus('saved')
        setLastSaved(new Date())
        toast.success(t('recalculatedWithNorms'), {
          description: t('recalculatedWithNormsDesc', { count: acceptedNorms.length }),
        })
      }
    } catch (error) {
      generalLogger.warn('[ManualLayout] Normalization recalculation failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [report, reportId, formStoreData, buildValuationRequest, valuationService, setResult])

  const handleNormalisationReviewContinue = useCallback(() => {
    setLeftPanelView('input')
    const items = useNormalizationStore.getState().items
    // Persist to both session and Titan
    if (reportId) {
      normalizationActions.persistToSession(reportId)
      const years = [...new Set(items.map((n) => n.year))]
      years.forEach((y) => normalizationActions.persistToTitan(reportId, y))
    }
    // Trigger automatic re-valuation with accepted normalizations
    recalculateWithNormalizations(items)
    toast.success(t('normalizationsSaved'))
  }, [reportId, normalizationActions, recalculateWithNormalizations])

  const handleNormalisationReviewBack = useCallback(() => setLeftPanelView('input'), [])

  // ─── Version Restore ───
  // Receives full ValuationVersion from HistoryPanel (looked up from store)
  const handleVersionRestore = useCallback(async (version: any) => {
    try {
      const versionNumber = version.versionNumber || version.version

      // 1. Notify backend (graceful — don't block on failure)
      if (reportId && versionNumber) {
        import('../../../services/api/version/VersionAPI').then(({ VersionAPI }) => {
          const api = new VersionAPI()
          api.restoreVersion(reportId, versionNumber).catch(() => {
            generalLogger.warn('[ManualLayout] Backend restore notification failed (non-blocking)')
          })
        }).catch(() => {})
      }

      // 2. Hydrate form with version's form data (ValuationVersion.formData)
      if (version.formData) {
        updateFormData(version.formData)
      }

      // 3. Set valuation result (ValuationVersion.valuationResult)
      if (version.valuationResult) {
        setResult(version.valuationResult)
      }

      // 4. Restore normalizations from normalization_data snapshot
      if (version.normalization_data && typeof version.normalization_data === 'object') {
        // Convert year-keyed normalization_data back to NormalizationItem[]
        const items: NormalizationItem[] = []
        for (const [year, data] of Object.entries(version.normalization_data as Record<string, any>)) {
          if (data?.adjustments && Array.isArray(data.adjustments)) {
            items.push(...data.adjustments.map((adj: any) => ({
              ...adj,
              year: Number(year),
              status: adj.status || 'accepted',
            })))
          }
        }
        if (items.length > 0) {
          normalizationActions.setItems(items)
        }
      }

      // 5. Update version history active version
      if (reportId && versionNumber) {
        useVersionHistoryStore.getState().setActiveVersion(reportId, versionNumber)
      }

      setRightPanelView('report')
      toast.success(t('versionRestored', { version: versionNumber }))
    } catch (error) {
      generalLogger.warn('[ManualLayout] Version restore failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(t('versionRestoreFailed'))
    }
  }, [reportId, updateFormData, setResult, normalizationActions])

  // ─── CSV Import → Normalization Hub ───
  const handleCSVImportComplete = useCallback(async (source: 'yuki' | 'exact' | 'odoo', _fileName?: string) => {
    const labels = { yuki: 'Yuki', exact: 'Exact Online', odoo: 'Odoo' }
    toast.success(t('importStarted', { source: labels[source] }), { description: t('importStartedDesc') })

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
        suggestions = generateDefaultNormalizationSuggestions(source)
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
        applyAllYears: false,
        year: new Date().getFullYear() - 1,
      }))

      setSuggestedNormalisations(suggestions)
      normalizationActions.setItems(unifiedItems)
      setLeftPanelView('normalization-hub')
      setChatDrawerOpen(true)

      // Save normalizations to backend (auto-persist handles session)
      if (reportId) normalizationActions.persistToSession(reportId)

      // Also persist via normalization API for structured storage
      if (reportId) {
        const { normalizationService } = await import('../../../services/ebitdaNormalizationService')
        await normalizationService.saveNormalization({
          sessionId: reportId,
          year: new Date().getFullYear() - 1,
          adjustments: unifiedItems.map(n => ({
            category: mapFrontendCategoryToBackend(n.category),
            amount: n.adjustment,
            description: n.reason,
            ledgerCode: n.ledgerCode,
          })),
          source,
        } as any).catch(() => {
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
  }, [reportId, collectedData, normalizationActions])

  // ─── Normalisation Suggestion Modal ───
  const handleNormalisationSuggestionAccept = useCallback(
    (suggestion: NormalisationSuggestion, customValue?: number) => {
      const value = customValue !== undefined ? customValue : suggestion.suggestedValue
      handleApplyFieldUpdate(suggestion.field, value)
      setShowNormalisationModal(false)
      setCurrentNormalisationSuggestion(null)
      toast.success(t('normNormalized', { label: suggestion.label, value: value.toLocaleString('nl-BE') }))
    },
    [handleApplyFieldUpdate]
  )

  const handleNormalisationSuggestionReject = useCallback(() => {
    setShowNormalisationModal(false)
    setCurrentNormalisationSuggestion(null)
    toast.info(t('suggestionRejected'))
  }, [])

  // ─── Shared ManualInputPanel Props ───
  const manualInputProps = {
    onSubmit: handleManualSubmit,
    onCSVImportComplete: handleCSVImportComplete,
    isCalculating: isGenerating || isCalculating,
    onFieldHelpRequest: handleFieldHelpRequest,
    quickActions: suggestedNormalisations,
    onQuickActionAccept: handleAcceptNormalisation,
    onQuickActionReject: handleRejectNormalisation,
    onViewAllNormalizations: handleShowNormalisationReview,
    initialData: {
      companyName: collectedData.companyName,
      kboNumber: collectedData.kboNumber,
      legalForm: collectedData.legalForm,
      naceCode: collectedData.naceCode,
      naceDescription: collectedData.naceDescription,
      businessType: collectedData.businessType,
      industry: collectedData.industry,
      country: collectedData.country,
      yearFounded: collectedData.yearFounded,
      equityStake: collectedData.equityStake,
      ownerManagers: collectedData.ownerManagers,
    },
  }

  // ─── Shared Chat Drawer Props ───
  const chatDrawerProps = {
    open: chatDrawerOpen,
    onOpenChange: setChatDrawerOpen,
    messages: chatMessages,
    onSendMessage: handleChatMessage,
    isGenerating: isChatGenerating,
    companyName: collectedData.companyName,
    fieldContext,
    onApplyFieldUpdate: handleApplyFieldUpdate,
    pendingUpdates,
    onAcceptUpdate: handleAcceptUpdate,
    onRejectUpdate: handleRejectUpdate,
    onAcceptNormalisation: handleAcceptNormalisation,
    onRejectNormalisation: handleRejectNormalisation,
    hasUploadedData: suggestedNormalisations.length > 0,
    onOpenNormalizationHub: () => {
      setLeftPanelView('normalization-hub')
      setChatDrawerOpen(false)
    },
  }

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
          userName={user?.name || user?.email || t('guest')}
          userInitials={getUserInitials(user)}
          avatarUrl={user?.avatar_url || user?.avatar}
          onOpenAssistant={handleOpenAssistant}
          isAssistantOpen={chatDrawerOpen}
          onOpenNormalization={() => setShowUnifiedNormalizationModal(true)}
          normalizationCount={normalizationItems.filter((n) => n.status === 'accepted').length}
          openTasksCount={suggestedNormalisations.filter((n: any) => n.status === 'pending').length + pendingUpdates.length}
          isExporting={isExporting}
          recentValuations={recentValuations}
          onNewValuation={handleNewValuation}
          onSelectValuation={handleSelectValuation}
          onLogout={handleLogout}
          onAccountSettings={handleAccountSettings}
          onSwitchWorkspace={handleSwitchWorkspace}
          isAccountantMode={isAccountantMode}
          onExitClientView={handleExitClientView}
        />

        <div className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
          <ManualInputPanel {...manualInputProps} />
        </div>

        <ChatAssistantDrawer {...chatDrawerProps} />

        <FullscreenReportModal
          open={showFullscreenModal}
          onOpenChange={setShowFullscreenModal}
          report={report}
          onDownload={handleExport}
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
        userName={user?.name || user?.email || t('guest')}
        userInitials={getUserInitials(user)}
        avatarUrl={user?.avatar_url || user?.avatar}
        onOpenAssistant={handleOpenAssistant}
        isAssistantOpen={chatDrawerOpen}
        onOpenNormalization={() => setShowUnifiedNormalizationModal(true)}
        normalizationCount={normalizationItems.filter((n) => n.status === 'accepted').length}
        openTasksCount={suggestedNormalisations.filter((n: any) => n.status === 'pending').length + pendingUpdates.length}
        isExporting={isExporting}
        downloadHistory={downloadHistory}
        onRedownload={(item: any) => {
          if (item.url) {
            window.open(item.url, '_blank')
          } else {
            toast.info(t('pdfRegenerating'), { description: t('pdfRegeneratingDesc') })
          }
        }}
        valuationSummary={
          report
            ? {
                priceRange: { min: Math.round(report.valuation * 0.85), max: Math.round(report.valuation * 1.15) },
                askPrice: report.valuation,
                confidence: 'high' as const,
              }
            : undefined
        }
        valuationVersions={
          versionHistoryForNav
        }
        selectedVersionId={selectedVersionId}
        onSelectVersion={handleSelectVersion}
        onContinueToListing={() => {
          const mercuryBaseUrl = getMercuryUrl()
          window.location.href = `${mercuryBaseUrl}/${currentLocale}/accountant/listings`
        }}
        recentValuations={recentValuations}
        onNewValuation={handleNewValuation}
        onSelectValuation={handleSelectValuation}
        onLogout={handleLogout}
        onAccountSettings={handleAccountSettings}
        onSwitchWorkspace={handleSwitchWorkspace}
        isAccountantMode={isAccountantMode}
        onExitClientView={handleExitClientView}
      />

      {/* Main Content: Resizable Panels */}
      <div className="flex-1 min-w-0 overflow-hidden m-4 rounded-xl border border-foreground/[0.06]">
        <ResizablePanelGroup className="h-full w-full">
          {/* Left Panel: ManualInput or NormalizationHub */}
          <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
            <AnimatePresence mode="wait">
              {leftPanelView === 'normalization-hub' ? (
                <motion.div
                  key="normalization-hub"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={springDefault}
                  className="h-full"
                >
                  <Suspense fallback={<PanelSkeleton />}>
                  <NormalizationHub
                    companyName={collectedData.companyName || t('company')}
                    originalEbitda={report?.ebitda || 0}
                    sourceIntegration="manual"
                    normalizations={normalizationItems}
                    onNormalizationsChange={(norms) => normalizationActions.setItems(norms)}
                    onContinue={handleNormalisationReviewContinue}
                    onBack={handleNormalisationReviewBack}
                    hasUploadedData={suggestedNormalisations.length > 0}
              />
            </Suspense>
                </motion.div>
              ) : (
                <motion.div
                  key="manual"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={springDefault}
                  className="h-full"
                >
                  <ManualInputPanel {...manualInputProps} />
                </motion.div>
              )}
            </AnimatePresence>
          </ResizablePanel>

          {/* Resize Handle */}
          <ResizableHandle
            withHandle
            className="w-px bg-foreground/[0.06] hover:bg-primary/30 data-[state=dragging]:bg-primary/50 transition-colors"
          />

          {/* Right Panel: Report / Preview / History */}
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
                      className="h-full overflow-y-auto p-8"
                    >
                      <div className="text-center text-foreground/50 py-20">
                        <p className="text-lg font-medium">{t('reportPreview')}</p>
                        <p className="text-sm mt-2">{t('reportPreviewDesc')}</p>
                      </div>
                    </motion.div>
                  ) : rightPanelView === 'history' ? (
                    <motion.div
                      key="history"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={springDefault}
                      className="h-full"
                    >
                      <Suspense fallback={<PanelSkeleton />}>
                        <HistoryPanel report={report} onVersionRestore={handleVersionRestore} />
                      </Suspense>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="report"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={springDefault}
                      className="h-full"
                    >
                      <ValuationReportPanel
                        report={report}
                        isGenerating={isGenerating || isCalculating}
                        isExporting={isExporting}
                        onExport={handleExport}
                        onRegenerate={() => {
                          // Clean reset for regeneration
                          setReport(null)
                          setResult(null as any)
                          setReportStatus('draft')
                          setRightPanelView('report')
                          // Clear PDF cache if any
                          if (reportId) {
                            try { sessionStorage.removeItem(`pdf_${reportId}`) } catch {}
                          }
                          toast.info(t('readyForRecalculation'))
                        }}
                        reportStatus={reportStatus}
                        onStatusChange={setReportStatus}
                      />
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

      {/* Unified Normalization Modal */}
      <UnifiedNormalizationModal
        open={showUnifiedNormalizationModal}
        onOpenChange={setShowUnifiedNormalizationModal}
        companyName={collectedData.companyName || t('company')}
        currentYear={new Date().getFullYear() - 1}
        originalEBITDA={report?.ebitda || 0}
        normalizations={normalizationItems}
        onNormalizationsChange={(norms) => normalizationActions.setItems(norms)}
        onUploadClick={() => {}}
      />
    </div>
  )
}
