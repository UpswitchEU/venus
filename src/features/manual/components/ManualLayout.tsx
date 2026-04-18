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
  HistoryPanel,
  ManualInputPanel,
  type NormalisationSuggestion,
  NormalisationSuggestionModal,
  type NormalizationItem,
  type RecentValuation,
  type RightPanelView,
  UnifiedNormalizationModal,
  type ValuationReportData,
} from '../../../components/calculator'
import { SourceDataPanel } from '../../../components/calculator/SourceDataPanel'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import { ValuationEditModal } from '../../../components/calculator/ValuationEditModal'
import { NewValuationModal } from '../../../components/NewValuationModal'
import { RecalculateConfirmationPopup } from '../../../components/normalization/RecalculateConfirmationPopup'
import { ReportPlaceholder } from '../../../components/skeletons/ReportPlaceholder'
import { ReportSkeleton } from '../../../components/skeletons/ReportSkeleton'
import { filterPreSelectableMethodsForOwnerFounder } from '../../../constants/accountantPlanMethods'
import { isUpfrontMethodAllowedForNav } from '../../../constants/methodFieldConfig'
import { getStarterPlanSummary } from '../../../constants/pricing'
import { AuroraButton } from '../../../design-system/components/Button'
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
import { useCredits } from '../../../hooks/useCredits'
import { EMBEDDED_STORAGE_KEY } from '../../../hooks/useEmbeddedMode'
import { useFormSessionSync } from '../../../hooks/useFormSessionSync'
import { usePdfGeneration } from '../../../hooks/usePdfGeneration'
import { usePrefillRestorationCoordinator } from '../../../hooks/usePrefillRestorationCoordinator'
import { usePreSelectedMethodSessionSync } from '../../../hooks/usePreSelectedMethodSessionSync'
import { useSessionOptionalMethodPrefill } from '../../../hooks/useSessionOptionalMethodPrefill'
import { useUpfrontMethodNavInputs } from '../../../hooks/useUpfrontMethodNavInputs'
import { useBootstrap } from '../../../lib/bootstrap/BootstrapProvider'
import { getSafeMercuryReturnUrl, isLegacyReturnUrl } from '../../../lib/return-url'
import { reportService, valuationService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import { backendAPI } from '../../../services/backendApi'
import { looksLikeNaceCode } from '../../../services/naceBusinessTypeService'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import {
  buildPersistedPreparerMultiplePayload,
  buildPreparerMultiplePayload,
  clientShouldWarnExtremeMultiple,
  mergePreparerMultipleIntoRequest,
  usePreparerMultipleStore,
} from '../../../store/manual/usePreparerMultipleStore'
import { useConversationStore } from '../../../store/useConversationStore'
import { useNbbPrefillStore } from '../../../store/useNbbPrefillStore'
import {
  enableNormalizationAutoPersist,
  mapBackendCategoryToFrontend,
  mapFrontendCategoryToBackend,
  setNormalizationToastMessages,
  useNormalizationStore,
} from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import {
  parseSpotlightDomId,
  spotlightDomId,
  useSpotlightStore,
} from '../../../store/useSpotlightStore'
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
import type {
  ValuationMethodResult,
  ValuationResponse,
  ValuationFormData as VenusFormData,
  YearDataInput,
} from '../../../types/valuation'
import { attachSynthesisWeightsToValuationRequest } from '../../../utils/attachSynthesisWeightsToValuationRequest'
import { buildValuationRequest } from '../../../utils/buildValuationRequest'
import { buildManualValuationRequest } from '../../../utils/buildManualValuationRequest'
import { parseEmployeeCount } from '../../../utils/employeeCount'
import { isAuthError } from '../../../utils/errorDetection'
import { extractValuationResultsMap } from '../../../utils/extractValuationResultsMap'
import { getCurrentFilingYear, normalizeCurrentYearForFiling } from '../../../utils/fiscalYear'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import { HTMLProcessor } from '../../../utils/htmlProcessor'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import { buildTaxLatencyCandidatesFromImportedLedgerAnalysis } from '../../../utils/importedLedgerTaxLatencies'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { generalLogger } from '../../../utils/logger'
import { mergeSessionDataForReportAssets } from '../../../utils/sessionPackageHelpers'
import { mergeOptionalSessionPrefillFields } from '../../../utils/mergeOptionalSessionPrefillFields'
import { getReportedEbitdaBaseline } from '../../../utils/normalizationMath'
import {
  persistNormalizationsBeforeCalculate,
  persistOrDeleteNormalizationsForYears,
} from '../../../utils/normalizationPersist'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import { hasUsableOfficialFinancialsContent } from '../../../utils/officialFinancialsContent'
import {
  hasExistingValuationVersion,
  shouldOpenVersionConfirmation,
} from '../../../utils/versionConfirmation'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '../../../utils/versionDiffDetection'
import { buildCurrentYearData, mergeYearDataRows } from '../../../utils/yearData'
import {
  getCompleteYearlyFinancialsDesc,
  getLatestCompleteYearlyFinancial,
} from '../../../utils/yearlyFinancials'
import { deleteValuationEntry } from '../utils/deleteValuationEntry'
import {
  deriveGuidedNormalizationPrefill,
  type GuidedNormalizationPrefill,
} from '../utils/guidedNormalizationPrefill'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'
import {
  deriveManualReportPresentation,
  deriveNavPricesForVersionNav,
} from './manualReportPresentation'

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

/** Compute display initials from user name (Titan/Mercury profile) */
function getUserInitials(user: { name?: string; email?: string } | null): string {
  if (!user?.name) return (user?.email?.[0] || 'G').toUpperCase()
  const names = user.name.trim().split(/\s+/)
  if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase()
  return user.name.substring(0, 2).toUpperCase()
}

function getHydratedValuationResults(
  result:
    | Pick<
        ValuationResponse,
        'valuation_results' | 'valuation_result' | 'selected_valuation_method'
      >
    | null
    | undefined
) {
  return extractValuationResultsMap(result as Record<string, any> | null | undefined, {
    selectedValuationMethod: result?.selected_valuation_method,
  })
}

function serializePreparerPayload(
  payload: {
    preparer_ev_ebitda_median: number
    preparer_ev_ebitda_override: {
      reason_key: string
      note?: string
      acknowledged_extreme?: boolean
    }
  } | null
) {
  return payload ? JSON.stringify(payload) : 'none'
}

function axiosLikeErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string }
  const raw = e?.response?.data?.message
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string').join(' ')
  if (typeof e?.message === 'string') return e.message
  return ''
}

/** Titan modal-edit failures — same messages as Mercury OmniCalcSummary mapping */
function toastModalEditPersistError(err: unknown, tToast: (key: string) => string) {
  const msg = axiosLikeErrorMessage(err)
  if (msg.includes('Stored valuation inputs not found')) {
    toast.error(tToast('modalEditInputsMissing'))
    return
  }
  if (msg.includes('Stored valuation inputs are incomplete')) {
    toast.error(tToast('modalEditInputsIncomplete'))
    return
  }
  toast.error(tToast('persistFailed'), { description: tToast('persistFailedDesc') })
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
// FORM DATA BRIDGE
// Maps ManualInputPanel's ValuationFormData (camelCase, multi-year)
// to Venus store's ValuationFormData (snake_case, API format)
// ─────────────────────────────────────────

function mapClarityFormToVenusStore(raw: any): Partial<VenusFormData> {
  // Bridge: panel submit uses `business_model` (snake); live sync uses `businessModel` (camel).
  // Fall back to current Zustand so submit never strips a prefilled enum via default `'services'`.
  // Same for operating country: partial `onFormDataChange` payloads may omit `country` briefly.
  const storeForm = useManualFormStore.getState().formData
  const data = {
    ...raw,
    business_model: raw.business_model ?? storeForm.business_model,
    businessModel: raw.businessModel ?? raw.business_model ?? storeForm.business_model,
    country:
      (typeof raw.country === 'string' && raw.country.trim()) ||
      (typeof raw.country_code === 'string' && raw.country_code.trim()) ||
      storeForm.country_code?.trim() ||
      '',
  }

  const resolvedBusinessModel =
    (typeof data.businessModel === 'string' && data.businessModel.trim()) ||
    (typeof data.business_model === 'string' && data.business_model.trim()) ||
    ''

  const yearlyFinancials = (data.yearlyFinancials || []) as Array<{
    year: string
    revenue: number
    ebitda: number
    capex?: number
    nwc_change?: number
    free_cash_flow?: number
    isForecast?: boolean
  }>

  const historicalRows = yearlyFinancials.filter((yf) => !yf.isForecast)
  const latestHistorical = [...historicalRows].sort((a, b) => Number(b.year) - Number(a.year))[0]
  const forecastRows = yearlyFinancials.filter((yf) => yf.isForecast)

  const completeHistorical = getCompleteYearlyFinancialsDesc(historicalRows)
  const current = completeHistorical[0]
  const historical = completeHistorical.slice(1)
  const existingCurrentYearData =
    data.current_year_data && typeof data.current_year_data === 'object'
      ? data.current_year_data
      : undefined
  const existingHistoricalYears = Array.isArray(data.historical_years_data)
    ? data.historical_years_data
    : []
  const existingForecastYears = Array.isArray(data.forecast_years_data)
    ? data.forecast_years_data
    : []

  const canonicalNace =
    (typeof data.canonicalNaceCode === 'string' && data.canonicalNaceCode.trim()) ||
    (typeof data.naceCode === 'string' && data.naceCode.trim()) ||
    ''
  const displayNace = typeof data.naceCode === 'string' ? data.naceCode.trim() : ''
  const activityPresentation =
    canonicalNace && displayNace && displayNace !== canonicalNace ? displayNace : ''

  // Only merge KBO/NACE into the store when we have registry identifiers in the panel.
  // Do not use "company name only" — the first sync after title prefill would push
  // kbo_number: '' and wipe session/bootstrap KBO before KBO search state catches up.
  const hasKbo = typeof data.kboNumber === 'string' && data.kboNumber.trim() !== ''
  const hasNaceFields =
    (typeof data.naceCode === 'string' && data.naceCode.trim() !== '') ||
    (typeof data.canonicalNaceCode === 'string' && data.canonicalNaceCode.trim() !== '')
  const companySectionActive = hasKbo || hasNaceFields

  return {
    company_name: data.companyName || '',
    country_code: (data.country || 'BE').toUpperCase().substring(0, 2),
    industry: data.industry || 'services',
    ...(resolvedBusinessModel ? { business_model: resolvedBusinessModel } : {}),
    founding_year: parseInt(data.yearFounded, 10) || getCurrentFilingYear() - 5,
    number_of_owners: data.ownerManagers || 1,
    number_of_employees: data.fteEmployees,
    shares_for_sale: 100,
    business_type: data.businessStructure || 'company',
    revenue: current?.revenue,
    ebitda: current?.ebitda,
    current_year_data: latestHistorical
      ? buildCurrentYearData({
          year: parseInt(latestHistorical.year),
          revenue: latestHistorical.revenue,
          ebitda: latestHistorical.ebitda,
          currentYearData: existingCurrentYearData,
        })
      : existingCurrentYearData
        ? buildCurrentYearData({
            year: normalizeCurrentYearForFiling(
              existingCurrentYearData.year,
              Boolean(data.filingYearConfirmed)
            ),
            revenue: existingCurrentYearData.revenue,
            ebitda: existingCurrentYearData.ebitda,
            currentYearData: existingCurrentYearData,
          })
        : undefined,
    historical_years_data:
      historical.length > 0
        ? mergeYearDataRows(
            historical.map((h: any) => ({
              year: parseInt(h.year),
              revenue: h.revenue,
              ebitda: h.ebitda,
            })),
            existingHistoricalYears
          )
        : latestHistorical
          ? existingHistoricalYears.filter(
              (y: any) => Number(y.year) < parseInt(latestHistorical.year)
            )
          : existingHistoricalYears,
    forecast_years_data:
      forecastRows.length > 0
        ? mergeYearDataRows(
            forecastRows.map((f) => ({
              year: parseInt(f.year),
              revenue: f.revenue,
              ebitda: f.ebitda,
              capex: f.capex,
              nwc_change: f.nwc_change,
              free_cash_flow: f.free_cash_flow,
              isForecast: true,
            })),
            existingForecastYears
          )
        : existingForecastYears,
    ...(data.filingYearConfirmed !== undefined && {
      filing_year_confirmed: Boolean(data.filingYearConfirmed),
    }),
    ...(data.dcf_input_mode != null && { dcf_input_mode: data.dcf_input_mode }),
    ...(companySectionActive
      ? {
          kbo_number: data.kboNumber || '',
          legal_form: data.legalForm || '',
          nace_code: canonicalNace || '',
          nace_description: typeof data.naceDescription === 'string' ? data.naceDescription : '',
          // When display matches canonical, pass undefined so updateFormData strips activity_code
          activity_code: (activityPresentation || undefined) as VenusFormData['activity_code'],
        }
      : {}),
    ...((data.businessType || data.businessTypeCode) && {
      business_type_id: data.businessType || data.businessTypeCode,
    }),
    // Adaptive Input Studio bonus fields (camelCase panel → snake_case store)
    ...(data.dcf_revenue_growth_pct != null && {
      dcf_revenue_growth_pct: data.dcf_revenue_growth_pct,
    }),
    ...(data.dcf_ebitda_margin_pct != null && {
      dcf_ebitda_margin_pct: data.dcf_ebitda_margin_pct,
    }),
    ...(data.dcf_capex_pct != null && { dcf_capex_pct: data.dcf_capex_pct }),
    ...(data.dcf_nwc_pct != null && { dcf_nwc_pct: data.dcf_nwc_pct }),
    ...(data.dcf_wacc_pct != null && { dcf_wacc_pct: data.dcf_wacc_pct }),
    ...(data.dcf_terminal_growth_pct != null && {
      dcf_terminal_growth_pct: data.dcf_terminal_growth_pct,
    }),
    ...(data.dcf_exit_multiple != null && { dcf_exit_multiple: data.dcf_exit_multiple }),
    ...(data.dcf_risk_free_rate_pct != null && {
      dcf_risk_free_rate_pct: data.dcf_risk_free_rate_pct,
    }),
    ...(data.dcf_equity_risk_premium_pct != null && {
      dcf_equity_risk_premium_pct: data.dcf_equity_risk_premium_pct,
    }),
    ...(data.dcf_beta != null && { dcf_beta: data.dcf_beta }),
    ...(data.dcf_cost_of_debt_pct != null && { dcf_cost_of_debt_pct: data.dcf_cost_of_debt_pct }),
    ...(data.dcf_debt_equity_pct != null && { dcf_debt_equity_pct: data.dcf_debt_equity_pct }),
    ...(data.dcf_tax_shield_pct != null && { dcf_tax_shield_pct: data.dcf_tax_shield_pct }),
    ...(data.dcf_terminal_value_method != null && {
      dcf_terminal_value_method: data.dcf_terminal_value_method,
    }),
    ...(data.nav_real_estate_adjustment != null && {
      nav_real_estate_adjustment: data.nav_real_estate_adjustment,
    }),
    ...(data.exclude_real_estate != null && {
      exclude_real_estate: data.exclude_real_estate,
    }),
    ...(data.real_estate_book_value != null && {
      real_estate_book_value: data.real_estate_book_value,
    }),
    ...(data.estimated_market_rent != null && {
      estimated_market_rent: data.estimated_market_rent,
    }),
    ...(data.nav_inventory_adjustment != null && {
      nav_inventory_adjustment: data.nav_inventory_adjustment,
    }),
    ...(data.nav_hidden_reserves != null && { nav_hidden_reserves: data.nav_hidden_reserves }),
    ...(data.nav_goodwill_writeoff != null && {
      nav_goodwill_writeoff: data.nav_goodwill_writeoff,
    }),
    ...(data.nav_receivables_adjustment != null && {
      nav_receivables_adjustment: data.nav_receivables_adjustment,
    }),
    ...(data.nav_other_revaluations != null && {
      nav_other_revaluations: data.nav_other_revaluations,
    }),
    ...(data.nav_tax_latency_pct != null && {
      nav_tax_latency_pct: data.nav_tax_latency_pct,
    }),
    ...(data.nav_off_balance_items != null && {
      nav_off_balance_items: data.nav_off_balance_items,
    }),
    ...(data.saas_arr != null && { saas_arr: data.saas_arr }),
    ...(data.saas_mrr != null && { saas_mrr: data.saas_mrr }),
    ...(data.saas_arr_growth_pct != null && { saas_arr_growth_pct: data.saas_arr_growth_pct }),
    ...(data.saas_churn_pct != null && { saas_churn_pct: data.saas_churn_pct }),
    ...(data.saas_customer_churn_pct != null && {
      saas_customer_churn_pct: data.saas_customer_churn_pct,
    }),
    ...(data.saas_nrr_pct != null && { saas_nrr_pct: data.saas_nrr_pct }),
    ...(data.saas_gross_margin_pct != null && {
      saas_gross_margin_pct: data.saas_gross_margin_pct,
    }),
    ...(data.saas_cac != null && { saas_cac: data.saas_cac }),
    ...(data.saas_customer_concentration_pct != null && {
      saas_customer_concentration_pct: data.saas_customer_concentration_pct,
    }),
    ...(data.saas_expansion_revenue_pct != null && {
      saas_expansion_revenue_pct: data.saas_expansion_revenue_pct,
    }),
    ...(data.saas_sm_spend != null && { saas_sm_spend: data.saas_sm_spend }),
    ...(data.rev_recurring_pct != null && { rev_recurring_pct: data.rev_recurring_pct }),
    ...(data.rev_recurring_amount != null && { rev_recurring_amount: data.rev_recurring_amount }),
    ...(data.rev_top_client_concentration_pct != null && {
      rev_top_client_concentration_pct: data.rev_top_client_concentration_pct,
    }),
    ...(data.rev_top_client_amount != null && {
      rev_top_client_amount: data.rev_top_client_amount,
    }),
    ...(data.rev_contract_backlog != null && { rev_contract_backlog: data.rev_contract_backlog }),
    ...(data.rev_gross_churn_pct != null && { rev_gross_churn_pct: data.rev_gross_churn_pct }),
    ...(data.owner_salary_addback != null && { owner_salary_addback: data.owner_salary_addback }),
    // Belgian official filing trust — only when figures/links exist (matches buildValuationRequest)
    ...(hasUsableOfficialFinancialsContent(data.official_financials) &&
      data.official_financials && { official_financials: data.official_financials }),
    ...(hasUsableOfficialFinancialsContent(data.official_financials) &&
      data.official_variance_analysis != null && {
        official_variance_analysis: data.official_variance_analysis,
      }),
    ...(hasUsableOfficialFinancialsContent(data.official_financials) &&
      data.official_verification_badge != null && {
        official_verification_badge: data.official_verification_badge,
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
  /** Mercury STP deep link: spotlight / focusField / flagYear */
  guidedResolutionUrl?: {
    spotlight?: string
    focusField?: string
    flagYear?: string
  }
  /**
   * Optional `selected_method` query param (e.g. Mercury → Venus). Seeds the top-bar method
   * when session has no stored preference yet and there is no valuation result.
   */
  initialSelectedMethodFromUrl?: string
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
  guidedResolutionUrl,
  initialSelectedMethodFromUrl,
}) => {
  const router = useTransitionRouter()
  const t = useTranslations('toast')
  const tReport = useTranslations('report')
  const tHistory = useTranslations('historyPanel')
  const tErrors = useTranslations('errors')
  const tPreparer = useTranslations('preparerMultiple')
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
  /** Avoid overlapping getReport calls from the PDF-stale poll interval */
  const pdfStalePollInFlightRef = useRef(false)

  // Venus infrastructure
  const { user } = useAuth()
  const { allowedMethodKeys, planFeatures, plan } = useCredits()
  const { identity, isAccountantFlow } = useBootstrap()
  useBootstrapSync()
  const { readOnlyKbo, autoAdvancePastPrefilledSteps } = useBootstrapPrefill()
  /** Session blob may gain DCF/NAV/SaaS after bootstrap — gap-fill empty store slots. */
  useSessionOptionalMethodPrefill()

  const {
    isCalculating,
    error,
    result,
    selectedMethod,
    setSelectedMethod,
    preSelectedMethod,
    setPreSelectedMethod,
    preSelectedMethods,
    togglePreSelectedMethod,
    userWeights,
    userWeightJustification,
    setUserWeights,
    setUserWeightJustification,
    trySetCalculating,
    setCalculating,
    setResult,
  } = useManualResultsStore()
  const { updateFormData } = useManualFormStore()
  const formStoreData = useManualFormStore((s) => s.formData)
  const { currentYearRevenueForMethodNav, preSelectableMethodsForNav: firmPreSelectableMethods } =
    useUpfrontMethodNavInputs(formStoreData, user?.firm_country_code)
  const preSelectableMethodsForNav = useMemo(
    () => filterPreSelectableMethodsForOwnerFounder(firmPreSelectableMethods, isAccountantFlow),
    [firmPreSelectableMethods, isAccountantFlow]
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
  const sessionError = useSessionStore((s) => s.errorMessage)
  const reportIdFromSession = useSessionStore((s) => s.session?.reportId)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const sessionName = useSessionStore((s) => s.session?.name)
  const importQualityMap = useSpotlightStore((s) => s.importQuality)
  const toggleSourceDataPanel = useSpotlightStore((s) => s.toggleSourcePanel)
  const showSourceDataPanel = useSpotlightStore((s) => s.showSourcePanel)
  const hasImportQuality =
    !!importQualityMap &&
    typeof importQualityMap === 'object' &&
    Object.keys(importQualityMap).length > 0
  const { createVersion, getLatestVersion } = useVersionHistoryStore()

  // Resolve session key (val_xxx) to UUID before PDF hook — POST /api/valuations/:id/pdf must match Titan id
  const resolvedReportId = useMemo(() => {
    if (!reportId) return reportId
    if (reportId === 'new' && session?.reportId) return session.reportId
    if (reportId === 'new' && session) {
      const sk = (session as any)?.key ?? (session as any)?.session_key
      if (sk && sk.length >= 8) return sk
    }
    if (typeof reportId === 'string' && reportId.startsWith('val_') && session?.reportId) {
      return session.reportId
    }
    return reportId
  }, [reportId, session?.reportId, session])

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

  const showPreparerMultiplePanel = useMemo(() => {
    const role = user?.role ?? ''
    return (
      isAccountantMode ||
      role === 'accountant' ||
      role === 'expert' ||
      role === 'enterprise' ||
      role === 'admin'
    )
  }, [isAccountantMode, user?.role])

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
    const candidates = [session?.reportId, resolvedReportId, reportId]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && isUuid(candidate)) return candidate
    }
    return null
  }, [session?.reportId, resolvedReportId, reportId])

  const reportHydrationLookupId = useMemo(() => {
    const candidates = [
      session?.reportId,
      resolvedReportId,
      reportId,
      (session as any)?.key,
      (session as any)?.session_key,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && (isUuid(candidate) || isSessionKey(candidate))) {
        return candidate
      }
    }
    return null
  }, [session?.reportId, resolvedReportId, reportId, session])

  // Session matches when reportId equals session.reportId (UUID) or session.key (session key)
  const sessionMatchesReport =
    session && (session.reportId === reportId || (session as any)?.key === reportId)

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
  const [isMethodSwitchRendering, setIsMethodSwitchRendering] = useState(false)
  const liveMultipleReportPreview = useMemo(() => {
    const resultAny = result as Record<string, any> | null
    const details =
      resultAny?.details && typeof resultAny.details === 'object'
        ? (resultAny.details as Record<string, unknown>)
        : null
    const sustainableEbitda = Number(
      details?.sustainable_ebitda ?? details?.weighted_ebitda_total ?? resultAny?.ebitda ?? 0
    )
    const netDebt = Number(details?.net_debt ?? resultAny?.net_debt ?? 0)
    const bsaRaw = details?.balance_sheet_adjustments ?? resultAny?.balance_sheet_adjustments
    const balanceSheetAdj =
      typeof bsaRaw === 'number' && Number.isFinite(bsaRaw)
        ? bsaRaw
        : Array.isArray(bsaRaw)
          ? bsaRaw.reduce(
              (s: number, item: any) =>
                s + (Number(item?.amount ?? item?.value ?? item?.adjustment ?? 0) || 0),
              0
            )
          : 0
    const currentHeadline = Number(report?.valuation ?? result?.equity_value_mid ?? 0)
    const appliedMultiple =
      preparerAppliedMedian != null && Number.isFinite(preparerAppliedMedian)
        ? Number(preparerAppliedMedian)
        : null
    const benchmarkMultiple =
      preparerBenchmarkMedian != null && Number.isFinite(preparerBenchmarkMedian)
        ? Number(preparerBenchmarkMedian)
        : result?.multiples_valuation?.ebitda_multiple != null
          ? Number(result.multiples_valuation.ebitda_multiple)
          : null

    if (
      !report?.htmlReport ||
      (selectedMethod !== 'ebitda_multiple' && selectedMethod !== 'upswitch_adaptive') ||
      appliedMultiple == null ||
      benchmarkMultiple == null ||
      Math.abs(appliedMultiple - benchmarkMultiple) < 0.005 ||
      !Number.isFinite(sustainableEbitda) ||
      sustainableEbitda <= 0
    ) {
      return null
    }

    const previewEquity = Math.round(
      sustainableEbitda * appliedMultiple - netDebt + balanceSheetAdj
    )
    if (!Number.isFinite(previewEquity)) return null

    return {
      previewEquity,
      delta: previewEquity - currentHeadline,
      appliedMultiple,
      benchmarkMultiple,
    }
  }, [
    preparerAppliedMedian,
    preparerBenchmarkMedian,
    report?.htmlReport,
    report?.valuation,
    result,
    selectedMethod,
  ])
  const pdfStale = useMemo(() => {
    if (!report) return false
    const stale = isPdfLikelyStaleVenus(report)
    if (!stale) return false
    // Hook has a ready PDF but report row still has no pdf_generated_at — do not block UX.
    // When both timestamps exist and the PDF is older than updated_at, we still show stale
    // (do not blanket-ignore isPdfReady or the banner never returns after a recalculation).
    if (isPdfReady && report.pdfGeneratedAt == null) return false
    return true
  }, [report, isPdfReady])
  const canDownloadPdf = planFeatures?.valuation_download !== false

  // When client-side PDF generation has a URL, treat report as fresh and sync metadata
  // so `isPdfLikelyStaleVenus` stays false until the next server refresh.
  useEffect(() => {
    if (!canDownloadPdf || !isPdfReady || !pdfGenerationState.url) return
    const url = pdfGenerationState.url
    setReport((prev) => {
      if (!prev) return prev
      const syncAt = prev.reportUpdatedAt ?? new Date()
      if (
        prev.pdfUrl === url &&
        prev.pdfGeneratedAt != null &&
        prev.pdfGeneratedAt.getTime() === syncAt.getTime()
      ) {
        return prev
      }
      return {
        ...prev,
        pdfUrl: url,
        pdfGeneratedAt: syncAt,
      }
    })
  }, [canDownloadPdf, isPdfReady, pdfGenerationState.url])
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
  const [pdfWaitTimedOut, setPdfWaitTimedOut] = useState(false)
  const [isPdfRetrying, setIsPdfRetrying] = useState(false)
  const [pdfPollErrorCount, setPdfPollErrorCount] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const pdfExportAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => {
      pdfExportAbortRef.current?.abort()
    }
  }, [])
  const [downloadHistory, setDownloadHistory] = useState<
    { id: string; fileName: string; timestamp: Date; size: string }[]
  >([])
  const [showNewValuationModal, setShowNewValuationModal] = useState(false)
  const [isConfirmingNewValuation, setIsConfirmingNewValuation] = useState(false)
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
    const needsMethodHydration = !getHydratedValuationResults(existingResult)
    setIsHydratingEditModalData(needsMethodHydration)
    setReportMethodHydrationError(null)
    let cancelled = false
    const backoffMs = [400, 1000, 2200]

    const applySuccess = (r: ValuationResponse) => {
      setShowFiscalReferenceForOmni(!!r.show_fiscal_reference)

      const latestExistingResult = useManualResultsStore.getState().result
      const nextValuationResults =
        getHydratedValuationResults(r) ?? getHydratedValuationResults(latestExistingResult)
      const mergedResult: ValuationResponse = {
        ...(latestExistingResult || {}),
        ...r,
        html_report: r.html_report || latestExistingResult?.html_report,
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
      if (!getHydratedValuationResults(current)) {
        setShowFiscalReferenceForOmni(false)
      }
      setIsHydratingEditModalData(false)
      const stillMissingMethods = !getHydratedValuationResults(current)
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
  const [pendingUpdates, setPendingUpdates] = useState<
    { field: string; value: any; label: string }[]
  >([])

  // ─── Normalization State (Unified Store) ───
  const normalizationItems = useNormalizationStore((s) => s.items)
  const normalizationActions = useNormalizationStore()
  const [suggestedNormalisations, setSuggestedNormalisations] = useState<any[]>([])
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
    const latestYearlyFinancials = Array.isArray(latestFormDataRef.current?.yearlyFinancials)
      ? (latestFormDataRef.current?.yearlyFinancials as Array<{
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
        }>)
      : []
    if (latestYearlyFinancials.length > 0) {
      return [...latestYearlyFinancials].sort((a, b) => Number(b.year) - Number(a.year))
    }

    const allYears: Array<{
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
    }> = []
    const cyd = formStoreData.current_year_data as
      | {
          year?: number
          revenue?: number
          ebitda?: number
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
      | undefined
    if (cyd?.year && cyd.year >= 2000 && cyd.year <= 2100) {
      allYears.push({
        year: String(cyd.year),
        revenue: Number(cyd.revenue) || 0,
        ebitda: Number(cyd.ebitda) || 0,
        capex: typeof cyd.capex === 'number' ? cyd.capex : undefined,
        depreciation: typeof cyd.depreciation === 'number' ? cyd.depreciation : undefined,
        tax_expense: typeof cyd.tax_expense === 'number' ? cyd.tax_expense : undefined,
        cash: typeof cyd.cash === 'number' ? cyd.cash : undefined,
        total_debt: typeof cyd.total_debt === 'number' ? cyd.total_debt : undefined,
        current_assets: typeof cyd.current_assets === 'number' ? cyd.current_assets : undefined,
        current_liabilities:
          typeof cyd.current_liabilities === 'number' ? cyd.current_liabilities : undefined,
        accounts_receivable:
          typeof cyd.accounts_receivable === 'number' ? cyd.accounts_receivable : undefined,
        accounts_payable:
          typeof cyd.accounts_payable === 'number' ? cyd.accounts_payable : undefined,
        inventory: typeof cyd.inventory === 'number' ? cyd.inventory : undefined,
        short_term_debt: typeof cyd.short_term_debt === 'number' ? cyd.short_term_debt : undefined,
        nwc_change: typeof cyd.nwc_change === 'number' ? cyd.nwc_change : undefined,
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
            capex: typeof y.capex === 'number' ? y.capex : undefined,
            depreciation: typeof y.depreciation === 'number' ? y.depreciation : undefined,
            tax_expense: typeof y.tax_expense === 'number' ? y.tax_expense : undefined,
            cash: typeof y.cash === 'number' ? y.cash : undefined,
            total_debt: typeof y.total_debt === 'number' ? y.total_debt : undefined,
            current_assets: typeof y.current_assets === 'number' ? y.current_assets : undefined,
            current_liabilities:
              typeof y.current_liabilities === 'number' ? y.current_liabilities : undefined,
            accounts_receivable:
              typeof y.accounts_receivable === 'number' ? y.accounts_receivable : undefined,
            accounts_payable:
              typeof y.accounts_payable === 'number' ? y.accounts_payable : undefined,
            inventory: typeof y.inventory === 'number' ? y.inventory : undefined,
            short_term_debt: typeof y.short_term_debt === 'number' ? y.short_term_debt : undefined,
            nwc_change: typeof y.nwc_change === 'number' ? y.nwc_change : undefined,
          })
        }
      }
    }

    const forecastPersisted = formStoreData.forecast_years_data
    if (forecastPersisted?.length) {
      for (const y of forecastPersisted) {
        if (
          y.year >= 2000 &&
          y.year <= 2100 &&
          !allYears.some((existing) => existing.year === String(y.year))
        ) {
          allYears.push({
            year: String(y.year),
            revenue: Number(y.revenue) || 0,
            ebitda: Number(y.ebitda) || 0,
            capex: typeof y.capex === 'number' ? y.capex : undefined,
            depreciation: typeof y.depreciation === 'number' ? y.depreciation : undefined,
            tax_expense: typeof y.tax_expense === 'number' ? y.tax_expense : undefined,
            cash: typeof y.cash === 'number' ? y.cash : undefined,
            total_debt: typeof y.total_debt === 'number' ? y.total_debt : undefined,
            current_assets: typeof y.current_assets === 'number' ? y.current_assets : undefined,
            current_liabilities:
              typeof y.current_liabilities === 'number' ? y.current_liabilities : undefined,
            accounts_receivable:
              typeof y.accounts_receivable === 'number' ? y.accounts_receivable : undefined,
            accounts_payable:
              typeof y.accounts_payable === 'number' ? y.accounts_payable : undefined,
            inventory: typeof y.inventory === 'number' ? y.inventory : undefined,
            short_term_debt: typeof y.short_term_debt === 'number' ? y.short_term_debt : undefined,
            nwc_change: typeof y.nwc_change === 'number' ? y.nwc_change : undefined,
            isForecast: true,
          })
        }
      }
    }

    return allYears.sort((a, b) => Number(b.year) - Number(a.year))
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
    const year = getCurrentFilingYear()
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
  const [showNormalisationModal, setShowNormalisationModal] = useState(false)
  const [showUnifiedNormalizationModal, setShowUnifiedNormalizationModal] = useState(false)
  const [guidedNormalizationPrefill, setGuidedNormalizationPrefill] =
    useState<GuidedNormalizationPrefill | null>(null)
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
    ownerManagers: 1,
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

  const handleFormDataChange = useCallback(
    (data: Record<string, unknown>) => {
      latestFormDataRef.current = {
        ...latestFormDataRef.current,
        ...(data as Partial<CollectedData>),
      }
      // Keep form store in sync for session autosave (demo resilience, automation-ready)
      updateFormData(mapClarityFormToVenusStore(latestFormDataRef.current as any))
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
  })

  // When report is restored (e.g. from URL) without our submit, set baseline from form store so we can detect edits
  useEffect(() => {
    if (!result || lastSubmittedFinancialSnapshotRef.current) return
    const cyd = formStoreData.current_year_data as
      | { year?: number; revenue?: number; ebitda?: number; capex?: number; nwc_change?: number }
      | undefined
    const hy = (formStoreData.historical_years_data || []) as Array<{
      year: number
      revenue: number
      ebitda: number
    }>
    const fy = (formStoreData.forecast_years_data || []) as Array<{
      year: number
      revenue: number
      ebitda: number
      capex?: number
      nwc_change?: number
    }>
    const hasFinancials =
      (cyd && ((cyd.revenue ?? 0) > 0 || (cyd.ebitda ?? 0) !== 0)) ||
      hy.some((h) => (h.revenue ?? 0) > 0 || (h.ebitda ?? 0) !== 0) ||
      fy.some(
        (f) =>
          (f.revenue ?? 0) > 0 || (f.ebitda ?? 0) !== 0 || f.capex != null || f.nwc_change != null
      )
    if (!hasFinancials) return
    const allYf = [
      ...(cyd
        ? [
            {
              year: String(cyd.year),
              revenue: cyd.revenue ?? 0,
              ebitda: cyd.ebitda ?? 0,
              capex: cyd.capex,
              nwc_change: cyd.nwc_change,
            },
          ]
        : []),
      ...hy.map((h) => ({
        year: String(h.year),
        revenue: h.revenue,
        ebitda: h.ebitda,
        capex: (h as any).capex,
        nwc_change: (h as any).nwc_change,
      })),
      ...fy.map((f) => ({
        year: String(f.year),
        revenue: f.revenue,
        ebitda: f.ebitda,
        capex: f.capex,
        nwc_change: f.nwc_change,
        isForecast: true,
      })),
    ].sort((a, b) => parseInt(b.year) - parseInt(a.year))
    lastSubmittedFinancialSnapshotRef.current = {
      revenue: cyd?.revenue ?? formStoreData.revenue,
      ebitda: cyd?.ebitda ?? formStoreData.ebitda,
      yearlyFinancials: allYf,
    }
    setIsDirty(false)
  }, [
    result,
    formStoreData.current_year_data,
    formStoreData.historical_years_data,
    formStoreData.revenue,
    formStoreData.ebitda,
    formStoreData.forecast_years_data,
  ])

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
    Object.assign(
      formUpdates,
      mergeOptionalSessionPrefillFields(merged as Record<string, unknown>, {
        ...useManualFormStore.getState().formData,
        ...formUpdates,
      })
    )
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

  // Enable auto-persist for tax latency store
  useEffect(() => {
    const unsub = enableTaxLatencyAutoPersist(() => reportId || undefined)
    return unsub
  }, [reportId])

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
    if (versions.length === 0 && report) {
      return [
        {
          id: 'current',
          label: t('currentVersion'),
          priceRange: {
            min: report.valuationLow ?? Math.round(report.valuation * 0.85),
            max: report.valuationHigh ?? Math.round(report.valuation * 1.15),
          },
          askPrice: report.recommendedAskingPrice ?? report.valuation,
          timestamp: report.generatedAt,
          isActive: true,
        },
      ]
    }
    return versions.map((v) => {
      const method =
        (v.formData as { selected_valuation_method?: string } | undefined)
          ?.selected_valuation_method ?? selectedMethod
      const { priceRange, askPrice } = deriveNavPricesForVersionNav(v.valuationResult, method)
      return {
        id: v.id,
        label: v.versionLabel,
        priceRange,
        askPrice,
        timestamp: v.createdAt,
        isActive: v.isActive,
      }
    })
  }, [versions, report, selectedMethod, t])

  const navValuationSummary = React.useMemo(() => {
    if (!report) return undefined
    const vr = result?.valuation_results as
      | Record<string, { available: boolean; value?: number | string | null }>
      | undefined
    const isMultiMethod =
      preSelectedMethods.length > 1 && !preSelectedMethods.includes('upswitch_adaptive')

    let liveBlended: number | null = null
    if (isMultiMethod && vr && Object.keys(userWeights).length > 0) {
      const weightTotal = Object.values(userWeights).reduce((s, v) => s + v, 0)
      if (Math.abs(weightTotal - 100) <= 2) {
        let sum = 0
        let ok = true
        for (const [mk, mw] of Object.entries(userWeights)) {
          if (mw <= 0) continue
          const mr = vr[mk]
          if (!mr?.available || mr.value == null) {
            ok = false
            break
          }
          sum += Number(mr.value) * (mw / 100)
        }
        if (ok && sum > 0) liveBlended = Math.round(sum)
      }
    }

    const serverBlended =
      result?.weighted_valuation?.blended_equity_value != null
        ? Number(result.weighted_valuation.blended_equity_value)
        : null
    const blended =
      liveBlended ??
      (serverBlended != null && Number.isFinite(serverBlended) ? serverBlended : null)
    const primaryValue = blended ?? report.recommendedAskingPrice ?? report.valuation
    return {
      priceRange: {
        min: report.valuationLow ?? Math.round(report.valuation * 0.85),
        max: report.valuationHigh ?? Math.round(report.valuation * 1.15),
      },
      askPrice: primaryValue,
      confidence: 'high' as const,
    }
  }, [report, result, userWeights, preSelectedMethods])

  const synthesisValuationResults = useMemo(() => {
    const vr = result?.valuation_results as Record<string, ValuationMethodResult> | undefined
    return vr ?? null
  }, [result?.valuation_results])

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
          html_report: version.valuationResult.html_report || version.htmlReport || undefined,
        }
        setResult(enrichedResult)
        toast.info(t('versionLoaded', { label: version.versionLabel }))
      }
    },
    [planFeatures, openStarterPaywall, versions, setResult, t]
  )

  // ─── Bridge: Result from Venus API → Report for Clarity components ───
  useEffect(() => {
    if (result) {
      try {
        usePreparerMultipleStore.getState().syncFromValuationResult(result)
        onComplete(result)

        const r = result as any
        const presentation = deriveManualReportPresentation(r, selectedMethod)
        const ebitda = Number(r.current_year_data?.ebitda) || 0
        const normalizedEbitda = Number(r.latest_normalized_ebitda) || ebitda
        const revenue = r.current_year_data?.revenue || 0
        const p25 = r.multiples_valuation?.p25_ebitda_multiple
        const p75 = r.multiples_valuation?.p75_ebitda_multiple
        const rawConfidence = r.overall_confidence ?? r.details?.overall_confidence
        const confidence =
          typeof rawConfidence === 'string'
            ? (rawConfidence.toLowerCase() as 'high' | 'medium' | 'low')
            : undefined

        const askingPrice =
          Number(r.recommended_asking_price ?? r.details?.recommended_asking_price) || 0
        const htmlReport = r.html_report ?? r.details?.html_report
        const dcfHistoricalFcfReadiness =
          r.dcf_valuation?.historical_fcf_readiness ??
          r.details?.dcf_valuation?.historical_fcf_readiness ??
          null

        setReport({
          id: reportId || r.valuation_id || r.id || 'draft',
          companyName: r.company_name ?? r.business_name ?? tReport('defaultCompanyName'),
          valuation: presentation.valuation,
          valuationLow: presentation.valuationLow || undefined,
          valuationHigh: presentation.valuationHigh || undefined,
          ebitda,
          normalizedEbitda: normalizedEbitda || undefined,
          multiple: presentation.multiple ?? 0,
          multipleRange:
            presentation.multipleRange ??
            (p25 != null && p75 != null ? { low: p25, high: p75 } : undefined),
          generatedAt: new Date(),
          confidenceLevel: confidence || 'medium',
          htmlReport: htmlReport || undefined,
          dcfHistoricalFcfReadiness,
          recommendedAskingPrice: askingPrice || undefined,
          metrics: [
            {
              label: tReport('metrics.avgRevenue'),
              value: `€${(revenue / 1_000_000).toFixed(2)}M`,
            },
            {
              label: tReport('metrics.ebitdaMargin'),
              value: revenue ? `${((ebitda / revenue) * 100).toFixed(1)}%` : '—',
            },
            {
              label: tReport('metrics.sector'),
              value: r.business_type ?? r.details?.business_type ?? tReport('defaultSector'),
            },
          ],
          reportUpdatedAt: r.updated_at ? new Date(String(r.updated_at)) : undefined,
          pdfGeneratedAt:
            r.pdf_generated_at != null && String(r.pdf_generated_at) !== ''
              ? new Date(String(r.pdf_generated_at))
              : null,
          pdfUrl: canDownloadPdf && typeof r.pdf_url === 'string' ? r.pdf_url : undefined,
        })
        setDraftStatus('saved')
        setLastSaved(new Date())

        setRightPanelView('preview')

        if (isMobile && htmlReport) {
          setShowFullscreenModal(true)
        }

        if (reportId && htmlReport && planFeatures?.valuation_download !== false) {
          generatePdf?.().catch((err) => {
            if (err instanceof APIError && err.statusCode === 402) return
            generalLogger.warn('[ManualLayout] Background PDF generation failed', {
              error: err instanceof Error ? err.message : String(err),
            })
          })
        }
      } catch (error) {
        generalLogger.error('[ManualLayout] Failed to map result into report presentation', {
          reportId,
          valuationId: (result as any)?.valuation_id ?? (result as any)?.id ?? null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }, [result, onComplete, reportId, generatePdf, isMobile, tReport, selectedMethod, planFeatures])

  // ─── Omni-Calc: Update displayed valuation when selected method changes ───
  const prevSelectedMethodRef = useRef(selectedMethod)
  useEffect(() => {
    if (!report) return
    const hydrated = getHydratedValuationResults(result) ?? {}
    if (!Object.keys(hydrated).length) return
    if (selectedMethod === prevSelectedMethodRef.current) return
    prevSelectedMethodRef.current = selectedMethod

    const methodData = hydrated[selectedMethod]
    if (!methodData?.available || methodData.value == null) return
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
  const isFirstMethodRender = useRef(true)
  const pendingOverrideRef = useRef<{ reason?: string; note?: string }>({})
  const lastPersistedMethodRef = useRef(selectedMethod)
  const lastPersistedPreparerRef = useRef('none')
  const refreshReportAfterEdit = useCallback(
    async (htmlFromPatch?: string) => {
      if (!persistedReportLookupId) return false
      try {
        const fresh = await backendAPI.getReport(persistedReportLookupId)
        const latestExistingResult = useManualResultsStore.getState().result
        const nextValuationResults =
          getHydratedValuationResults(fresh) ?? getHydratedValuationResults(latestExistingResult)
        const mergedResult: ValuationResponse = {
          ...(latestExistingResult || {}),
          ...fresh,
          html_report: htmlFromPatch || fresh.html_report || latestExistingResult?.html_report,
          valuation_results: nextValuationResults ?? undefined,
          fiscal_4x_anchor:
            fresh.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
          multiple_adjustment_summary:
            fresh.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
        }
        setResult(mergedResult)
        const htmlForPreview = htmlFromPatch || fresh.html_report
        setReport((prev) => {
          if (!prev) return prev
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
          return htmlForPreview
            ? { ...prev, htmlReport: htmlForPreview, ...pdfMeta }
            : { ...prev, ...pdfMeta }
        })
        if (htmlForPreview && planFeatures?.valuation_download !== false) {
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
        if (htmlFromPatch) {
          setReport((prev) => (prev ? { ...prev, htmlReport: htmlFromPatch } : prev))
          const latestResult = useManualResultsStore.getState().result
          setResult(latestResult ? { ...latestResult, html_report: htmlFromPatch } : latestResult)
          if (planFeatures?.valuation_download !== false) {
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
    [generatePdf, persistedReportLookupId, setResult, planFeatures]
  )

  useEffect(() => {
    if (!pdfStale) {
      setPdfWaitTimedOut(false)
      setPdfPollErrorCount(0)
      return
    }
    setPdfWaitTimedOut(false)
    const tid = setTimeout(() => setPdfWaitTimedOut(true), 60_000)
    return () => clearTimeout(tid)
  }, [pdfStale, report?.reportUpdatedAt, report?.pdfGeneratedAt])

  useEffect(() => {
    if (!pdfStale || !persistedReportLookupId) return
    const id = setInterval(async () => {
      if (pdfStalePollInFlightRef.current) return
      pdfStalePollInFlightRef.current = true
      try {
        const fresh = await backendAPI.getReport(persistedReportLookupId)
        const latestExistingResult = useManualResultsStore.getState().result
        const nextValuationResults =
          getHydratedValuationResults(fresh) ?? getHydratedValuationResults(latestExistingResult)
        const mergedResult: ValuationResponse = {
          ...(latestExistingResult || {}),
          ...fresh,
          html_report: fresh.html_report || latestExistingResult?.html_report,
          valuation_results: nextValuationResults ?? undefined,
          fiscal_4x_anchor:
            fresh.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
          multiple_adjustment_summary:
            fresh.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
        }
        setResult(mergedResult)
        setReport((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            reportUpdatedAt: fresh.updated_at
              ? new Date(String(fresh.updated_at))
              : prev.reportUpdatedAt,
            pdfGeneratedAt:
              fresh.pdf_generated_at != null && String(fresh.pdf_generated_at) !== ''
                ? new Date(String(fresh.pdf_generated_at))
                : null,
            pdfUrl: canDownloadPdf && typeof fresh.pdf_url === 'string' ? fresh.pdf_url : undefined,
          }
        })
        setPdfPollErrorCount(0)
      } catch (err) {
        generalLogger.warn('[ManualLayout] PDF stale poll getReport failed', {
          reportId: persistedReportLookupId,
          error: err instanceof Error ? err.message : String(err),
        })
        setPdfPollErrorCount((c) => c + 1)
      } finally {
        pdfStalePollInFlightRef.current = false
      }
    }, PDF_STALE_POLL_INTERVAL_MS)
    const max = setTimeout(() => clearInterval(id), PDF_STALE_POLL_MAX_MS)
    return () => {
      clearInterval(id)
      clearTimeout(max)
      pdfStalePollInFlightRef.current = false
    }
  }, [pdfStale, persistedReportLookupId, setResult])

  const handleRetryPdfStalled = useCallback(async () => {
    if (!persistedReportLookupId) return
    if (planFeatures && !planFeatures.valuation_download) {
      openStarterPaywall('pdf_download')
      return
    }
    setIsPdfRetrying(true)
    try {
      await generatePdf()
      const fresh = await backendAPI.getReport(persistedReportLookupId)
      const latestExistingResult = useManualResultsStore.getState().result
      const nextValuationResults =
        getHydratedValuationResults(fresh) ?? getHydratedValuationResults(latestExistingResult)
      const mergedResult: ValuationResponse = {
        ...(latestExistingResult || {}),
        ...fresh,
        html_report: fresh.html_report || latestExistingResult?.html_report,
        valuation_results: nextValuationResults ?? undefined,
        fiscal_4x_anchor: fresh.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
        multiple_adjustment_summary:
          fresh.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
      }
      setResult(mergedResult)
      setReport((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          reportUpdatedAt: fresh.updated_at
            ? new Date(String(fresh.updated_at))
            : prev.reportUpdatedAt,
          pdfGeneratedAt:
            fresh.pdf_generated_at != null && String(fresh.pdf_generated_at) !== ''
              ? new Date(String(fresh.pdf_generated_at))
              : null,
          pdfUrl: canDownloadPdf && typeof fresh.pdf_url === 'string' ? fresh.pdf_url : undefined,
        }
      })
      setPdfPollErrorCount(0)
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 402) {
        openStarterPaywall('pdf_download')
        return
      }
      generalLogger.warn('[ManualLayout] Retry stalled PDF failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      toast.error(t('pdfExportFailed'), { description: t('pdfExportFailedDesc') })
    } finally {
      setIsPdfRetrying(false)
    }
  }, [generatePdf, persistedReportLookupId, setResult, t, planFeatures, openStarterPaywall])

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

  const persistModalEdit = useCallback(
    async ({
      method,
      overrideReason,
      overrideNote,
      preparerPayload,
      clearPreparerOverride = false,
    }: {
      method: string
      overrideReason?: string
      overrideNote?: string
      preparerPayload?: ReturnType<typeof buildPreparerMultiplePayload> | null
      clearPreparerOverride?: boolean
    }) => {
      if (!persistedReportLookupId) return
      const res = await backendAPI.updateSelectedMethod(
        persistedReportLookupId,
        method,
        overrideReason,
        overrideNote,
        preparerPayload
          ? preparerPayload
          : clearPreparerOverride
            ? { clear_preparer_override: true }
            : undefined
      )
      await refreshReportAfterEdit(res?.html_report)
      return res
    },
    [persistedReportLookupId, refreshReportAfterEdit]
  )

  useEffect(() => {
    lastPersistedPreparerRef.current = serializePreparerPayload(
      buildPersistedPreparerMultiplePayload(result)
    )
  }, [result])

  useEffect(() => {
    if (isFirstMethodRender.current) {
      isFirstMethodRender.current = false
      lastPersistedMethodRef.current = selectedMethod
      return
    }
    if (!persistedReportLookupId) return
    if (selectedMethod === lastPersistedMethodRef.current) return
    const previousMethod = lastPersistedMethodRef.current
    const { reason, note } = pendingOverrideRef.current
    pendingOverrideRef.current = {}
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsMethodSwitchRendering(true)
      try {
        await persistModalEdit({
          method: selectedMethod,
          overrideReason: reason,
          overrideNote: note,
        })
        if (!cancelled) {
          lastPersistedMethodRef.current = selectedMethod
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        generalLogger.error('[ManualLayout] Method persist failed', {
          error: errMsg,
          selectedMethod,
        })
        if (!cancelled) {
          setSelectedMethod(previousMethod)
          if (errMsg.includes('plan does not include')) {
            setMethodPaywallReason('methods')
            setMethodPaywallOpen(true)
          } else {
            toast.error(t('persistFailed'), { description: t('persistFailedDesc') })
          }
        }
      } finally {
        setIsMethodSwitchRendering(false)
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [persistModalEdit, selectedMethod, persistedReportLookupId, t])

  useEffect(() => {
    if (!showValuationEditModal || !persistedReportLookupId || isMethodSwitchRendering) return
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
      clientShouldWarnExtremeMultiple(
        currentPayload.preparer_ev_ebitda_median,
        mv?.p10_ebitda_multiple,
        mv?.p90_ebitda_multiple,
        preparerBenchmarkMedian,
        mv?.p25_ebitda_multiple,
        mv?.p75_ebitda_multiple
      ) &&
      !preparerAcknowledgedExtreme
    ) {
      return
    }
    const currentSignature = serializePreparerPayload(currentPayload)
    if (currentSignature === lastPersistedPreparerRef.current) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setIsMethodSwitchRendering(true)
      try {
        await persistModalEdit({
          method: selectedMethod,
          preparerPayload: currentPayload,
          clearPreparerOverride: currentPayload == null,
        })
        if (!cancelled) {
          lastPersistedPreparerRef.current = currentSignature
        }
      } catch (error) {
        generalLogger.error('[ManualLayout] Preparer multiple persist failed', {
          error: error instanceof Error ? error.message : String(error),
          selectedMethod,
        })
        if (!cancelled) {
          toastModalEditPersistError(error, t)
        }
      } finally {
        setIsMethodSwitchRendering(false)
      }
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    isMethodSwitchRendering,
    persistedReportLookupId,
    persistModalEdit,
    preparerAcknowledgedExtreme,
    preparerAppliedMedian,
    preparerBenchmarkMedian,
    preparerNote,
    preparerReasonKey,
    result,
    selectedMethod,
    showValuationEditModal,
    t,
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
      setPreSelectedMethod(method === 'upswitch_adaptive' ? null : method)
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
      if (!getLatestCompleteYearlyFinancial(data.yearlyFinancials || [])) {
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
        const venusFormData = mapClarityFormToVenusStore(data)
        updateFormData(venusFormData)

        // Step 2: Build API request from store (single source of truth).
        // Trust fields (official_financials, variance explanation) live only in Zustand; using
        // React `formStoreData` here can be one frame stale vs. the synchronous store update.
        const storeSnapshot = useManualFormStore.getState().formData
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildManualValuationRequest(storeSnapshot, undefined, validLocale as 'nl' | 'en')
        ;(request as any).dataSource = 'manual'
        if (preSelectedMethod) {
          request.selected_method = preSelectedMethod
        }

        attachSynthesisWeightsToValuationRequest(request)

        const idForApi = linkedIdentifier
        if (calculationRequestIdentifiers.reportId) {
          ;(request as any).reportId = calculationRequestIdentifiers.reportId
        }
        if (calculationRequestIdentifiers.sessionKey) {
          ;(request as any).sessionKey = calculationRequestIdentifiers.sessionKey
        }

        mergePreparerMultipleIntoRequest(request as unknown as Record<string, unknown>)
        const prep = usePreparerMultipleStore.getState()
        if (
          prep.benchmarkMedian != null &&
          prep.appliedMedian != null &&
          prep.reasonKey &&
          Math.abs(prep.appliedMedian - prep.benchmarkMedian) >= 0.005
        ) {
          const mv0 = result?.multiples_valuation
          if (
            clientShouldWarnExtremeMultiple(
              prep.appliedMedian,
              mv0?.p10_ebitda_multiple,
              mv0?.p90_ebitda_multiple,
              prep.benchmarkMedian,
              mv0?.p25_ebitda_multiple,
              mv0?.p75_ebitda_multiple
            ) &&
            !prep.acknowledgedExtreme
          ) {
            setCalculating(false)
            setIsGenerating(false)
            toast.error(tPreparer('extremeWarning'))
            return
          }
        }

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
        const fy = (request as any).forecast_years_data || []
        const allYf = [
          ...(cyd
            ? [
                {
                  year: String(cyd.year),
                  revenue: cyd.revenue,
                  ebitda: cyd.ebitda,
                  capex: cyd.capex,
                  nwc_change: cyd.nwc_change,
                },
              ]
            : []),
          ...hy.map((h: any) => ({
            year: String(h.year),
            revenue: h.revenue,
            ebitda: h.ebitda,
            capex: h.capex,
            nwc_change: h.nwc_change,
          })),
          ...fy.map((f: any) => ({
            year: String(f.year),
            revenue: f.revenue,
            ebitda: f.ebitda,
            capex: f.capex,
            nwc_change: f.nwc_change,
            isForecast: true,
          })),
        ]
          .filter((y: any) => y.revenue > 0 || y.ebitda !== 0)
          .sort((a: any, b: any) => parseInt(b.year) - parseInt(a.year))
        lastSubmittedFinancialSnapshotRef.current = {
          revenue: cyd?.revenue ?? (request as any).revenue,
          ebitda: cyd?.ebitda ?? (request as any).ebitda,
          yearlyFinancials: allYf,
        }

        // Step 6: Save the authoritative report package first.
        let durableSaveSucceeded = !idForApi
        if (idForApi) {
          const saveStartDirtyVersion = useSessionStore.getState().dirtyVersion
          try {
            await reportService.saveReportAssets(idForApi, {
              sessionData: mergeSessionDataForReportAssets(
                storeSnapshot as unknown as Record<string, unknown>,
                request as unknown as Record<string, unknown>,
                useTaxLatencyStore.getState().items
              ),
              valuationResult: calcResult,
              htmlReport: calcResult.html_report || undefined,
              name: sessionName,
            })
            useSessionStore.getState().markSaved(saveStartDirtyVersion)
            durableSaveSucceeded = true
          } catch (saveError) {
            const errMsg = saveError instanceof Error ? saveError.message : String(saveError)
            generalLogger.error('[ManualLayout] Failed to save report assets', {
              reportId: idForApi,
              error: errMsg,
            })
            toast.error(tReport('saveReportFailed'), {
              description: errMsg,
            })
          }
        }

        // Step 7: Create version (M&A workflow) after the durable save succeeds.
        // Titan creates V1 automatically during the calculate call.
        // Venus only creates a NEW version when there was already a previous version
        // BEFORE this calculation started AND the user made significant changes.
        let versionCreationFailed = false
        if (idForApi && durableSaveSucceeded) {
          let latestAfterFetch: { versionNumber: number } | null = null
          try {
            await useVersionHistoryStore.getState().fetchVersions(idForApi)
            latestAfterFetch = useVersionHistoryStore.getState().getLatestVersion(idForApi)
          } catch (fetchErr) {
            const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
            generalLogger.warn('[ManualLayout] fetchVersions failed', {
              reportId: idForApi,
              error: fetchMsg,
            })
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
              // Continue - the durable report save already succeeded
            }
          }

          // Re-sync version history from backend after calculation so panels show latest
          if (versionSyncTimeoutRef.current) clearTimeout(versionSyncTimeoutRef.current)
          versionSyncTimeoutRef.current = setTimeout(() => {
            versionSyncTimeoutRef.current = null
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
        } else if (idForApi) {
          generalLogger.warn('[ManualLayout] Skipping version sync until report save succeeds', {
            reportId: idForApi,
          })
        }

        if (!versionCreationFailed) {
          toast.success(t('calculationComplete'))
        }
      } catch (error) {
        setCalculating(false)
        setIsGenerating(false)
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
      result,
      preSelectedMethod,
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
        const venusFormData = mapClarityFormToVenusStore(data)
        updateFormData(venusFormData)
        const storeSnapshot = useManualFormStore.getState().formData
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildManualValuationRequest(storeSnapshot, undefined, validLocale as 'nl' | 'en')
        ;(request as any).dataSource = 'manual'
        ;(request as any).reportId = idForVersions
        if (preSelectedMethod) {
          request.selected_method = preSelectedMethod
        }

        attachSynthesisWeightsToValuationRequest(request)

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
        const n = parseEmployeeCount(value)
        if (n !== undefined) updateFormData({ number_of_employees: n })
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
        const versions =
          resolvedReportId || reportId
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
      const filingYear = getCurrentFilingYear()
      const newItems: NormalizationItem[] = suggestions.map((s: any) => ({
        id: crypto.randomUUID(),
        ledgerCode: s.ledgerCode || '',
        ledgerName: s.description,
        category: mapBackendCategoryToFrontend(s.category) || 'other',
        backendCategory: s.category,
        type: (s.isAddback ? 'add' : 'subtract') as 'add' | 'subtract',
        value: Math.abs(s.amount),
        adjustment: s.amount,
        reason: s.reason,
        source: 'ai' as any,
        sourceRef: 'Claude AI',
        status: 'pending' as any,
        applyAllYears: false,
        year: filingYear,
      }))
      normalizationActions.addItems(newItems)
      const idForApi = resolvedReportId || reportId
      if (idForApi) normalizationActions.persistToSession(idForApi)
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
    if (planFeatures && !planFeatures.valuation_download) {
      openStarterPaywall('pdf_download')
      return
    }
    if (pdfStale) {
      toast.warning(t('downloadPdfStaleHint'))
      return
    }
    setIsExporting(true)
    pdfExportAbortRef.current?.abort()
    const abortController = new AbortController()
    pdfExportAbortRef.current = abortController

    const filename = `${report.companyName?.replace(/\s+/g, '-') || tReport('defaultFilename')}-${tReport('pdfSuffix')}.pdf`

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
          while (elapsed < maxWaitMs && !abortController.signal.aborted) {
            const res = await fetch(`/api/valuations/${idForPdf}/pdf`, {
              method: 'GET',
              credentials: 'include',
              signal: abortController.signal,
            })
            if (res.status === 402) {
              toast.dismiss('pdf-gen')
              openStarterPaywall('pdf_download')
              return
            }
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
      if (error instanceof APIError && error.statusCode === 402) {
        openStarterPaywall('pdf_download')
        return
      }
      generalLogger.error('[ManualLayout] PDF export failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(t('pdfExportFailed'), { description: t('pdfExportFailedDesc') })
    } finally {
      setIsExporting(false)
    }
  }, [
    report,
    reportId,
    resolvedReportId,
    isPdfReady,
    downloadPdf,
    generatePdf,
    tReport,
    t,
    pdfStale,
    planFeatures,
    openStarterPaywall,
  ])

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
        const loc =
          currentLocale && (currentLocale === 'en' || currentLocale === 'nl') ? currentLocale : 'en'
        window.location.href = `${getMercuryUrl()}/${loc}/advisor/dashboard`
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
  const [rawRecentValuations, setRawRecentValuations] = useState<RecentValuation[]>([])

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
            companyName: r.company_name || r.companyName || r.name || t('unnamed'),
            updatedAt: new Date(r.updated_at || r.updatedAt || r.created_at || Date.now()),
            isDraft: r.status === 'draft' || r.status === 'in_progress',
            deleteMode: 'report' as const,
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
    const shouldPrepend = (currentId || (reportId && reportId !== 'new') || report) && !inList
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
        {
          id: prependedId,
          companyName,
          updatedAt,
          isDraft: !report,
          deleteMode: (!report ? 'session' : 'report') as 'session' | 'report',
        },
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
        const normItems = useNormalizationStore
          .getState()
          .items.filter((n) => n.status === 'accepted')
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
      useNbbPrefillStore.getState().clear()
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
    async (valuation: RecentValuation) => {
      const { id, isDraft } = valuation
      // Guard: prevent concurrent delete (ref is synchronous; state is async and can race)
      if (deleteInProgressRef.current === id) return
      deleteInProgressRef.current = id
      setDeletingValuationId(id)
      try {
        await deleteValuationEntry({
          valuation,
          deleteDraftSession: (sessionId) => backendAPI.deleteValuationSession(sessionId),
          deleteReport: (reportId) => reportService.deleteReport(reportId),
        })
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
            const redirectTo = `/${currentLocale}/advisor/dashboard`
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
                const returnUrl =
                  typeof window !== 'undefined'
                    ? sessionStorage.getItem('upswitch_return_url')
                    : null
                const sourceApp =
                  typeof window !== 'undefined' ? sessionStorage.getItem('upswitch_source') : null
                redirectUrl = getSafeMercuryReturnUrl(returnUrl, {
                  clientContextId: clientContextId ?? undefined,
                  locale: currentLocale,
                  sourceApp: sourceApp ?? undefined,
                })
              } catch {
                redirectUrl = `${getMercuryUrl()}/${currentLocale}/advisor/dashboard`
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
    window.location.href = `${mercuryBaseUrl}/${locale}/advisor/settings`
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
        generalLogger.warn(
          '[ManualLayout] handleSwitchWorkspace: sessionStorage unavailable, falling back to Venus home',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
    router.push(`/${currentLocale}/home`)
  }, [router, currentLocale])

  // Accountant dropdown navigation (Mercury parity)
  // Venus locales (en, nl) map 1:1 to Mercury; fallback to 'en' for robustness
  const mercuryLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'en'

  const handleNavigateToDashboard = useCallback(() => {
    const mercuryBaseUrl = getMercuryUrl()
    window.location.href = `${mercuryBaseUrl}/${mercuryLocale}/advisor/dashboard`
  }, [mercuryLocale])

  const handleNavigateToBilling = useCallback(() => {
    const mercuryBaseUrl = getMercuryUrl()
    window.location.href = `${mercuryBaseUrl}/${mercuryLocale}/advisor/settings?tab=billing`
  }, [mercuryLocale])

  const handleNavigateToHelp = useCallback(() => {
    const mercuryBaseUrl = getMercuryUrl()
    window.location.href = `${mercuryBaseUrl}/${mercuryLocale}/help`
  }, [mercuryLocale])

  /** Client invite / share: Mercury client detail (SendInvitationModal), not Venus nav CTA */
  const handleOpenMercuryClientForInvite = useCallback(() => {
    if (!clientContextId) return
    window.location.href = `${getMercuryUrl()}/${mercuryLocale}/advisor/clients/${clientContextId}`
  }, [clientContextId, mercuryLocale])

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
  const openUnifiedNormalizationModal = useCallback(
    (opts?: {
      prefill?: GuidedNormalizationPrefill | null
      closeChat?: boolean
      track?: boolean
    }) => {
      if (planFeatures && !planFeatures.ebitda_normalization) {
        openStarterPaywall('normalization')
        return
      }
      setGuidedNormalizationPrefill(opts?.prefill ?? null)
      if (opts?.track !== false) {
        trackNormalizationOpen()
      }
      setShowUnifiedNormalizationModal(true)
      if (opts?.closeChat) {
        setChatDrawerOpen(false)
      }
    },
    [planFeatures, openStarterPaywall]
  )

  const handleUnifiedNormalizationModalOpenChange = useCallback((open: boolean) => {
    setShowUnifiedNormalizationModal(open)
    if (!open) {
      setGuidedNormalizationPrefill(null)
    }
  }, [])

  const handleShowNormalisationReview = useCallback(() => {
    openUnifiedNormalizationModal()
  }, [openUnifiedNormalizationModal])

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
          current_year_data:
            latestFinancialOverrides.current_year_data ?? formStoreData.current_year_data,
          historical_years_data:
            latestFinancialOverrides.historical_years_data ?? formStoreData.historical_years_data,
          revenue: latestFinancialOverrides.revenue ?? formStoreData.revenue,
          ebitda: latestFinancialOverrides.ebitda ?? formStoreData.ebitda,
        } as VenusFormData
        const request = buildManualValuationRequest(
          requestSource,
          normalizations,
          recalcLocale as 'nl' | 'en'
        )
        ;(request as any).dataSource = 'manual'
        if (preSelectedMethod) {
          request.selected_method = preSelectedMethod
        }

        attachSynthesisWeightsToValuationRequest(request)

        if (calculationRequestIdentifiers.reportId) {
          ;(request as any).reportId = calculationRequestIdentifiers.reportId
        }
        if (calculationRequestIdentifiers.sessionKey) {
          ;(request as any).sessionKey = calculationRequestIdentifiers.sessionKey
        }

        mergePreparerMultipleIntoRequest(request as unknown as Record<string, unknown>)
        const prepN = usePreparerMultipleStore.getState()
        if (
          prepN.benchmarkMedian != null &&
          prepN.appliedMedian != null &&
          prepN.reasonKey &&
          Math.abs(prepN.appliedMedian - prepN.benchmarkMedian) >= 0.005
        ) {
          const mvN = result?.multiples_valuation
          if (
            clientShouldWarnExtremeMultiple(
              prepN.appliedMedian,
              mvN?.p10_ebitda_multiple,
              mvN?.p90_ebitda_multiple,
              prepN.benchmarkMedian,
              mvN?.p25_ebitda_multiple,
              mvN?.p75_ebitda_multiple
            ) &&
            !prepN.acknowledgedExtreme
          ) {
            toast.error(tPreparer('extremeWarning'))
            return
          }
        }

        const calcResult = await valuationService.calculateValuation(request)
        if (calcResult) {
          setResult(calcResult)
          setDraftStatus('saved')
          setLastSaved(new Date())
          try {
            await reportService.saveReportAssets(idForApi, {
              sessionData: mergeSessionDataForReportAssets(
                requestSource as unknown as Record<string, unknown>,
                request as unknown as Record<string, unknown>,
                useTaxLatencyStore.getState().items
              ),
              valuationResult: calcResult,
              htmlReport: calcResult.html_report || undefined,
              name: sessionName,
            })
          } catch (saveError) {
            generalLogger.warn(
              '[ManualLayout] Failed to sync recalculated normalization report assets',
              {
                reportId: idForApi,
                error: saveError instanceof Error ? saveError.message : String(saveError),
              }
            )
          }
          toast.success(t('recalculatedWithNorms'), {
            description: t('recalculatedWithNormsDesc', { count: acceptedNorms.length }),
          })
        }
      } catch (error) {
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
      buildValuationRequest,
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
    ]
  )

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
      getYearsToPersist,
    ]
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
    [
      reportId,
      resolvedReportId,
      normalizationActions,
      getYearsToPersist,
      originalEBITDAByYear,
      t,
      recalculateWithNormalizations,
    ]
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
    [
      reportId,
      resolvedReportId,
      normalizationActions,
      getYearsToPersist,
      originalEBITDAByYear,
      t,
      recalculateWithNormalizations,
    ]
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
                  backendCategory: rawCat,
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
        if (
          version.tax_latency_data &&
          Array.isArray(version.tax_latency_data) &&
          version.tax_latency_data.length > 0
        ) {
          useTaxLatencyStore.getState().setItems(version.tax_latency_data)
        } else {
          useTaxLatencyStore.getState().clear()
        }

        const versionBusinessContext =
          version.formData &&
          typeof version.formData === 'object' &&
          'business_context' in version.formData
            ? (version.formData.business_context as Record<string, unknown> | undefined)
            : undefined
        const importedLedgerAnalysis = versionBusinessContext?._imported_ledger_analysis
        if (importedLedgerAnalysis && typeof importedLedgerAnalysis === 'object') {
          useTaxLatencyStore
            .getState()
            .setCandidates(
              buildTaxLatencyCandidatesFromImportedLedgerAnalysis(importedLedgerAnalysis as any)
            )
        } else {
          useTaxLatencyStore.getState().setCandidates([])
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

  // ─── CSV / “import” UI → normalization hints only (NOT Hermes MAR ingestion) ───
  // Calls /api/ai/normalize → gap-analysis style suggestions. Full ledger ingest must go
  // Hermes aggregate + Titan sync; see docs/financial-ingestion/CSV_UNIFIED_PIPELINE.md.
  const handleCSVImportComplete = useCallback(
    async (source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable', _fileName?: string) => {
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

        const filingYear = getCurrentFilingYear()
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
          year: filingYear,
        }))

        setSuggestedNormalisations(suggestions)
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
    [reportId, resolvedReportId, collectedData, normalizationActions, t]
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
  }, [t])

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
    preferIntegrationEntry:
      isAccountantFlow ||
      hasImportQuality ||
      Boolean(identity.clientContext?.clientCompanyName?.trim()),
    integrationsEnabled: planFeatures?.integrations_enabled ?? false,
    planType: plan?.plan_type ?? 'free',
    synthesisWeights: userWeights,
    synthesisJustification: userWeightJustification,
    onSynthesisWeightsChange: setUserWeights,
    onSynthesisJustificationChange: setUserWeightJustification,
    synthesisUnlocked,
    synthesisValuationResults,
    onSynthesisPaywall: () => openStarterPaywall('synthesis'),
    initialData: {
      companyName: collectedData.companyName,
      kboNumber: collectedData.kboNumber,
      legalForm: collectedData.legalForm,
      businessStructure:
        collectedData.businessStructure ||
        mapLegalFormToBusinessStructure(collectedData.legalForm || ''),
      address: collectedData.address,
      naceCode: formActivityCode || formNaceCode || collectedData.naceCode,
      canonicalNaceCode: formNaceCode || '',
      naceDescription: collectedData.naceDescription,
      businessType: collectedData.businessType,
      industry: collectedData.industry,
      country: collectedData.country,
      yearFounded: collectedData.yearFounded,
      ownerManagers: collectedData.ownerManagers,
      fteEmployees: formStoreData.number_of_employees ?? collectedData.fteEmployees,
      current_year_data: formStoreData.current_year_data ?? collectedData.current_year_data,
      historical_years_data: formStoreData.historical_years_data,
      forecast_years_data: formStoreData.forecast_years_data,
      filingYearConfirmed: formStoreData.filing_year_confirmed,
      yearlyFinancials: restoredYearlyFinancials,
    },
  }

  // ─── Shared Chat Drawer Props ───
  const cyd = formStoreData?.current_year_data as { ebitda?: number } | undefined
  const hy = (formStoreData?.historical_years_data || []) as Array<{ ebitda?: number }>
  const hasEbitda = (cyd && (cyd.ebitda ?? 0) !== 0) || hy.some((h) => (h.ebitda ?? 0) !== 0)
  const pendingNormalizationCount = normalizationItems.filter((n) => n.status === 'pending').length
  const hasImportedNormalizationData =
    hasImportQuality ||
    suggestedNormalisations.length > 0 ||
    normalizationItems.some((n) => n.source !== 'manual' && n.source !== 'ai')
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
    onAcceptNormalisation: handleAcceptNormalisation,
    onRejectNormalisation: handleRejectNormalisation,
    hasUploadedData: hasImportedNormalizationData,
    toolInProgress: conversationStore.toolInProgress,
    onOpenNormalizationHub: () => {
      openUnifiedNormalizationModal({ closeChat: true })
    },
    onRetry: handleRetry,
    onNewConversation: handleNewConversation,
  }

  // Stable last full year for originalEBITDA fallback (avoids date-boundary inconsistencies)
  const lastFullYear = getCurrentFilingYear()

  const guidedResolutionAppliedRef = useRef(false)

  useEffect(() => {
    guidedResolutionAppliedRef.current = false
  }, [reportId])

  useEffect(() => {
    if (!restorationComplete || !guidedResolutionUrl) return
    const hasGuidance =
      guidedResolutionUrl.spotlight === '1' ||
      !!guidedResolutionUrl.focusField ||
      !!guidedResolutionUrl.flagYear
    if (!hasGuidance) return
    if (!importQualityMap || Object.keys(importQualityMap).length === 0) return
    if (guidedResolutionAppliedRef.current) return
    guidedResolutionAppliedRef.current = true

    useSpotlightStore.getState().applyUrlGuidance({
      forceSpotlight: guidedResolutionUrl.spotlight === '1',
      focusField: guidedResolutionUrl.focusField,
      flagYear: guidedResolutionUrl.flagYear,
    })

    const spotlightState = useSpotlightStore.getState()
    const mappingHeavyFlagCodes = new Set([
      'FALLBACK_MAPPING',
      'AI_MAPPING_REVIEW',
      'AI_MAPPING_MANUAL',
      'LOW_CONFIDENCE',
      'REVIEW_METADATA_MISSING',
    ])
    const activeTargetDomId = spotlightState.activeDomId
    if (activeTargetDomId) {
      const flags = spotlightState.getFlagsForDomId(activeTargetDomId)
      const { field, yearKey } = parseSpotlightDomId(activeTargetDomId)
      const mappingMethod = spotlightState.getFieldMappingMethod(field, yearKey)
      const shouldOpenSourcePanel =
        mappingMethod === 'fallback' ||
        mappingMethod === 'manual' ||
        flags.some(
          (flag) => mappingHeavyFlagCodes.has(flag.code) || (flag.source_accounts?.length ?? 0) > 0
        )
      if (shouldOpenSourcePanel && !spotlightState.showSourcePanel) {
        spotlightState.openSourcePanel()
      }

      const normalizationPrefill = deriveGuidedNormalizationPrefill({
        activeDomId: activeTargetDomId,
        importQuality: importQualityMap,
      })
      if (!shouldOpenSourcePanel && normalizationPrefill) {
        openUnifiedNormalizationModal({
          prefill: normalizationPrefill,
          track: false,
        })
      }
    }

    const ff = guidedResolutionUrl.focusField
    if (!ff) return

    const domId = spotlightDomId(
      ff,
      guidedResolutionUrl.flagYear != null && guidedResolutionUrl.flagYear !== ''
        ? guidedResolutionUrl.flagYear
        : undefined
    )
    const scrollToFlag = () => {
      try {
        const el = document.querySelector(`[data-spotlight-field="${CSS.escape(domId)}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } catch {
        const el = document.querySelector(`[data-spotlight-field="${domId}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(scrollToFlag))
  }, [restorationComplete, guidedResolutionUrl, importQualityMap, openUnifiedNormalizationModal])

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
            openUnifiedNormalizationModal()
          }}
          normalizationCount={normalizationItems.filter((n) => n.status === 'accepted').length}
          openTasksCount={pendingNormalizationCount + pendingUpdates.length}
          isExporting={isExporting || isMethodSwitchRendering}
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
          showSourceDataToggle={hasImportQuality}
          sourceDataOpen={showSourceDataPanel}
          onToggleSourceData={toggleSourceDataPanel}
          onOpenValuationEdit={() => setShowValuationEditModal(true)}
          preSelectedMethod={preSelectedMethod ?? undefined}
          preSelectedMethods={preSelectedMethods}
          onPreSelectMethod={handlePreSelectMethod}
          onToggleMethod={togglePreSelectedMethodWithPlanGate}
          firmCountryCode={user?.firm_country_code}
          preSelectableMethodsForNav={preSelectableMethodsForNav}
          planLockedMethodKeys={planLockedMethodKeys}
          onPlanLockedMethodAction={handlePlanLockedMethodAction}
          normalizationFeatureLocked={ebitdaNormalizationLocked}
          onNormalizationFeatureLocked={() => openStarterPaywall('normalization')}
          versionControlFeatureLocked={versionControlLocked}
          onVersionControlFeatureLocked={() => openStarterPaywall('version_history')}
          canDownloadPdf={canDownloadPdf}
          valuationSummary={navValuationSummary}
        />

        {pdfStaleBannerEl}

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
                window.location.href = `${mercuryUrl}/${mercuryLocale}/advisor/clients/${clientContextId}`
              }
            }}
            onBusinessClick={
              clientContextId
                ? () => {
                    const mercuryUrl = getMercuryUrl()
                    window.location.href = `${mercuryUrl}/${mercuryLocale}/advisor/clients/${clientContextId}`
                  }
                : undefined
            }
            clientApprovalStatus="none"
            onResendApproval={() => toast.info(t('reminderSent'))}
            pendingNormalisations={pendingNormalizationCount}
            onShowNormalisationReview={handleShowNormalisationReview}
          />
        )}

        <div className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)] min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <StartupAwareInputPanel key={reportId} {...manualInputProps} />
          </div>
        </div>

        <ChatAssistantDrawer {...chatDrawerProps} />

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
        onOpenNormalization={() => openUnifiedNormalizationModal()}
        normalizationCount={normalizationItems.filter((n) => n.status === 'accepted').length}
        openTasksCount={pendingNormalizationCount + pendingUpdates.length}
        isExporting={isExporting || isMethodSwitchRendering}
        downloadHistory={downloadHistory}
        onRedownload={(item: any) => {
          if (!canDownloadPdf) {
            openStarterPaywall('pdf_download')
            return
          }
          if (item.url) {
            window.open(item.url, '_blank')
          } else {
            toast.info(t('pdfRegenerating'), { description: t('pdfRegeneratingDesc') })
          }
        }}
        onNavigateToDashboard={handleNavigateToDashboard}
        onNavigateToBilling={handleNavigateToBilling}
        onNavigateToHelp={handleNavigateToHelp}
        valuationSummary={navValuationSummary}
        valuationVersions={versionHistoryForNav}
        selectedVersionId={selectedVersionId}
        onSelectVersion={handleSelectVersion}
        onContinueToListing={() => {
          trackReturnToMercury()
          const mercuryBaseUrl = getMercuryUrl()
          const basePath = clientContextId
            ? `${mercuryBaseUrl}/${mercuryLocale}/advisor/clients/${clientContextId}`
            : `${mercuryBaseUrl}/${mercuryLocale}/advisor/clients`
          const hasCompletedValuation =
            (!!report &&
              typeof report.valuation === 'number' &&
              Number.isFinite(report.valuation)) ||
            !!(session?.valuationResult || session?.htmlReport)
          const returnPath = getSafeMercuryReturnUrl(basePath, {
            clientContextId: clientContextId ?? undefined,
            locale: mercuryLocale,
            sourceApp: 'mercury',
            celebrateMercuryReturn: hasCompletedValuation,
          })
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
        showSourceDataToggle={hasImportQuality}
        sourceDataOpen={showSourceDataPanel}
        onToggleSourceData={toggleSourceDataPanel}
        onOpenValuationEdit={() => setShowValuationEditModal(true)}
        preSelectedMethod={preSelectedMethod ?? undefined}
        preSelectedMethods={preSelectedMethods}
        onPreSelectMethod={handlePreSelectMethod}
        onToggleMethod={togglePreSelectedMethodWithPlanGate}
        firmCountryCode={user?.firm_country_code}
        preSelectableMethodsForNav={preSelectableMethodsForNav}
        planLockedMethodKeys={planLockedMethodKeys}
        onPlanLockedMethodAction={handlePlanLockedMethodAction}
        normalizationFeatureLocked={ebitdaNormalizationLocked}
        onNormalizationFeatureLocked={() => openStarterPaywall('normalization')}
        versionControlFeatureLocked={versionControlLocked}
        onVersionControlFeatureLocked={() => openStarterPaywall('version_history')}
        canDownloadPdf={canDownloadPdf}
      />

      {pdfStaleBannerEl}

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
              window.location.href = `${mercuryUrl}/${mercuryLocale}/advisor/clients/${clientContextId}`
            }
          }}
          onBusinessClick={
            clientContextId
              ? () => {
                  const mercuryUrl = getMercuryUrl()
                  window.location.href = `${mercuryUrl}/${mercuryLocale}/advisor/clients/${clientContextId}`
                }
              : undefined
          }
          clientApprovalStatus="none"
          onResendApproval={() => toast.info(t('reminderSent'))}
          pendingNormalisations={pendingNormalizationCount}
          onShowNormalisationReview={handleShowNormalisationReview}
        />
      )}

      {/* Main Content: Resizable Panels */}
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
                                    {(liveMultipleReportPreview.previewEquity / 1_000_000).toFixed(
                                      2
                                    )}
                                    M
                                  </p>
                                  <p className="text-[11px] font-mono tabular-nums text-foreground/55">
                                    {liveMultipleReportPreview.delta >= 0 ? '+' : '-'}€
                                    {(Math.abs(liveMultipleReportPreview.delta) / 1_000).toFixed(0)}
                                    K · {liveMultipleReportPreview.appliedMultiple.toFixed(2)}x
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
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
                                €{(liveMultipleReportPreview.previewEquity / 1_000_000).toFixed(2)}M
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-foreground/55">
                                {liveMultipleReportPreview.delta >= 0 ? '+' : '-'}€
                                {(Math.abs(liveMultipleReportPreview.delta) / 1_000).toFixed(0)}K ·{' '}
                                {liveMultipleReportPreview.appliedMultiple.toFixed(2)}x
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
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
        onShare={
          isAccountantMode && clientContextId
            ? () => {
                setShowFullscreenModal(false)
                handleOpenMercuryClientForInvite()
              }
            : undefined
        }
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

      {/* Source Data Panel — "Trust but Verify" raw ledger data */}
      <SourceDataPanel />

      <ValuationEditModal
        open={showValuationEditModal}
        onClose={() => {
          if (isMethodSwitchRendering) return
          setShowValuationEditModal(false)
        }}
        valuationResults={getHydratedValuationResults(result) ?? {}}
        isHydratingMethods={isHydratingEditModalData}
        methodDataLoadError={reportMethodHydrationError}
        onRetryMethodDataLoad={() => setReportHydrationRetryNonce((n) => n + 1)}
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
        canExportZeroDraft={planFeatures?.valuation_download !== false}
        zeroDraftReportId={resolvedReportId || reportId}
        zeroDraftBusinessName={collectedData.companyName ?? report?.companyName}
        zeroDraftCreatedAt={
          report?.generatedAt instanceof Date ? report.generatedAt.toISOString() : undefined
        }
        showPreparerMultiple={showPreparerMultiplePanel}
        isMethodPersisting={isMethodSwitchRendering}
        firmCountryCode={user?.firm_country_code}
        planAllowedMethodKeys={allowedMethodKeys}
        onPlanLockedMethodClick={() => openStarterPaywall('methods')}
      />

      {/* Starter paywall — methods, normalization hub, or version history (Free tier teasers) */}
      {methodPaywallOpen && (
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
                {methodPaywallReason === 'methods' &&
                  (currentLocale === 'nl'
                    ? 'Upgrade voor alle methodes'
                    : 'Upgrade for all methods')}
                {methodPaywallReason === 'normalization' &&
                  (currentLocale === 'nl'
                    ? 'EBITDA-normalisatie & belastinglatenties'
                    : 'EBITDA normalization & tax latencies')}
                {methodPaywallReason === 'version_history' &&
                  (currentLocale === 'nl'
                    ? 'Overschrijven, verfijnen & auditspoor'
                    : 'Overwrite, refine & audit trail')}
                {methodPaywallReason === 'synthesis' &&
                  (currentLocale === 'nl' ? 'Waarderingssynthese' : 'Valuation Synthesis')}
                {methodPaywallReason === 'pdf_download' &&
                  (currentLocale === 'nl'
                    ? 'PDF-download vanaf Starter'
                    : 'PDF download from Starter')}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {methodPaywallReason === 'methods' &&
                  (currentLocale === 'nl'
                    ? 'Je gratis plan bevat Upswitch marktbenadering, DCF, EBITDA en gecorrigeerd NAV (read-only, geen PDF-download). Upgrade naar Starter voor alle 9 methodes, manuele controle over elke aanpassing, downloadbare rapporten zonder watermerk in uw huisstijl en live Benelux sector-multiples.'
                    : 'Your free plan includes Upswitch market approach, DCF, EBITDA, and adjusted NAV (read-only, no PDF download). Upgrade to Starter for all 9 methods, manual control over every adjustment, downloadable watermark-free branded reports, and live Benelux sector multiples.')}
                {methodPaywallReason === 'normalization' &&
                  (currentLocale === 'nl'
                    ? 'De volledige normalisatiehub (incl. belastinglatenties) zit in Starter. Je krijgt ook gepersonaliseerde PDF-rapporten, volledige manuele controle en de mogelijkheid om waarderingen te overschrijven met volledig auditspoor.'
                    : 'The full normalization hub (incl. tax latencies) is on Starter together with branded PDFs, full manual control, and the ability to overwrite valuations with full audit trail.')}
                {methodPaywallReason === 'version_history' &&
                  (currentLocale === 'nl'
                    ? 'Overschrijven & verfijnen bij wijzigende cijfers — met volledig auditspoor — vanaf Starter.'
                    : 'Overwrite & refine as financials evolve — with full audit trail — from Starter.')}
                {methodPaywallReason === 'synthesis' &&
                  (currentLocale === 'nl'
                    ? 'Combineer meerdere waarderingsmethodes met een gewogen gemiddelde en verdedig uw keuze in het PDF-rapport. Upgrade naar Starter voor de volledige waarderingssynthese.'
                    : 'Blend multiple valuation methods with weighted averages and defend your choice in the PDF report. Upgrade to Starter for the full valuation synthesis.')}
                {methodPaywallReason === 'pdf_download' &&
                  (currentLocale === 'nl'
                    ? 'Uw gratis rapport is read-only met watermerk. Upgrade naar Starter voor downloadbare PDF-rapporten zonder watermerk in uw huisstijl en alle 9 methodes.'
                    : 'Your free report is read-only with a watermark. Upgrade to Starter for downloadable watermark-free PDF reports with your branding and all 9 methods.')}
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
                href={`${getMercuryUrl()}/${currentLocale}/pricing`}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors text-center"
              >
                {getStarterPlanSummary(currentLocale)}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
