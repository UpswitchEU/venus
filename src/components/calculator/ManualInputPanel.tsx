'use client'

/**
 * Manual Input Panel
 *
 * Clean, minimal form for bedrijfsschatting data entry.
 * World-class design: progressive disclosure, single primary CTA.
 *
 * KEY FEATURE: Multi-year EBITDA Normalization
 * - Normalizations apply to historical years (3-5 years)
 * - Calculate normalized average EBITDA for valuation
 * - Each year can have its own set of adjustments
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CloudDownload,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  Lock,
  Plus,
  X,
  Zap,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BizzcontrolImportModal } from '@/components/integrations/BizzcontrolImportModal'
import { CSVUploadCard, type ParsedCSVData } from '@/components/integrations/CSVUploadCard'
import { OctopusImportModal } from '@/components/integrations/OctopusImportModal'
import {
  type BusinessType,
  BusinessTypeSearchInput,
  categoryIcons,
  type KBOCompany,
  KBOSearchInput,
} from '@/design-system'
import { isAccountantFreeOrStarterTier } from '@/constants/accountantPlanMethods'
import { TARGET_COUNTRIES } from '../../config/countries'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraInput, AuroraTextarea } from '@/design-system/components/Input'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import { AuroraSelect } from '@/design-system/components/Select'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import {
  computeFiscal4xPreview,
  resolveBookEquityFromYearRow,
  useManualPreviewFormatters,
} from '@/lib/omniPreview'
import { decodeSilverfinOAuthState } from '@/utils/silverfin-oauth-state'

const MethodPreviewAuditDevPanel = lazy(() =>
  import('./sections/MethodPreviewAuditDevPanel').then((m) => ({
    default: m.MethodPreviewAuditDevPanel,
  }))
)

import {
  type GetBonusSectionsSaasSignals,
  getBonusSections,
  getBonusSectionsForMethods,
  getBonusSectionsSaasSignalsFromFormData,
  getSynthesisMethodKeysForUi,
  resolveBusinessTypeIdForBonusSections,
} from '../../constants/methodFieldConfig'
import { useAuth } from '../../hooks/useAuth'
import { useBusinessTypes } from '../../hooks/useBusinessTypes'
import { useCanSave } from '../../hooks/useCanSave'
import { useSyncOfficialVarianceFromForm } from '../../hooks/useSyncOfficialVarianceFromForm'
import {
  type AccountingAdministration,
  type AccountingBatchPayload,
  type AccountingImportProvider,
  accountingAPI,
  accountingProviderDisplayName,
  type IntegrationStatus,
  isAccountingImportProvider,
  parseAccountingApiError,
  pickConnectedImportStatus,
} from '../../services/api/accounting'
import { looksLikeNaceCode, naceBusinessTypeService } from '../../services/naceBusinessTypeService'
import { registryService } from '../../services/registry/registryService'
import type { CompanySearchResult } from '../../services/registry/types'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useNbbPrefillStore } from '../../store/useNbbPrefillStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useSpotlightStore } from '../../store/useSpotlightStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type {
  OfficialFinancialsPayload,
  OfficialVarianceAnalysis,
  OfficialVerificationBadge,
  YearDataInput,
} from '../../types/valuation'
import {
  getCurrentFilingYear,
  getFilingYearHistoricalOffset,
  normalizeHistoricalYearsForFiling,
} from '../../utils/fiscalYear'
import {
  appendManualForecastYear,
  canAppendForecastYear,
  canAppendHistoricalYear,
  canRemoveHistoricalYear,
  countForecastYears,
  dcfInjectionAddedRowCount,
  getNextForecastYear,
  getNextHistoricalYear,
  injectDefaultDcfForecastYears,
  removeForecastYear,
  removeForecastYears,
  removeHistoricalYear,
} from '../../utils/forecastYears'
import {
  buildMercuryIntegrationsUrl,
  type MercuryAccountingProviderDeepLink,
} from '../../utils/getMercuryUrl'
import { mapLegalFormToBusinessStructure } from '../../utils/legalFormMapping'
import { getFinancialTerm } from '../../utils/locale/financial-terms'
import { mergeImportedLedgerAnalysisIntoBusinessContext } from '../../utils/mergeImportedLedgerAnalysisIntoBusinessContext'
import { mergeOptionalSessionPrefillFields } from '../../utils/mergeOptionalSessionPrefillFields'
import {
  countNormalizationsBoundToFiscalYear,
  removeNormalizationsForRemovedFiscalYear,
} from '../../utils/normalizationMath'
import { hasUsableOfficialFinancialsContent } from '../../utils/officialFinancialsContent'
import { shouldSuppressMercurySessionPrefill } from '../../utils/prefillRestorationGate'
import { getAnnualFictiveRentDeductionForDisplay } from '../../utils/realEstateCarveOutDisplay'
import { pickLegalFormFromRegistryHit } from '../../utils/registryUtils'
import {} from '../../utils/shareholding'
import { buildCurrentYearData } from '../../utils/yearData'
import {
  getHistoricalYearRange,
  getLatestCompleteYearlyFinancial,
  hasExplicitNumericValue as hasExplicitFinancialValue,
  historicalYearRowNeedsRemovalWarning,
} from '../../utils/yearlyFinancials'
import { CurrencyInput } from './CurrencyInput'
import { FilingYearPrompt } from './FilingYearPrompt'
import { GuidedResolutionOrphanFields } from './GuidedResolutionOrphanFields'
import { ProvenanceDot } from './ProvenanceDot'
import { SpotlightBanner } from './SpotlightBanner'
import { SpotlightFieldWrapper } from './SpotlightFieldWrapper'
import {
  DcfForecastWorkspace,
  DcfGlobalAssumptions,
  NavAssetScheduleSection,
  RealEstateCarveOutSection,
  RevenueQualitySection,
  SaasMetricsSection,
  SdeOwnerCompensationSection,
  SECTION_HEADER_ROW_CLASS,
  SectionStatusCircle,
  SynthesisWeightingSection,
} from './sections'
import type { TerminalValueMethod } from './sections/DcfGlobalAssumptions'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
  DCF_DEFAULT_TERMINAL_GROWTH_PCT,
  DCF_DEFAULT_WACC_PCT,
} from './sections/dcfEngineDefaults'
import {
  type DcfForecastModelSnapshot,
  snapshotFromForecastRowLike,
  snapshotsClose,
} from './sections/dcfForecastModelSync'
import {
  applyDcfProjectionPreviewToForecastRows,
  buildProjectionRowFromForecastRow,
  deriveDcfProjectionPreview,
} from './sections/dcfProjectionPreview'
import { deriveDcfSmartDefaults } from './sections/dcfSmartDefaults'
import { PreviewMetricCard } from './sections/previewMetricCards'
import { deriveSaasArrProjectionPreview } from './sections/saasArrProjectionPreview'

function NbbResetHint({
  fiscalYear,
  currentRevenue,
  currentEbitda,
  onReset,
}: {
  fiscalYear: string
  currentRevenue: number
  currentEbitda: number
  onReset: (field: 'revenue' | 'ebitda', value: number) => void
}) {
  const t = useTranslations('manualInput')
  const snap = useNbbPrefillStore((s) => s.getYearSnapshot(fiscalYear))
  if (!snap) return null

  const safeRev = Number.isFinite(currentRevenue) ? currentRevenue : null
  const safeEbitda = Number.isFinite(currentEbitda) ? currentEbitda : null
  const revDiffers =
    snap.revenue != null && (safeRev == null || Math.abs(safeRev - snap.revenue) > 0.01)
  const ebitdaDiffers =
    snap.ebitda != null && (safeEbitda == null || Math.abs(safeEbitda - snap.ebitda) > 0.01)

  if (!revDiffers && !ebitdaDiffers) return null

  return (
    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-blue-500">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
      <button
        type="button"
        onClick={() => {
          if (revDiffers && snap.revenue != null) onReset('revenue', snap.revenue)
          if (ebitdaDiffers && snap.ebitda != null) onReset('ebitda', snap.ebitda)
        }}
        className="underline underline-offset-2 hover:text-blue-600 transition-colors"
      >
        {t('resetToNbb')}
      </button>
    </div>
  )
}

// Types
export interface YearlyFinancials {
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
  /** Optional balance sheet strip (import / advanced row) — used for fiscal / NAV context. */
  total_equity?: number
  total_assets?: number
  total_liabilities?: number
  normalizedEbitda?: number
  /** Explicit FCFF per forecast year (“zonder EBITDA”). */
  free_cash_flow?: number
  isForecast?: boolean
}

export interface ValuationFormData {
  companyName: string
  kboNumber?: string
  legalForm?: string
  address?: string
  naceCode?: string
  naceDescription?: string
  /** Canonical NACE for Titan lookups when naceCode shows a market alias (e.g. SBI). */
  canonicalNaceCode?: string
  businessType: string
  businessTypeCode?: string
  industry: string
  country: string
  yearFounded: string
  businessStructure: string
  ownerManagers: number
  fteEmployees: number | undefined
  // Multi-year financials with normalizations per year
  yearlyFinancials: YearlyFinancials[]
  // Calculated values
  averageNormalizedEbitda?: number
  // Convenience fields for AI context (derived from the latest complete financial year)
  revenue?: number
  ebitda?: number
  current_year_data?: YearDataInput
  historical_years_data?: YearDataInput[]
  forecast_years_data?: YearDataInput[]
  filingYearConfirmed?: boolean
  // Adaptive Input Studio: method-specific bonus fields
  dcf_revenue_growth_pct?: number
  dcf_ebitda_margin_pct?: number
  dcf_capex_pct?: number
  dcf_da_pct?: number
  dcf_nwc_pct?: number
  dcf_tax_rate_pct?: number
  dcf_wacc_pct?: number
  dcf_terminal_growth_pct?: number
  dcf_exit_multiple?: number
  dcf_risk_free_rate_pct?: number
  dcf_equity_risk_premium_pct?: number
  dcf_beta?: number
  dcf_cost_of_debt_pct?: number
  dcf_debt_equity_pct?: number
  dcf_tax_shield_pct?: number
  dcf_terminal_value_method?: 'perpetual_growth' | 'exit_multiple'
  /** Manual DCF forecast entry: EBITDA bridge vs explicit FCFF only. */
  dcf_input_mode?: 'ebitda' | 'fcff_only'
  nav_real_estate_adjustment?: number
  nav_inventory_adjustment?: number
  nav_hidden_reserves?: number
  nav_goodwill_writeoff?: number
  nav_receivables_adjustment?: number
  nav_other_revaluations?: number
  nav_tax_latency_pct?: number
  nav_off_balance_items?: number
  exclude_real_estate?: boolean
  real_estate_book_value?: number
  estimated_market_rent?: number
  saas_arr?: number
  saas_mrr?: number
  saas_arr_growth_pct?: number
  saas_churn_pct?: number
  saas_customer_churn_pct?: number
  saas_nrr_pct?: number
  saas_gross_margin_pct?: number
  saas_cac?: number
  saas_customer_concentration_pct?: number
  saas_expansion_revenue_pct?: number
  saas_sm_spend?: number
  rev_recurring_pct?: number
  rev_recurring_amount?: number
  rev_top_client_concentration_pct?: number
  rev_top_client_amount?: number
  rev_contract_backlog?: number
  rev_gross_churn_pct?: number
  rev_capitalized_rd_amount?: number
  /** 0–100; normalized to 100% in Zustand for the manual product, but kept for API parity. */
  shares_for_sale?: number
  /** Annual owner compensation (€) for SDE — matches ValuationRequest / Titan. */
  owner_salary_addback?: number
  /** Optional import/session metadata (e.g. SaaS provenance from accounting import). */
  business_context?: Record<string, unknown>
  /** Aligns with Titan / manual Zustand store when synced from session or import. */
  business_model?: string
  /** Belgian official filing trust (merged from Zustand on submit for ManualLayout → store bridge). */
  official_financials?: OfficialFinancialsPayload
  official_variance_analysis?: OfficialVarianceAnalysis
  official_verification_badge?: OfficialVerificationBadge
}

/** Smart DCF defaults from historical rows + sector text (used inside setForm(prev) callbacks). */
function dcfSmartDefaultsFromFormSlice(
  prev: Pick<ValuationFormData, 'yearlyFinancials' | 'industry' | 'businessType'>
) {
  return deriveDcfSmartDefaults({
    yearlyFinancials: prev.yearlyFinancials,
    businessCategory: prev.industry || prev.businessType,
  })
}

interface ImportedLedgerAnalysisSummary {
  latest_fiscal_year?: number
  sde_flags?: Array<{
    ledger_code: string
    ledger_name: string
    amount: number
    deviation_pct: number
    benchmark_median_pct: number
    benchmark_std_pct: number
    actual_pct_of_revenue: number
    z_score: number
    confidence: number
    year: number
    potential_sde_addback: boolean
    suggested_question: string
    rationale: string
    category: string
  }>
  ev_equity_bridge?: {
    enterprise_value: number
    cash_and_equivalents: number
    long_term_debt: number
    short_term_financial_debt: number
    interest_bearing_debt: number
    net_debt: number
    equity_value: number
  }
  dcf_defaults?: {
    average_depreciation: number
    suggested_capex: number
  }
}

// Field help context for AI assistant integration
export interface FieldHelpContext {
  field: string
  label: string
  value?: number | string
  grootboekCode?: string
  category?: string
  hint?: string
  normalizationType?: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'other'
}

interface ManualInputPanelProps {
  onSubmit: (data: ValuationFormData) => void
  onCSVImportComplete?: (
    source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable',
    fileName?: string
  ) => void
  isCalculating?: boolean
  initialData?: Partial<ValuationFormData>
  onFieldHelpRequest?: (context: FieldHelpContext) => void
  onViewAllNormalizations?: () => void
  /** Called when form data changes (debounced 300ms). Enables AI assistant to access financials before submit. */
  onFormDataChange?: (data: Record<string, unknown>) => void
  /** Optional ref to sync form financials synchronously during render. Used by sibling modals that need latest data without effect delay. */
  formDataRef?: React.MutableRefObject<Record<string, unknown> | null>
  /** STP: When true, KBO fields are pre-filled from backend enrichment and shown as read-only */
  readOnlyKbo?: boolean
  /** STP: When true, auto-advance past steps that are fully pre-filled */
  autoAdvancePastPrefilledSteps?: boolean
  /** When true, lead the user into import/connect before manual entry. */
  preferIntegrationEntry?: boolean
  /** Whether integrations are enabled on the user's plan (Pro+). Drives the Pro upsell CTA. */
  integrationsEnabled?: boolean
  /** Current plan type (free/starter/pro/…). Drives the Pro upsell CTA. */
  planType?: string
  /** Synthesis: current weight per method key. */
  synthesisWeights?: Record<string, number>
  /** Synthesis: advisor justification text. */
  synthesisJustification?: string
  /** Synthesis: callback when weights change. */
  onSynthesisWeightsChange?: (weights: Record<string, number>) => void
  /** Synthesis: callback when justification changes. */
  onSynthesisJustificationChange?: (justification: string) => void
  /** Synthesis: whether the feature is unlocked (Starter+). */
  synthesisUnlocked?: boolean
  /** Synthesis: valuation results keyed by method. */
  synthesisValuationResults?: Record<
    string,
    import('../../types/valuation').ValuationMethodResult
  > | null
  /** Synthesis: open Starter paywall when locked. */
  onSynthesisPaywall?: () => void
}

// Options
const businessStructures = [
  { value: 'bv', label: 'BV' },
  { value: 'nv', label: 'NV' },
  { value: 'eenmanszaak', label: 'Eenmanszaak' },
  { value: 'vof', label: 'VOF' },
  { value: 'cvba', label: 'CVBA' },
  { value: 'vzw', label: 'VZW' },
]

// Inline FieldHelpTrigger component for contextual AI assistance
function FieldHelpTrigger({
  context,
  onTrigger,
  className,
}: {
  context: FieldHelpContext
  onTrigger?: (context: FieldHelpContext) => void
  className?: string
}) {
  const mi = useTranslations('manualInput')
  if (!onTrigger) return null

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onTrigger(context)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              'inline-flex items-center justify-center rounded-md transition-all',
              'text-foreground/30 hover:text-primary hover:bg-primary/10',
              'focus:outline-none focus:ring-2 focus:ring-primary/20',
              'w-5 h-5',
              className
            )}
            aria-label={mi('askAi', { label: context.label })}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs">
          <p>{mi('askAiAbout', { label: context.label.toLowerCase() })}</p>
          {context.grootboekCode && (
            <p className="text-foreground/50 mt-0.5 font-mono text-[10px]">
              {mi('ledger')}: {context.grootboekCode}
            </p>
          )}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

const generateDefaultYearlyFinancials = (
  baseFilingYear: number = getCurrentFilingYear()
): YearlyFinancials[] =>
  getHistoricalYearRange(baseFilingYear, 3).map((year) => ({
    year: String(year),
    revenue: 0,
    ebitda: 0,
  }))

const hasMeaningfulYearlyFinancials = (yearlyFinancials?: YearlyFinancials[]): boolean =>
  Array.isArray(yearlyFinancials) &&
  yearlyFinancials.some(
    (year) =>
      !!year.isForecast || (Number(year.revenue) || 0) > 0 || hasExplicitFinancialValue(year.ebitda)
  )

export const getSeedBaseFilingYear = (
  initialData: Partial<ValuationFormData>,
  now: Date = new Date()
): number => {
  const filingYear = getCurrentFilingYear(now)
  const maxSelectableYear = Math.min(Math.max(now.getFullYear() - 1, 2000), 2100)
  const explicitYear = Number(initialData.current_year_data?.year)
  if (!Number.isFinite(explicitYear) || explicitYear < 2000) {
    return filingYear
  }

  const maxSeedYear = initialData.filingYearConfirmed === true ? maxSelectableYear : filingYear
  return Math.min(explicitYear, maxSeedYear)
}

export const getSeedYearlyFinancials = (
  initialData: Partial<ValuationFormData>
): YearlyFinancials[] => {
  const initialYearlyFinancials = initialData.yearlyFinancials
  if (
    Array.isArray(initialYearlyFinancials) &&
    initialYearlyFinancials.length > 0 &&
    (initialYearlyFinancials.length > 1 || hasMeaningfulYearlyFinancials(initialYearlyFinancials))
  ) {
    return initialYearlyFinancials
  }
  return generateDefaultYearlyFinancials(getSeedBaseFilingYear(initialData))
}

const getSeedCurrentYearData = (
  initialData: Partial<ValuationFormData>
): YearDataInput | undefined => {
  if (!initialData.current_year_data) {
    return undefined
  }

  return {
    ...initialData.current_year_data,
    year: getSeedBaseFilingYear(initialData),
  }
}

export const shouldAutoConfirmPrefilledFilingYear = (
  initialData: Partial<ValuationFormData>,
  currentFilingYear: number
): boolean => {
  const explicitInitialYear = Number(initialData.current_year_data?.year)

  return (
    hasMeaningfulYearlyFinancials(initialData.yearlyFinancials) ||
    initialData.filingYearConfirmed === true ||
    (Number.isFinite(explicitInitialYear) &&
      explicitInitialYear >= 2000 &&
      explicitInitialYear <= currentFilingYear)
  )
}

const getLatestHistoricalYearlyFinancial = (
  yearlyFinancials: YearlyFinancials[]
): YearlyFinancials | undefined =>
  [...yearlyFinancials]
    .filter((year) => !year.isForecast)
    .sort((a, b) => Number(b.year) - Number(a.year))[0]

export function ManualInputPanel({
  onSubmit,
  onCSVImportComplete,
  isCalculating = false,
  initialData = {},
  onFieldHelpRequest,
  onViewAllNormalizations,
  onFormDataChange,
  formDataRef,
  readOnlyKbo = false,
  autoAdvancePastPrefilledSteps = false,
  preferIntegrationEntry = false,
  integrationsEnabled = true,
  planType = 'free',
  synthesisWeights = {},
  synthesisJustification = '',
  onSynthesisWeightsChange,
  onSynthesisJustificationChange,
  synthesisUnlocked = false,
  synthesisValuationResults,
  onSynthesisPaywall,
}: ManualInputPanelProps) {
  const { user } = useAuth()
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const tTax = useTranslations('taxLatency')
  const tKbo = useTranslations('forms.kboLookup')
  const locale = useLocale()
  const { currency: panelCurrencyFormatter } = useManualPreviewFormatters()
  const taxLatencyCount = useTaxLatencyStore((s) => s.items.length)
  const normalizationItems = useNormalizationStore((s) => s.items)
  const spotlightImportQuality = useSpotlightStore((s) => s.importQuality)
  const hasExplicitNumericValue = useCallback(
    (value: unknown) => hasExplicitFinancialValue(value),
    []
  )
  const acceptedNormCount = normalizationItems.filter((n) => n.status === 'accepted').length

  const formatCurrency = useCallback(
    (amount: number) => panelCurrencyFormatter.format(Number.isFinite(amount) ? amount : 0),
    [panelCurrencyFormatter]
  )
  const [formData, setFormData] = useState<ValuationFormData>({
    companyName: initialData.companyName || '',
    kboNumber: initialData.kboNumber || '',
    legalForm: initialData.legalForm || '',
    address: initialData.address || '',
    naceCode: initialData.naceCode || '',
    canonicalNaceCode: initialData.canonicalNaceCode?.trim() || initialData.naceCode?.trim() || '',
    naceDescription: initialData.naceDescription || '',
    businessType: initialData.businessType || '',
    businessTypeCode: initialData.businessTypeCode || '',
    industry: initialData.industry || '',
    country: initialData.country || '',
    yearFounded: initialData.yearFounded || '',
    businessStructure: initialData.businessStructure || '',
    ownerManagers: initialData.ownerManagers || 1,
    fteEmployees: initialData.fteEmployees ?? 5,
    yearlyFinancials: getSeedYearlyFinancials(initialData),
    current_year_data: getSeedCurrentYearData(initialData),
    historical_years_data: normalizeHistoricalYearsForFiling(
      initialData.historical_years_data,
      Boolean(initialData.filingYearConfirmed)
    ),
    forecast_years_data: initialData.forecast_years_data,
    filingYearConfirmed: initialData.filingYearConfirmed ?? false,
    dcf_input_mode: initialData.dcf_input_mode ?? 'ebitda',
  })
  const [importBatchData, setImportBatchData] = useState<AccountingBatchPayload | null>(null)
  const [importBatchProvider, setImportBatchProvider] = useState<Extract<
    AccountingImportProvider,
    'silverfin' | 'bizzcontrol' | 'octopus'
  > | null>(null)
  const [showBizzcontrolImportModal, setShowBizzcontrolImportModal] = useState(false)
  const [bizzcontrolCompanies, setBizzcontrolCompanies] = useState<AccountingAdministration[]>([])
  const [loadingBizzcontrolCompanies, setLoadingBizzcontrolCompanies] = useState(false)
  const [bizzcontrolImportError, setBizzcontrolImportError] = useState<string | null>(null)
  const [selectedBizzcontrolCompanyId, setSelectedBizzcontrolCompanyId] = useState('')
  const [bizzcontrolHistoryRange, setBizzcontrolHistoryRange] = useState<'3' | '5'>('3')
  const [bizzcontrolManualOverride, setBizzcontrolManualOverride] = useState(true)
  const [importingBizzcontrolBatch, setImportingBizzcontrolBatch] = useState(false)
  const [showOctopusImportModal, setShowOctopusImportModal] = useState(false)
  const [octopusCompanies, setOctopusCompanies] = useState<AccountingAdministration[]>([])
  const [loadingOctopusCompanies, setLoadingOctopusCompanies] = useState(false)
  const [octopusImportError, setOctopusImportError] = useState<string | null>(null)
  const [selectedOctopusCompanyId, setSelectedOctopusCompanyId] = useState('')
  const [octopusHistoryRange, setOctopusHistoryRange] = useState<'3' | '5'>('3')
  const [octopusManualOverride, setOctopusManualOverride] = useState(true)
  const [importingOctopusBatch, setImportingOctopusBatch] = useState(false)
  const [_accountingStatuses, setAccountingStatuses] = useState<IntegrationStatus[]>([])
  const currentFilingYear = getCurrentFilingYear()
  const activityCodeTerm = getFinancialTerm(
    'activityCode',
    formData.country,
    locale === 'en' ? 'en' : 'nl'
  )
  const activityCodeShort = activityCodeTerm.replace(/-code$/i, '').trim()
  const localizeActivityCodeCopy = useCallback(
    (copy: string) =>
      copy
        .replace(/NACE-code/g, activityCodeTerm)
        .replace(/NACE code/g, activityCodeTerm)
        .replace(/NACE/g, activityCodeShort)
        .replace(/KBO-nummer/g, getFinancialTerm('registrationNumber', formData.country))
        .replace(/KBO number/g, getFinancialTerm('registrationNumber', formData.country, 'en')),
    [activityCodeShort, activityCodeTerm, formData.country]
  )

  const latestCompleteYearlyFinancial = useMemo(
    () => getLatestCompleteYearlyFinancial(formData.yearlyFinancials ?? []),
    [formData.yearlyFinancials]
  )

  // Sync form financials to ref during render for sibling components (e.g. normalization modal)
  // that need latest data without effect delay — eliminates race when opening modal immediately
  if (formDataRef && formDataRef.current != null) {
    const current = latestCompleteYearlyFinancial
    const latestHistorical = getLatestHistoricalYearlyFinancial(formData.yearlyFinancials)
    Object.assign(formDataRef.current, {
      yearlyFinancials: formData.yearlyFinancials,
      current_year_data: latestHistorical
        ? buildCurrentYearData({
            year: parseInt(latestHistorical.year, 10),
            revenue: latestHistorical.revenue,
            ebitda: latestHistorical.ebitda,
            currentYearData: formData.current_year_data,
          })
        : formData.current_year_data,
      ebitda: current?.ebitda,
    })
  }

  // KBO verification state
  const [selectedCompany, setSelectedCompany] = useState<KBOCompany | null>(null)
  const [companySearchValue, setCompanySearchValue] = useState(formData.companyName || '')
  const updateFormData = useManualFormStore((s) => s.updateFormData)
  const storeBusinessTypeId = useManualFormStore((s) => s.formData.business_type_id)
  const storeBusinessModel = useManualFormStore((s) => s.formData.business_model)
  const storeBusinessContext = useManualFormStore((s) => s.formData.business_context)
  const sessionReportId = useSessionStore((s) => s.session?.reportId)
  useSyncOfficialVarianceFromForm()

  // Zustand holds session/restoration/bootstrap prefill; local useState only seeds once — gap-fill method inputs
  // (DCF, NAV, SaaS, multiples prep) into the panel when the store gains values the UI has not mirrored yet.
  // requestAnimationFrame coalesces rapid store updates; getState() inside the frame always reads the latest snapshot.
  useEffect(() => {
    let raf = 0
    const flush = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const fd = useManualFormStore.getState().formData as unknown as Record<string, unknown>
        setFormData((prevLocal) => {
          const patch = mergeOptionalSessionPrefillFields(fd, prevLocal)
          return Object.keys(patch).length > 0 ? { ...prevLocal, ...patch } : prevLocal
        })
      })
    }
    flush()
    const unsub = useManualFormStore.subscribe(flush)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [])

  const prefillAbortRef = useRef<boolean>(false)
  /** After user picks a country, do not overwrite from late prefill/session (panel remount resets). */
  const countryUserOverrideRef = useRef(false)

  /**
   * Tracks the company identity that was loaded from session/platform prefill.
   * Set once when prefill populates the company — never overwritten by user actions.
   * Used to decide whether clearing the company requires a confirmation warning.
   */
  const prefillCompanyRef = useRef<{ name: string; kbo: string } | null>(null)
  const [showChangeCompanyWarning, setShowChangeCompanyWarning] = useState(false)

  // Dismiss the change-company warning whenever the selected company is cleared by any code path
  // (country change, external clear, etc.) — single reactive rule instead of scattered dismissals.
  useEffect(() => {
    if (!selectedCompany && showChangeCompanyWarning) {
      setShowChangeCompanyWarning(false)
    }
  }, [selectedCompany, showChangeCompanyWarning])

  // Drop registry selection when operating country changes (e.g. firm NL prefill after BE default)
  useEffect(() => {
    const c = (formData.country || initialData.country || 'BE').toUpperCase()
    setSelectedCompany((prev) => {
      if (!prev) return prev
      const pc = prev.countryCode?.toUpperCase()
      if (pc && pc !== c) return null
      return prev
    })
  }, [formData.country, initialData.country])

  // Sync prefill from bootstrap/session when initialData arrives after mount
  // Dependencies on key fields ensure we re-run when prefill arrives late (e.g. async store hydration)
  useEffect(() => {
    if (shouldAutoConfirmPrefilledFilingYear(initialData, currentFilingYear)) {
      setFormData((prev) =>
        prev.filingYearConfirmed ? prev : { ...prev, filingYearConfirmed: true }
      )
    }
  }, [
    currentFilingYear,
    initialData.current_year_data?.year,
    initialData.filingYearConfirmed,
    initialData.yearlyFinancials,
  ])

  useEffect(() => {
    const prefill = initialData
    if (!prefill || typeof prefill !== 'object') return

    // After restoration, session JSONB is authoritative — skip deferred initialData merge (reduces races and duplicate NACE work)
    if (shouldSuppressMercurySessionPrefill(sessionReportId)) {
      prefillAbortRef.current = false
      return () => {
        prefillAbortRef.current = true
      }
    }

    prefillAbortRef.current = false
    const isCurrent = () => !prefillAbortRef.current

    // Apply only when field is empty - never overwrite user-entered data
    const applyPrefill = (
      prev: ValuationFormData,
      updates: Record<string, unknown>,
      key: keyof ValuationFormData,
      value: string | number | undefined
    ) => {
      if (key === 'country') {
        if (countryUserOverrideRef.current) return
        if (value === undefined || value === null) return
        const v = String(value).trim().toUpperCase()
        if (!v) return
        const cur = String(prev.country || '')
          .trim()
          .toUpperCase()
        // Empty country is a placeholder until bootstrap/business-card context resolves.
        if ((!cur || cur === 'BE') && v !== cur) {
          ;(updates as Record<string, unknown>)[key] = v
        }
        return
      }
      if (value === undefined || value === null) return
      if (typeof value === 'string' && value === '') return
      const current = prev[key]
      const isEmpty =
        current === undefined ||
        current === null ||
        (typeof current === 'string' && current === '') ||
        (typeof current === 'number' && key === 'ownerManagers' && current === 1) ||
        // fteEmployees: apply when empty, or when default 5 and prefill has different value (e.g. 0 from restore)
        (key === 'fteEmployees' &&
          (current === undefined || (typeof current === 'number' && current === 5 && value !== 5)))
      if (isEmpty) (updates as Record<string, unknown>)[key] = value
    }

    const businessStructure = mapLegalFormToBusinessStructure(prefill.legalForm)

    const runPrefill = async () => {
      let businessTypeToApply = prefill.businessType
      let industryToApply = prefill.industry
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
          businessTypeToApply.trim(),
          undefined,
          prefill.country,
        )
        if (!isCurrent()) return
        if (resolved?.id) {
          businessTypeToApply = resolved.id
          industryToApply = resolved.category || prefill.industry
          updateFormData({ business_type_id: resolved.id, industry: industryToApply })
        } else {
          businessTypeToApply = ''
        }
      }
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        businessTypeToApply = ''
      }

      if (!isCurrent()) return
      let companyNameUpdate: string | undefined
      setFormData((prev) => {
        const updates: Record<string, unknown> = {}
        applyPrefill(prev, updates, 'companyName', prefill.companyName)
        applyPrefill(prev, updates, 'kboNumber', prefill.kboNumber)
        applyPrefill(prev, updates, 'legalForm', prefill.legalForm)
        applyPrefill(
          prev,
          updates,
          'businessStructure',
          prefill.businessStructure || businessStructure
        )
        applyPrefill(prev, updates, 'address', prefill.address)
        applyPrefill(prev, updates, 'naceCode', prefill.naceCode)
        applyPrefill(prev, updates, 'canonicalNaceCode', prefill.canonicalNaceCode)
        applyPrefill(prev, updates, 'naceDescription', prefill.naceDescription)
        applyPrefill(prev, updates, 'businessType', businessTypeToApply || undefined)
        applyPrefill(prev, updates, 'businessTypeCode', prefill.businessTypeCode)
        applyPrefill(prev, updates, 'industry', industryToApply)
        applyPrefill(prev, updates, 'country', prefill.country)
        applyPrefill(prev, updates, 'yearFounded', prefill.yearFounded)
        applyPrefill(prev, updates, 'ownerManagers', prefill.ownerManagers)
        applyPrefill(prev, updates, 'fteEmployees', prefill.fteEmployees)
        if (
          prefill.yearlyFinancials?.length &&
          prefill.yearlyFinancials.some((yf: YearlyFinancials) => yf.revenue > 0 || yf.ebitda !== 0)
        ) {
          const currentIsDefault = prev.yearlyFinancials.every(
            (yf) => yf.revenue === 0 && yf.ebitda === 0
          )
          if (currentIsDefault) {
            ;(updates as Record<string, unknown>).yearlyFinancials = prefill.yearlyFinancials
          }
        }
        if (updates.companyName) companyNameUpdate = String(updates.companyName)
        if (Object.keys(updates).length === 0) return prev
        return { ...prev, ...updates }
      })
      if (companyNameUpdate) setCompanySearchValue(companyNameUpdate)
      const hasExpandData =
        prefill.kboNumber || prefill.legalForm || businessTypeToApply || prefill.industry
      if (companyNameUpdate && hasExpandData) {
        setSelectedCompany({
          id: prefill.kboNumber || 'prefill',
          name: companyNameUpdate,
          kboNumber: prefill.kboNumber || '',
          legalForm: prefill.legalForm || '',
          address: prefill.address || '',
          postalCode: '',
          city: '',
          naceCode: prefill.canonicalNaceCode || prefill.naceCode,
          naceDescription: prefill.naceDescription,
          canonicalNaceCode: prefill.canonicalNaceCode || prefill.naceCode,
          activityCode:
            prefill.naceCode &&
            prefill.canonicalNaceCode &&
            prefill.naceCode !== prefill.canonicalNaceCode
              ? prefill.naceCode
              : undefined,
        })
        if (!prefillCompanyRef.current) {
          prefillCompanyRef.current = {
            name: companyNameUpdate,
            kbo: prefill.kboNumber || '',
          }
        }
      }
    }
    runPrefill()
    return () => {
      prefillAbortRef.current = true
    }
  }, [
    initialData?.companyName,
    initialData?.kboNumber,
    initialData?.legalForm,
    initialData?.businessStructure,
    initialData?.address,
    initialData?.naceCode,
    initialData?.canonicalNaceCode,
    initialData?.naceDescription,
    initialData?.businessType,
    initialData?.industry,
    initialData?.country,
    initialData?.yearFounded,
    initialData?.ownerManagers,
    initialData?.fteEmployees,
    initialData?.yearlyFinancials,
    updateFormData,
    sessionReportId,
  ])

  // STP: Auto-advance past pre-filled steps by scrolling to the financials section
  const financialsStepRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!autoAdvancePastPrefilledSteps) return
    const hasPrefilledCompany = !!formData.companyName && !!formData.businessType

    const timer = setTimeout(() => {
      if (hasPrefilledCompany && financialsStepRef.current) {
        financialsStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [autoAdvancePastPrefilledSteps, formData.companyName, formData.businessType])

  // Sync form data to parent for AI context and normalization modal originalEBITDA
  // Immediate sync on mount/deps change (avoids 300ms race when opening modal quickly)
  // Debounced 300ms prevents spamming on rapid edits
  const onFormDataChangeRef = useRef(onFormDataChange)
  onFormDataChangeRef.current = onFormDataChange
  const syncFormData = useCallback(() => {
    if (!onFormDataChangeRef.current) return
    const current = latestCompleteYearlyFinancial
    // Registry + NACE/SBI: must flow to ManualLayout → Zustand on every change so session
    // autosave and refresh never race ahead with stale kbo/nace (canonical vs display).
    onFormDataChangeRef.current({
      companyName: formData.companyName,
      kboNumber: formData.kboNumber,
      legalForm: formData.legalForm,
      address: formData.address,
      naceCode: formData.naceCode,
      canonicalNaceCode: formData.canonicalNaceCode,
      naceDescription: formData.naceDescription,
      industry: formData.industry,
      country: formData.country,
      businessModel: formData.business_model ?? storeBusinessModel,
      yearFounded: formData.yearFounded,
      ownerManagers: formData.ownerManagers,
      fteEmployees: formData.fteEmployees,
      businessType: formData.businessType,
      revenue: current?.revenue,
      ebitda: current?.ebitda,
      yearlyFinancials: formData.yearlyFinancials,
      historical_years_data: formData.historical_years_data,
      forecast_years_data: formData.forecast_years_data,
      dcf_input_mode: formData.dcf_input_mode,
      current_year_data: current
        ? buildCurrentYearData({
            year: parseInt(current.year, 10),
            revenue: current.revenue,
            ebitda: current.ebitda,
            currentYearData: formData.current_year_data,
          })
        : formData.current_year_data,
      nav_real_estate_adjustment: formData.nav_real_estate_adjustment,
      nav_inventory_adjustment: formData.nav_inventory_adjustment,
      nav_hidden_reserves: formData.nav_hidden_reserves,
      nav_goodwill_writeoff: formData.nav_goodwill_writeoff,
      nav_receivables_adjustment: formData.nav_receivables_adjustment,
      nav_other_revaluations: formData.nav_other_revaluations,
      nav_tax_latency_pct: formData.nav_tax_latency_pct,
      nav_off_balance_items: formData.nav_off_balance_items,
      dcf_revenue_growth_pct: formData.dcf_revenue_growth_pct,
      dcf_ebitda_margin_pct: formData.dcf_ebitda_margin_pct,
      dcf_capex_pct: formData.dcf_capex_pct,
      dcf_da_pct: formData.dcf_da_pct,
      dcf_nwc_pct: formData.dcf_nwc_pct,
      dcf_tax_rate_pct: formData.dcf_tax_rate_pct,
      dcf_wacc_pct: formData.dcf_wacc_pct,
      dcf_terminal_growth_pct: formData.dcf_terminal_growth_pct,
      dcf_exit_multiple: formData.dcf_exit_multiple,
      dcf_risk_free_rate_pct: formData.dcf_risk_free_rate_pct,
      dcf_equity_risk_premium_pct: formData.dcf_equity_risk_premium_pct,
      dcf_beta: formData.dcf_beta,
      dcf_cost_of_debt_pct: formData.dcf_cost_of_debt_pct,
      dcf_debt_equity_pct: formData.dcf_debt_equity_pct,
      dcf_tax_shield_pct: formData.dcf_tax_shield_pct,
      dcf_terminal_value_method: formData.dcf_terminal_value_method,
      saas_arr: formData.saas_arr,
      saas_mrr: formData.saas_mrr,
      saas_arr_growth_pct: formData.saas_arr_growth_pct,
      saas_churn_pct: formData.saas_churn_pct,
      saas_customer_churn_pct: formData.saas_customer_churn_pct,
      saas_nrr_pct: formData.saas_nrr_pct,
      saas_gross_margin_pct: formData.saas_gross_margin_pct,
      saas_cac: formData.saas_cac,
      saas_customer_concentration_pct: formData.saas_customer_concentration_pct,
      saas_expansion_revenue_pct: formData.saas_expansion_revenue_pct,
      saas_sm_spend: formData.saas_sm_spend,
      exclude_real_estate: formData.exclude_real_estate,
      real_estate_book_value: formData.real_estate_book_value,
      estimated_market_rent: formData.estimated_market_rent,
      rev_recurring_pct: formData.rev_recurring_pct,
      rev_recurring_amount: formData.rev_recurring_amount,
      rev_top_client_concentration_pct: formData.rev_top_client_concentration_pct,
      rev_top_client_amount: formData.rev_top_client_amount,
      rev_contract_backlog: formData.rev_contract_backlog,
      rev_gross_churn_pct: formData.rev_gross_churn_pct,
      owner_salary_addback: formData.owner_salary_addback,
    })
  }, [
    formData.companyName,
    formData.kboNumber,
    formData.legalForm,
    formData.address,
    formData.naceCode,
    formData.canonicalNaceCode,
    formData.naceDescription,
    formData.industry,
    formData.country,
    formData.business_model,
    storeBusinessModel,
    formData.yearFounded,
    formData.ownerManagers,
    formData.fteEmployees,
    formData.businessType,
    formData.yearlyFinancials,
    formData.historical_years_data,
    formData.forecast_years_data,
    formData.dcf_input_mode,
    formData.current_year_data,
    latestCompleteYearlyFinancial,
    formData.nav_real_estate_adjustment,
    formData.nav_inventory_adjustment,
    formData.nav_hidden_reserves,
    formData.nav_goodwill_writeoff,
    formData.nav_receivables_adjustment,
    formData.nav_other_revaluations,
    formData.nav_tax_latency_pct,
    formData.nav_off_balance_items,
    formData.dcf_revenue_growth_pct,
    formData.dcf_ebitda_margin_pct,
    formData.dcf_capex_pct,
    formData.dcf_da_pct,
    formData.dcf_nwc_pct,
    formData.dcf_tax_rate_pct,
    formData.dcf_wacc_pct,
    formData.dcf_terminal_growth_pct,
    formData.dcf_exit_multiple,
    formData.dcf_risk_free_rate_pct,
    formData.dcf_equity_risk_premium_pct,
    formData.dcf_beta,
    formData.dcf_cost_of_debt_pct,
    formData.dcf_debt_equity_pct,
    formData.dcf_tax_shield_pct,
    formData.dcf_terminal_value_method,
    formData.saas_arr,
    formData.saas_mrr,
    formData.saas_arr_growth_pct,
    formData.saas_churn_pct,
    formData.saas_customer_churn_pct,
    formData.saas_nrr_pct,
    formData.saas_gross_margin_pct,
    formData.saas_cac,
    formData.saas_customer_concentration_pct,
    formData.saas_expansion_revenue_pct,
    formData.saas_sm_spend,
    formData.exclude_real_estate,
    formData.real_estate_book_value,
    formData.estimated_market_rent,
    formData.rev_recurring_pct,
    formData.rev_recurring_amount,
    formData.rev_top_client_concentration_pct,
    formData.rev_top_client_amount,
    formData.rev_contract_backlog,
    formData.rev_gross_churn_pct,
    formData.owner_salary_addback,
  ])
  useEffect(() => {
    syncFormData()
    const t = setTimeout(syncFormData, 300)
    return () => clearTimeout(t)
  }, [syncFormData])

  // Ensure companySearchValue is synced when initialData.companyName arrives late (e.g. after async store hydration)
  // Only updates when companySearchValue is empty to avoid overwriting user input
  useEffect(() => {
    const name = initialData?.companyName?.trim()
    if (name) {
      setCompanySearchValue((prev) => (prev?.trim() ? prev : name))
    }
  }, [initialData?.companyName])

  // Fallback: set selectedCompany when we have companyName + KBO data but selectedCompany is still null
  // Handles case where first prefill effect's companyNameUpdate was not set (e.g. formData already had companyName)
  useEffect(() => {
    const name = initialData?.companyName?.trim()
    const hasExpandData =
      initialData?.kboNumber ||
      initialData?.legalForm ||
      initialData?.businessType ||
      initialData?.industry
    if (!name || !hasExpandData) return

    setSelectedCompany((prev) => {
      if (prev) return prev
      if (!prefillCompanyRef.current) {
        prefillCompanyRef.current = { name, kbo: initialData?.kboNumber || '' }
      }
      return {
        id: initialData?.kboNumber || 'prefill',
        name,
        kboNumber: initialData?.kboNumber || '',
        legalForm: initialData?.legalForm || '',
        address: initialData?.address || '',
        postalCode: '',
        city: '',
        naceCode: initialData?.naceCode,
        naceDescription: initialData?.naceDescription,
      }
    })
  }, [
    initialData?.companyName,
    initialData?.kboNumber,
    initialData?.legalForm,
    initialData?.businessType,
    initialData?.industry,
  ])

  // Business type state
  const [selectedBusinessType, setSelectedBusinessType] = useState<BusinessType | null>(null)

  // Section collapse states
  const [showCSVUpload, setShowCSVUpload] = useState(false)
  const [showForecastRemovalConfirm, setShowForecastRemovalConfirm] = useState(false)
  const [historicalYearPendingRemove, setHistoricalYearPendingRemove] = useState<string | null>(
    null
  )

  const commitRemoveHistoricalYear = useCallback((yearStr: string) => {
    const y = Number.parseInt(yearStr, 10)
    let didRemove = false
    setFormData((prev) => {
      if (!canRemoveHistoricalYear(prev.yearlyFinancials)) {
        return prev
      }
      didRemove = true
      return {
        ...prev,
        yearlyFinancials: removeHistoricalYear(prev.yearlyFinancials, yearStr),
      }
    })
    if (didRemove && Number.isFinite(y)) {
      const { items, setItems } = useNormalizationStore.getState()
      setItems(removeNormalizationsForRemovedFiscalYear(items, y))
    }
    setHistoricalYearPendingRemove(null)
  }, [])

  const requestRemoveHistoricalYear = useCallback(
    (yearStr: string) => {
      if (!canRemoveHistoricalYear(formData.yearlyFinancials)) return
      const row = formData.yearlyFinancials.find(
        (yf) => String(yf.year) === yearStr && !yf.isForecast
      )
      if (!row) return
      const yNum = Number.parseInt(yearStr, 10)
      const normBoundCount = Number.isFinite(yNum)
        ? countNormalizationsBoundToFiscalYear(normalizationItems, yNum)
        : 0
      if (historicalYearRowNeedsRemovalWarning(row, normBoundCount)) {
        setHistoricalYearPendingRemove(yearStr)
        return
      }
      commitRemoveHistoricalYear(yearStr)
    },
    [formData.yearlyFinancials, normalizationItems, commitRemoveHistoricalYear]
  )

  // Calculate normalized EBITDA per year and average using global normalization store
  const normalizedData = useMemo(() => {
    const acceptedItems = normalizationItems.filter((n) => n.status === 'accepted')
    const annualFictiveRentDeduction = getAnnualFictiveRentDeductionForDisplay(
      formData.exclude_real_estate,
      formData.estimated_market_rent
    )

    const years = formData.yearlyFinancials.map((yf) => {
      const yearNum = Number(yf.year)
      const yearNorms = acceptedItems.filter((n) => {
        if (n.applyAllYears) return true
        if (n.applyYears && n.applyYears.length > 0) return n.applyYears.includes(yearNum)
        return n.year === yearNum
      })
      const rawEbitda = Number(yf.ebitda)
      const yearEbitda = Number.isFinite(rawEbitda) ? rawEbitda : 0
      const totalAdjustment = yearNorms.reduce((sum, n) => {
        const rawVal = Number(n.value)
        const val = Number.isFinite(rawVal) ? rawVal : 0
        const rawAdj = Number(n.adjustment)
        const adj = Number.isFinite(rawAdj) ? rawAdj : 0
        if (
          yearEbitda === 0 &&
          (n.type === 'add_percent' || n.type === 'subtract_percent' || n.type === 'absolute')
        ) {
          return sum + adj
        }
        if (n.type === 'add_percent') return sum + (yearEbitda * val) / 100
        if (n.type === 'subtract_percent') return sum - (yearEbitda * val) / 100
        if (n.type === 'absolute') return sum + (val - yearEbitda)
        return sum + adj
      }, 0)
      const safeTotalAdj = Number.isFinite(totalAdjustment) ? totalAdjustment : 0
      const normalizedEbitda = yearEbitda + safeTotalAdj - annualFictiveRentDeduction
      return {
        ...yf,
        normalizedEbitda,
        totalAdjustment: safeTotalAdj,
        normalizationCount: yearNorms.length,
        fictiveRentDeduction: annualFictiveRentDeduction,
      }
    })

    // Weighted average: most recent years weighted higher (McKinsey method).
    // Include break-even and loss-making years, but ignore incomplete empty rows.
    // Forecast years are excluded — this metric represents historical performance only.
    const validYears = years
      .filter(
        (y) => !y.isForecast && y.year != null && Number(y.year) >= 2000 && Number(y.year) <= 2100
      )
      .sort((a, b) => Number(a.year) - Number(b.year))
    const yearsWithEbitda = validYears.filter(
      (y) => (Number(y.revenue) || 0) > 0 && hasExplicitNumericValue(y.ebitda)
    )
    let weightedSum = 0
    let totalWeight = 0
    yearsWithEbitda.forEach((y, index) => {
      const weight = index + 1 // Ascending: oldest=1, most recent=highest
      const norm = Number.isFinite(y.normalizedEbitda) ? y.normalizedEbitda : 0
      weightedSum += norm * weight
      totalWeight += weight
    })

    const averageNormalizedEbitda = totalWeight > 0 ? weightedSum / totalWeight : 0

    return {
      years,
      averageNormalizedEbitda,
      totalYearsWithData: yearsWithEbitda.length,
      annualFictiveRentDeduction,
    }
  }, [
    formData.yearlyFinancials,
    formData.exclude_real_estate,
    formData.estimated_market_rent,
    hasExplicitNumericValue,
    normalizationItems,
  ])

  const searchCountry = formData.country || initialData.country || 'BE'

  // Registry search: routes to KBO (BE) or KVK (NL) based on form country
  const kboSearchFn = useCallback(
    async (query: string, signal?: AbortSignal): Promise<KBOCompany[]> => {
      if (!query || query.trim().length < 2) return []
      const response = await registryService.searchCompanies(
        query.trim(),
        searchCountry,
        15,
        signal
      )
      if (!response.success) {
        throw new Error(response.error || tKbo('searchUnavailable'))
      }
      if (!response.results) return []
      return response.results.map((r: CompanySearchResult, index: number) => {
        const raw = r as unknown as Record<string, unknown>
        const legalFormResolved =
          pickLegalFormFromRegistryHit(raw) ||
          (typeof r.legal_form === 'string' ? r.legal_form : '')
        const canonical = (r.canonical_nace_code || r.nace_code)?.trim() || ''
        const activity = (r.activity_code || '').trim()
        const displayActivity =
          activity && canonical && activity !== canonical ? activity : undefined
        return {
          id:
            r.company_id ||
            (r.kbo_number || r.registration_number || `kbo-${index}`).replace(/[.\s]/g, ''),
          name: r.company_name,
          kboNumber: r.kbo_number || r.registration_number,
          legalForm: legalFormResolved,
          address: [r.address, r.postal_code, r.city].filter(Boolean).join(', '),
          postalCode: r.postal_code || '',
          city: r.city || '',
          naceCode: canonical,
          naceDescription: (r.activity_label || r.nace_description || '').trim() || '',
          canonicalNaceCode: canonical || undefined,
          activityCode: displayActivity,
          activityLabel: (r.activity_label || r.nace_description || '').trim() || undefined,
          activityTaxonomy: r.taxonomy,
          countryCode: r.country_code || searchCountry,
        }
      })
    },
    [tKbo, searchCountry]
  )

  // Business types from Titan API (instead of hardcoded)
  const {
    businessTypes,
    loading: businessTypesLoading,
    error: businessTypesError,
    refetch: refetchBusinessTypes,
  } = useBusinessTypes()
  const businessTypesForSearch = useMemo((): BusinessType[] => {
    const apiCategoryToIconKey: Record<string, string> = {
      restaurant: 'food',
      restaurants: 'food',
      horeca: 'hospitality',
      catering: 'food',
      professional: 'consulting',
      professionals: 'consulting',
    }
    return businessTypes.map((bt) => {
      const cat =
        typeof bt.category === 'string'
          ? bt.category
          : ((bt.category as Record<string, unknown>)?.name ??
            (bt.category as Record<string, unknown>)?.title ??
            'other')
      const rawCategory = String(cat).toLowerCase().replace(/\s+/g, '-')
      const iconKey = apiCategoryToIconKey[rawCategory] ?? rawCategory
      const category = categoryIcons[iconKey] ? iconKey : 'other'
      return {
        id: bt.id,
        code: bt.industryMapping || bt.id,
        name: bt.title,
        category,
        icon: categoryIcons[iconKey] ?? categoryIcons['other'] ?? Building2,
        emoji: bt.icon || '🏢',
        popular: bt.popular ?? false,
      }
    })
  }, [businessTypes])

  // Auto-fill business type from NACE when we have naceCode but no businessType (mirror Mercury AddClient)
  const naceAbortRef = useRef<AbortController | null>(null)
  const companySelectAbortRef = useRef<AbortController | null>(null)
  const [nacePrefillError, setNacePrefillError] = useState<string | null>(null)
  const [naceRetryTrigger, setNaceRetryTrigger] = useState(0)

  // Cleanup all NACE-related abort controllers on unmount
  useEffect(() => {
    return () => {
      naceAbortRef.current?.abort()
      companySelectAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const naceCode =
      formData.canonicalNaceCode?.trim() ||
      formData.naceCode?.trim() ||
      selectedCompany?.canonicalNaceCode?.trim() ||
      selectedCompany?.naceCode?.trim()
    if (!naceCode || formData.businessType?.trim()) {
      setNacePrefillError(null)
      return
    }

    // Skip if handleCompanySelect is already doing its own NACE fetch
    if (companySelectAbortRef.current && !companySelectAbortRef.current.signal.aborted) return

    if (naceAbortRef.current) naceAbortRef.current.abort()
    const controller = new AbortController()
    naceAbortRef.current = controller
    setNacePrefillError(null)

    naceBusinessTypeService
      .getBusinessTypeForNaceCode(
        naceCode,
        controller.signal,
        formData.country || formData.country_code,
      )
      .then((type) => {
        if (controller.signal.aborted) return
        if (type) {
          // Only apply if user hasn't manually selected a type while we were fetching
          setSelectedBusinessType((prev) => prev ?? type)
          setFormData((prev) => {
            if (prev.businessType?.trim()) return prev
            return {
              ...prev,
              businessType: type.id,
              businessTypeCode: type.code || prev.businessTypeCode,
              industry: type.category || prev.industry,
            }
          })
          setNacePrefillError(null)
        } else {
          setNacePrefillError(localizeActivityCodeCopy(t('errors.noBusinessTypeForNace')))
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const msg =
            err instanceof Error && err.message === 'BUSINESS_TYPE_FETCH_FAILED'
              ? localizeActivityCodeCopy(t('errors.businessTypeFetchFailed'))
              : err instanceof Error
                ? localizeActivityCodeCopy(err.message)
                : localizeActivityCodeCopy(t('errors.businessTypeFetchFailed'))
          setNacePrefillError(msg)
        }
      })
      .finally(() => {
        if (naceAbortRef.current === controller) naceAbortRef.current = null
      })

    return () => controller.abort()
  }, [
    formData.naceCode,
    formData.canonicalNaceCode,
    formData.country,
    formData.country_code,
    formData.businessType,
    selectedCompany?.naceCode,
    selectedCompany?.canonicalNaceCode,
    naceRetryTrigger,
    localizeActivityCodeCopy,
    t,
  ])

  // Sync selectedBusinessType when formData.businessType is set from prefill/bootstrap (DB or KBO)
  useEffect(() => {
    const btId = formData.businessType?.trim()
    if (!btId || selectedBusinessType?.id === btId) return
    const match = businessTypesForSearch.find((t) => t.id === btId)
    if (match) setSelectedBusinessType(match)
  }, [formData.businessType, businessTypesForSearch, selectedBusinessType?.id])

  const updateField = <K extends keyof ValuationFormData>(
    field: K,
    value: ValuationFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const updateYearlyFinancials = (
    year: string,
    isForecast: boolean,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change' | 'free_cash_flow',
    value: number | undefined
  ) => {
    const yearKey = String(year)
    setFormData((prev) => ({
      ...prev,
      yearlyFinancials: prev.yearlyFinancials.map((yf) =>
        String(yf.year) === yearKey && !!yf.isForecast === isForecast
          ? field === 'free_cash_flow'
            ? { ...yf, free_cash_flow: value }
            : { ...yf, [field]: value ?? 0 }
          : yf
      ),
    }))
  }

  const handleSelectFilingYear = useCallback((selectedYear: number) => {
    setFormData((prev) => ({
      ...prev,
      yearlyFinancials: generateDefaultYearlyFinancials(selectedYear),
      filingYearConfirmed: true,
      current_year_data: buildCurrentYearData({
        year: selectedYear,
        revenue: prev.current_year_data?.revenue ?? 0,
        ebitda: prev.current_year_data?.ebitda ?? 0,
        currentYearData: prev.current_year_data,
      }),
    }))
  }, [])

  // DCF auto-injection: add forecast years when DCF is selected, prompt removal on switch-away.
  // Also handles initial mount (e.g. page reload with DCF pre-selected).
  const effectiveMethod = useManualResultsStore((s) => s.preSelectedMethod ?? s.selectedMethod)
  const effectiveMethods = useManualResultsStore((s) => s.preSelectedMethods)
  /** Combinable methods for synthesis weging — derived from store (nav/Titan). */
  const synthesisMethodsForPanel = useMemo(
    () => getSynthesisMethodKeysForUi(effectiveMethods),
    [effectiveMethods]
  )
  const synthesisPanelAnchorRef = useRef<HTMLDivElement>(null)
  const prevSynthesisMethodCountRef = useRef(0)
  useEffect(() => {
    const n = synthesisMethodsForPanel.length
    const prev = prevSynthesisMethodCountRef.current
    prevSynthesisMethodCountRef.current = n
    if (n >= 2 && prev < 2) {
      // Double rAF: let Framer height animation + layout settle before scrolling into view.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          synthesisPanelAnchorRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          })
        })
      })
    }
  }, [synthesisMethodsForPanel.length])
  const hasDcfSelected = effectiveMethods.includes('dcf')
  const setSelectedMethod = useManualResultsStore((s) => s.setSelectedMethod)
  // Synthesis weighting rendered as the final step in the left panel (props from ManualLayout)
  const prevMethodRef = useRef<string | null>(null)
  const prevHasDcfRef = useRef(false)
  useEffect(() => {
    const prev = prevMethodRef.current
    prevMethodRef.current = effectiveMethod
    const prevHasDcf = prevHasDcfRef.current
    prevHasDcfRef.current = hasDcfSelected
    const isMount = prev === null

    const methodChanged = prev !== effectiveMethod
    const dcfJustEnabled = hasDcfSelected && !prevHasDcf
    if (!isMount && !methodChanged && !dcfJustEnabled) return

    if (effectiveMethod === 'dcf' || hasDcfSelected) {
      setShowForecastRemovalConfirm(false)
      setFormData((current) => {
        const before = current.yearlyFinancials
        let nextFinancials = injectDefaultDcfForecastYears(before)
        if (nextFinancials === current.yearlyFinancials) return current
        const addedCount = dcfInjectionAddedRowCount(before, nextFinancials)
        if (!isMount && addedCount > 0) {
          import('sonner').then(({ toast }) =>
            toast.info(mi('dcfForecastAdded', { count: addedCount }))
          )
        }
        const smart = dcfSmartDefaultsFromFormSlice(current)
        const preview = deriveDcfProjectionPreview({
          yearlyFinancials: nextFinancials,
          smartDefaults: smart,
          revenueGrowthPct: current.dcf_revenue_growth_pct as number | undefined,
          ebitdaMarginPct: current.dcf_ebitda_margin_pct as number | undefined,
          capexPct: current.dcf_capex_pct as number | undefined,
          daPct: current.dcf_da_pct as number | undefined,
          nwcPct: current.dcf_nwc_pct as number | undefined,
          taxRatePct: current.dcf_tax_rate_pct as number | undefined,
          forecastYears: nextFinancials.filter((r) => r.isForecast).map((r) => Number(r.year)),
        })
        if (preview.length > 0) {
          nextFinancials = applyDcfProjectionPreviewToForecastRows(
            nextFinancials,
            preview
          ) as typeof nextFinancials
        }
        return { ...current, yearlyFinancials: nextFinancials as YearlyFinancials[] }
      })
    } else if (!isMount && (prev === 'dcf' || (prevHasDcf && !hasDcfSelected))) {
      setFormData((current) => {
        const hasForecast = current.yearlyFinancials.some((yf) => yf.isForecast)
        if (hasForecast) {
          queueMicrotask(() => setShowForecastRemovalConfirm(true))
        }
        return current
      })
    }
  }, [effectiveMethod, hasDcfSelected, mi]) // eslint-disable-line react-hooks/exhaustive-deps

  // Accounting import — silent preflight; button only appears when a provider is connected
  const [accountingConnectedStatus, setAccountingConnectedStatus] =
    useState<IntegrationStatus | null>(null)
  const [importingFromAccounting, setImportingFromAccounting] = useState(false)
  const [importAccountingError, setImportAccountingError] = useState<string | null>(null)
  const [integrationEntryDismissed, setIntegrationEntryDismissed] = useState(false)
  const accountingRefetchThrottle = useRef(0)

  const loadAccountingIntegrationStatus = useCallback(async () => {
    try {
      const statuses = await accountingAPI.getAllIntegrationStatus()
      setAccountingStatuses(statuses)
      setAccountingConnectedStatus(pickConnectedImportStatus(statuses))
    } catch {
      // Fail silently — if we can't reach Titan the import button simply won't appear
    }
  }, [])

  useEffect(() => {
    void loadAccountingIntegrationStatus()
  }, [loadAccountingIntegrationStatus])

  useEffect(() => {
    if (accountingConnectedStatus?.is_connected) {
      setIntegrationEntryDismissed(false)
    }
  }, [accountingConnectedStatus?.is_connected])

  /** After connecting in Mercury (new tab), refresh status when user returns. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - accountingRefetchThrottle.current < 2500) return
      accountingRefetchThrottle.current = now
      void loadAccountingIntegrationStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [loadAccountingIntegrationStatus])

  const applyImportedBatch = useCallback(
    (
      provider: Extract<AccountingImportProvider, 'silverfin' | 'bizzcontrol' | 'octopus'>,
      batch: AccountingBatchPayload
    ) => {
      setImportBatchData(batch)
      setImportBatchProvider(provider)
      setIntegrationEntryDismissed(true)
      setImportAccountingError(null)
      setFormData((prev) => {
        const merged = [...prev.yearlyFinancials]
        for (const yearPayload of batch.years) {
          const year = String(yearPayload.data.fiscal_year ?? getCurrentFilingYear())
          const raw = yearPayload.data as { capex?: number; depreciation?: number }
          const nextYear: YearlyFinancials = {
            year,
            revenue: Number(yearPayload.data.revenue) || 0,
            ebitda: Number(yearPayload.data.ebitda) || 0,
            depreciation:
              yearPayload.data.depreciation != null
                ? Number(yearPayload.data.depreciation)
                : undefined,
            capex: raw.capex != null ? Number(raw.capex) : undefined,
            cash:
              yearPayload.data.cash_and_equivalents != null
                ? Number(yearPayload.data.cash_and_equivalents)
                : undefined,
            current_assets:
              yearPayload.data.current_assets != null
                ? Number(yearPayload.data.current_assets)
                : undefined,
            current_liabilities:
              yearPayload.data.current_liabilities != null
                ? Number(yearPayload.data.current_liabilities)
                : undefined,
            accounts_receivable:
              yearPayload.data.accounts_receivable != null
                ? Number(yearPayload.data.accounts_receivable)
                : undefined,
            inventory:
              yearPayload.data.inventory != null ? Number(yearPayload.data.inventory) : undefined,
            short_term_debt:
              yearPayload.data.short_term_financial_debt != null
                ? Number(yearPayload.data.short_term_financial_debt)
                : undefined,
            total_debt:
              (Number(yearPayload.data.long_term_debt) || 0) +
                (Number(yearPayload.data.short_term_financial_debt) || 0) || undefined,
          }
          const index = merged.findIndex((entry) => entry.year === year)
          if (index >= 0) merged[index] = { ...merged[index], ...nextYear }
          else merged.push(nextYear)
        }
        merged.sort((a, b) => Number(b.year) - Number(a.year))

        const forecastFromBatch = batch.forecast_years_data
        let nextForecast: YearDataInput[] | undefined
        if (forecastFromBatch && forecastFromBatch.length > 0) {
          nextForecast = forecastFromBatch.map((row) => ({
            year: row.year,
            revenue: row.revenue,
            ebitda: row.ebitda ?? 0,
            capex: row.capex,
            is_forecast: row.is_forecast ?? true,
          }))
        }

        const prevBc =
          prev.business_context && typeof prev.business_context === 'object'
            ? (prev.business_context as Record<string, unknown>)
            : undefined
        const mergedContext = mergeImportedLedgerAnalysisIntoBusinessContext(
          prevBc,
          batch,
          provider
        )

        return {
          ...prev,
          yearlyFinancials: merged,
          ...(nextForecast != null ? { forecast_years_data: nextForecast } : {}),
          business_context: mergedContext as ValuationFormData['business_context'],
        }
      })

      import('sonner').then(({ toast }) => {
        const mappedYears = batch.years.length
        const qualityScore =
          batch.years.length > 0
            ? Math.round(
                (batch.years.reduce((sum, year) => sum + (year.quality_score ?? 0), 0) /
                  batch.years.length) *
                  100
              )
            : 0
        const baseDesc = mi('silverfin.importBatchSuccessDescription', { score: qualityScore })
        const forecastExtra =
          provider === 'bizzcontrol'
            ? mi('bizzcontrol.forecastImportedDescription')
            : provider === 'octopus'
              ? mi('octopus.forecastImportedDescription')
              : ''
        const description =
          (provider === 'bizzcontrol' || provider === 'octopus') &&
          batch.forecast_years_data &&
          batch.forecast_years_data.length > 0
            ? `${baseDesc} ${forecastExtra}`
            : baseDesc
        toast.success(
          mi('silverfin.importBatchSuccessTitle', {
            years: mappedYears,
            provider: accountingProviderDisplayName(provider),
          }),
          { description }
        )
      })
    },
    [mi]
  )

  const handleConfirmBizzcontrolImport = useCallback(async () => {
    if (!selectedBizzcontrolCompanyId) return
    setImportingBizzcontrolBatch(true)
    setBizzcontrolImportError(null)
    try {
      const endYear = currentFilingYear
      const span = bizzcontrolHistoryRange === '5' ? 5 : 3
      const startYear = endYear - (span - 1)
      const batch = await accountingAPI.getBizzcontrolFinancialDataBatch(startYear, endYear, {
        companyId: selectedBizzcontrolCompanyId,
      })
      applyImportedBatch('bizzcontrol', batch)
      setShowBizzcontrolImportModal(false)
    } catch (err) {
      const msg = parseAccountingApiError(err)
      setBizzcontrolImportError(msg)
      import('sonner').then(({ toast }) =>
        toast.error(mi('importFromAccountingError') || 'Import failed', { description: msg })
      )
    } finally {
      setImportingBizzcontrolBatch(false)
    }
  }, [
    selectedBizzcontrolCompanyId,
    bizzcontrolHistoryRange,
    currentFilingYear,
    applyImportedBatch,
    mi,
  ])

  const handleConfirmOctopusImport = useCallback(async () => {
    if (!selectedOctopusCompanyId) return
    setImportingOctopusBatch(true)
    setOctopusImportError(null)
    try {
      const endYear = currentFilingYear
      const span = octopusHistoryRange === '5' ? 5 : 3
      const startYear = endYear - (span - 1)
      const batch = await accountingAPI.getOctopusFinancialDataBatch(startYear, endYear, {
        companyId: selectedOctopusCompanyId,
      })
      applyImportedBatch('octopus', batch)
      setShowOctopusImportModal(false)
    } catch (err) {
      const msg = parseAccountingApiError(err)
      setOctopusImportError(msg)
      import('sonner').then(({ toast }) =>
        toast.error(mi('importFromAccountingError') || 'Import failed', { description: msg })
      )
    } finally {
      setImportingOctopusBatch(false)
    }
  }, [selectedOctopusCompanyId, octopusHistoryRange, currentFilingYear, applyImportedBatch, mi])

  /**
   * Connected-accounting import entry. Bizzcontrol/Octopus open in-app batch modals; Silverfin, Yuki, and
   * Exact redirect to Mercury / Titan sync — see `ACCOUNTING_IMPORT_PROVIDER_ORDER` in `services/api/accounting.ts`.
   */
  const handleImportFromAccounting = useCallback(async () => {
    setImportAccountingError(null)
    setImportingFromAccounting(true)
    try {
      let row = accountingConnectedStatus
      if (!row?.is_connected) {
        const statuses = await accountingAPI.getAllIntegrationStatus()
        setAccountingStatuses(statuses)
        row = pickConnectedImportStatus(statuses) ?? null
        setAccountingConnectedStatus(row)
      }
      const provider = row && isAccountingImportProvider(row.provider) ? row.provider : null
      if (!provider) {
        window.location.href = buildMercuryIntegrationsUrl(locale)
        return
      }

      if (provider === 'bizzcontrol' && row != null && row.is_connected) {
        setBizzcontrolImportError(null)
        setShowBizzcontrolImportModal(true)
        setLoadingBizzcontrolCompanies(true)
        try {
          const res = await accountingAPI.getBizzcontrolCompanies()
          setBizzcontrolCompanies(res.administrations)
          setSelectedBizzcontrolCompanyId((prev) => {
            if (prev) return prev
            if (res.administrations.length === 1) return res.administrations[0].administration_id
            return ''
          })
        } catch (e) {
          setBizzcontrolImportError(parseAccountingApiError(e))
        } finally {
          setLoadingBizzcontrolCompanies(false)
        }
        return
      }

      if (provider === 'octopus' && row != null && row.is_connected) {
        setOctopusImportError(null)
        setShowOctopusImportModal(true)
        setLoadingOctopusCompanies(true)
        try {
          const res = await accountingAPI.getOctopusCompanies()
          setOctopusCompanies(res.administrations)
          setSelectedOctopusCompanyId((prev) => {
            if (prev) return prev
            if (res.administrations.length === 1) return res.administrations[0].administration_id
            return ''
          })
        } catch (e) {
          setOctopusImportError(parseAccountingApiError(e))
        } finally {
          setLoadingOctopusCompanies(false)
        }
        return
      }

      if (provider === 'silverfin') {
        window.location.href = buildMercuryIntegrationsUrl(locale, {
          accountingProvider: 'silverfin',
        })
        return
      }

      window.location.href = buildMercuryIntegrationsUrl(locale, {
        accountingProvider: provider === 'yuki' ? 'yuki' : 'exact',
      })
      return
    } catch (err) {
      const msg = parseAccountingApiError(err)
      setImportAccountingError(msg)
      import('sonner').then(({ toast }) =>
        toast.error(mi('importFromAccountingError') || 'Import failed', { description: msg })
      )
    } finally {
      setImportingFromAccounting(false)
    }
  }, [accountingConnectedStatus, locale, mi])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const firmIdFromQuery = params.get('firm_id')?.trim() || null
    const firmIdFromState = decodeSilverfinOAuthState(params.get('state'))
    const resolvedFirmId = firmIdFromQuery || firmIdFromState
    const silverfinConnectRequested =
      params.get('silverfin_connect') === '1' ||
      window.sessionStorage.getItem('upswitch_silverfin_oauth_in_progress') === '1'
    if (!code || !resolvedFirmId || !silverfinConnectRequested) return

    const oauthLockKey = `silverfin_oauth_${code}`
    if (window.sessionStorage.getItem(oauthLockKey)) {
      params.delete('code')
      params.delete('state')
      params.delete('firm_id')
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
      return
    }
    window.sessionStorage.setItem(oauthLockKey, '1')

    const redirectUrl = new URL(window.location.href)
    redirectUrl.searchParams.delete('code')
    redirectUrl.searchParams.delete('state')
    redirectUrl.searchParams.delete('firm_id')

    accountingAPI
      .connectSilverfin(code, redirectUrl.toString(), resolvedFirmId)
      .then(async () => {
        window.sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
        await loadAccountingIntegrationStatus()
        window.location.href = buildMercuryIntegrationsUrl(locale, {
          accountingProvider: 'silverfin',
        })
      })
      .catch((error) => {
        import('sonner').then(({ toast }) =>
          toast.error(parseAccountingApiError(error) || 'Silverfin connection failed')
        )
        window.sessionStorage.removeItem(oauthLockKey)
        const cleanedUrl = new URL(window.location.href)
        cleanedUrl.searchParams.delete('code')
        cleanedUrl.searchParams.delete('state')
        cleanedUrl.searchParams.delete('firm_id')
        window.history.replaceState({}, '', cleanedUrl.toString())
      })
  }, [loadAccountingIntegrationStatus, locale])

  const handleOpenMercuryIntegrations = useCallback(() => {
    const p = accountingConnectedStatus?.provider
    const ap: MercuryAccountingProviderDeepLink =
      p === 'yuki'
        ? 'yuki'
        : p === 'exact'
          ? 'exact'
          : p === 'silverfin'
            ? 'silverfin'
            : p === 'bizzcontrol'
              ? 'bizzcontrol'
              : p === 'octopus'
                ? 'octopus'
                : 'exact'
    window.location.href = buildMercuryIntegrationsUrl(locale, { accountingProvider: ap })
  }, [locale, accountingConnectedStatus?.provider])

  // ─── Field-level Validation ───
  const fieldValidation = useMemo(() => {
    const warnings: Record<string, string> = {}
    const errors: Record<string, string> = {}
    const currentYear = new Date().getFullYear()

    // Validate yearly financials
    for (const yf of formData.yearlyFinancials) {
      if (yf.revenue > 0 && yf.revenue > 1_000_000_000) {
        warnings[`revenue-${yf.year}`] = mi('validation.revenueOver1B')
      }
      if (
        formData.dcf_input_mode === 'fcff_only' &&
        yf.isForecast &&
        (typeof yf.free_cash_flow !== 'number' || !Number.isFinite(yf.free_cash_flow))
      ) {
        errors[`fcff-${yf.year}`] = mi('validation.fcffRequired')
      }
      if (yf.ebitda !== 0) {
        if (yf.ebitda < -100_000_000) errors[`ebitda-${yf.year}`] = mi('validation.ebitdaBelow100M')
        else if (yf.ebitda > 500_000_000)
          errors[`ebitda-${yf.year}`] = mi('validation.ebitdaAbove500M')
        if (yf.revenue > 0) {
          const margin = (yf.ebitda / yf.revenue) * 100
          if (margin < -50)
            warnings[`margin-${yf.year}`] = mi('validation.marginLow', {
              margin: margin.toFixed(0),
            })
          else if (margin > 80)
            warnings[`margin-${yf.year}`] = mi('validation.marginHigh', {
              margin: margin.toFixed(0),
            })
        }
      }
    }

    // Owner managers
    if (formData.ownerManagers < 0) errors.ownerManagers = mi('validation.minZero')
    // FTE Employees (0 is valid for owner-only; required when owner count > 0)
    if (formData.ownerManagers > 0 && formData.fteEmployees === undefined) {
      errors.fteEmployees = mi('validation.fteRequired')
    } else if (formData.fteEmployees !== undefined) {
      if (formData.fteEmployees < 0) errors.fteEmployees = mi('validation.minZero')
      else if (formData.fteEmployees > 10000) warnings.fteEmployees = mi('validation.fteOver10k')
    }
    // Year founded
    if (
      formData.yearFounded &&
      (Number(formData.yearFounded) < 1800 || Number(formData.yearFounded) > currentYear)
    ) {
      errors.yearFounded = mi('validation.yearRange', { year: currentYear })
    }

    return { warnings, errors, hasErrors: Object.keys(errors).length > 0 }
  }, [formData])

  const sortedYearlyFinancials = useMemo(
    () => [...formData.yearlyFinancials].sort((a, b) => Number(b.year) - Number(a.year)),
    [formData.yearlyFinancials]
  )
  const historicalCardRows = useMemo(
    () =>
      hasDcfSelected
        ? sortedYearlyFinancials.filter((year) => !year.isForecast)
        : sortedYearlyFinancials,
    [hasDcfSelected, sortedYearlyFinancials]
  )
  const baseFilingYearForLabels = useMemo(() => getSeedBaseFilingYear(formData), [formData])
  const dcfForecastRows = useMemo(
    () =>
      hasDcfSelected
        ? [...sortedYearlyFinancials.filter((year) => year.isForecast)].sort(
            (a, b) => Number(a.year) - Number(b.year)
          )
        : [],
    [hasDcfSelected, sortedYearlyFinancials]
  )
  const latestHistoricalRevenue = useMemo(() => {
    const historical = sortedYearlyFinancials.filter((y) => !y.isForecast && y.revenue > 0)
    return historical.length > 0 ? historical[0].revenue : undefined
  }, [sortedYearlyFinancials])

  const latestHistoricalEbitda = useMemo(() => {
    const historical = sortedYearlyFinancials.filter((y) => !y.isForecast && y.revenue > 0)
    if (historical.length === 0) return undefined
    const e = historical[0].ebitda
    return typeof e === 'number' && Number.isFinite(e) ? e : undefined
  }, [sortedYearlyFinancials])

  /** CFA-style defaults from historical CAGR, margins, and sector WACC base (Mercury/Titan-aligned). */
  const dcfSmartDefaultsFromHistory = useMemo(
    () =>
      deriveDcfSmartDefaults({
        yearlyFinancials: formData.yearlyFinancials,
        businessCategory:
          selectedBusinessType?.category ?? formData.industry ?? formData.businessType,
      }),
    [
      formData.yearlyFinancials,
      selectedBusinessType?.category,
      formData.industry,
      formData.businessType,
    ]
  )

  /** CapEx % of revenue from Titan/accounting suggested_capex (bulk import / Mercury sync). */
  const integrationDerivedCapexPct = useMemo(() => {
    const raw = formData.business_context?._imported_ledger_analysis
    const persisted =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as ImportedLedgerAnalysisSummary).dcf_defaults?.suggested_capex
        : undefined
    const suggested = importBatchData?.dcf_defaults?.suggested_capex ?? persisted
    const rev = latestHistoricalRevenue
    if (suggested == null || !Number.isFinite(suggested) || rev == null || rev <= 0) return null
    const pct = (suggested / rev) * 100
    return Math.round(Math.min(8, Math.max(2, pct)) * 10) / 10
  }, [importBatchData, formData.business_context, latestHistoricalRevenue])

  /** D&A % of revenue from ledger average depreciation (same integration pipeline as bulk valuation). */
  const integrationDerivedDaPct = useMemo(() => {
    const raw = formData.business_context?._imported_ledger_analysis
    const persisted =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as ImportedLedgerAnalysisSummary).dcf_defaults?.average_depreciation
        : undefined
    const avgDep = importBatchData?.dcf_defaults?.average_depreciation ?? persisted
    const rev = latestHistoricalRevenue
    if (avgDep == null || !Number.isFinite(avgDep) || rev == null || rev <= 0) return null
    const pct = (avgDep / rev) * 100
    return Math.round(Math.min(5, Math.max(2, pct)) * 10) / 10
  }, [importBatchData, formData.business_context, latestHistoricalRevenue])

  /** Forecast-defaults badge: history/sector model vs accounting import (Titan — same defaults as Mercury bulk). */
  const dcfDefaultsProvenance = useMemo((): 'none' | 'integration' | 'history' | 'both' => {
    const hasSmart = dcfSmartDefaultsFromHistory != null
    const hasImport = integrationDerivedCapexPct != null || integrationDerivedDaPct != null
    if (hasImport && hasSmart) return 'both'
    if (hasImport) return 'integration'
    if (hasSmart) return 'history'
    return 'none'
  }, [dcfSmartDefaultsFromHistory, integrationDerivedCapexPct, integrationDerivedDaPct])

  const saasSignalsForBonusSections: GetBonusSectionsSaasSignals = useMemo(() => {
    const business_model =
      formData.business_model ??
      (typeof storeBusinessModel === 'string' ? storeBusinessModel : undefined)
    const business_context =
      formData.business_context ??
      (storeBusinessContext && typeof storeBusinessContext === 'object'
        ? (storeBusinessContext as Record<string, unknown>)
        : undefined)
    return getBonusSectionsSaasSignalsFromFormData({ business_model, business_context })
  }, [formData.business_model, formData.business_context, storeBusinessModel, storeBusinessContext])

  /** Prefer picker object; fall back to session `businessType` id before sync completes. */
  const resolvedBusinessCategoryForBonusSections = useMemo(
    () => selectedBusinessType?.category ?? null,
    [selectedBusinessType?.category]
  )
  const resolvedBusinessTypeIdForBonusSections = useMemo(
    () =>
      resolveBusinessTypeIdForBonusSections(
        selectedBusinessType?.id,
        formData.businessType,
        storeBusinessTypeId
      ),
    [selectedBusinessType?.id, formData.businessType, storeBusinessTypeId]
  )

  const hasDcfForecastWorkspace = hasDcfSelected && dcfForecastRows.length > 0

  const adaptiveHeaderSteps = useMemo(() => {
    const bonus =
      effectiveMethods.length > 1
        ? getBonusSectionsForMethods(
            effectiveMethods,
            resolvedBusinessCategoryForBonusSections,
            resolvedBusinessTypeIdForBonusSections,
            saasSignalsForBonusSections
          )
        : getBonusSections(
            effectiveMethod,
            resolvedBusinessCategoryForBonusSections,
            resolvedBusinessTypeIdForBonusSections,
            saasSignalsForBonusSections
          )
    /** With DCF forecast: steps 4–6 = embedded defaults / forecast / WACC+TV; bonus sections start at 8.
     * Without DCF forecast, step 4 is reserved for the real-estate carve-out section.
     */
    let n = hasDcfForecastWorkspace ? 8 : 5
    const out: {
      dcfGlobal?: number
      nav?: number
      saas?: number
      revenue?: number
      sde?: number
    } = {}
    if (bonus.includes('dcf_projections')) {
      out.dcfGlobal = hasDcfForecastWorkspace ? 4 : n++
    }
    if (bonus.includes('nav_asset_schedule')) {
      out.nav = n++
    }
    if (bonus.includes('saas_metrics')) {
      out.saas = n++
    }
    if (bonus.includes('revenue_quality')) {
      out.revenue = n++
    }
    if (bonus.includes('sde_owner_compensation')) {
      out.sde = n++
    }
    return out
  }, [
    effectiveMethod,
    effectiveMethods,
    hasDcfForecastWorkspace,
    resolvedBusinessCategoryForBonusSections,
    resolvedBusinessTypeIdForBonusSections,
    saasSignalsForBonusSections,
  ])

  /** After WACC & terminal (step 6) when DCF forecast exists; else step 4. */
  const balanceSheetCarveOutStep = useMemo(
    () => (hasDcfForecastWorkspace ? 7 : 4),
    [hasDcfForecastWorkspace]
  )

  const synthesisStep = useMemo(() => {
    const allSteps = [
      3,
      balanceSheetCarveOutStep,
      adaptiveHeaderSteps.dcfGlobal,
      adaptiveHeaderSteps.nav,
      adaptiveHeaderSteps.saas,
      adaptiveHeaderSteps.revenue,
      adaptiveHeaderSteps.sde,
    ].filter((s): s is number => s != null)
    return Math.max(...allSteps) + 1
  }, [balanceSheetCarveOutStep, adaptiveHeaderSteps])

  const dcfForecastDefaultsStep = 4
  const dcfForecastWorkspaceStep = 5
  const dcfWaccTerminalStep = 6

  const dcfModeSegmentOptions = useMemo(
    () => [
      { value: 'ebitda' as const, label: mi('dcfInputMode.ebitda') },
      { value: 'fcff_only' as const, label: mi('dcfInputMode.fcffOnly') },
    ],
    [mi]
  )

  const [terminalValueMethod, setTerminalValueMethod] = useState<TerminalValueMethod>(() => {
    if (formData.dcf_terminal_value_method) return formData.dcf_terminal_value_method
    if (formData.dcf_exit_multiple != null && formData.dcf_terminal_growth_pct == null)
      return 'exit_multiple'
    return 'perpetual_growth'
  })

  const handleTerminalValueMethodChange = useCallback((method: TerminalValueMethod) => {
    setTerminalValueMethod(method)
    setFormData((prev) => ({ ...prev, dcf_terminal_value_method: method }))
  }, [])

  /** Last model-derived snapshot per forecast year; used to preserve manual overrides when DCF % change. */
  const dcfLastModelSnapshotRef = useRef<Record<string, DcfForecastModelSnapshot>>({})

  /** FCFF-only mode has no EBITDA on forecast rows; keep terminal method aligned with ValuationIQ (Gordon growth). */
  useEffect(() => {
    if (formData.dcf_input_mode !== 'fcff_only') return
    if (terminalValueMethod !== 'exit_multiple') return
    setTerminalValueMethod('perpetual_growth')
    setFormData((prev) => ({ ...prev, dcf_terminal_value_method: 'perpetual_growth' }))
  }, [formData.dcf_input_mode, terminalValueMethod])

  const dcfProjectionAutofillRows = useMemo(
    () =>
      hasDcfSelected
        ? deriveDcfProjectionPreview({
            yearlyFinancials: formData.yearlyFinancials,
            smartDefaults: dcfSmartDefaultsFromHistory,
            revenueGrowthPct: formData.dcf_revenue_growth_pct,
            ebitdaMarginPct: formData.dcf_ebitda_margin_pct,
            capexPct: formData.dcf_capex_pct,
            daPct: formData.dcf_da_pct,
            nwcPct: formData.dcf_nwc_pct,
            taxRatePct: formData.dcf_tax_rate_pct,
            forecastYears: dcfForecastRows.map((row) => Number(row.year)),
          })
        : [],
    [
      dcfForecastRows,
      dcfSmartDefaultsFromHistory,
      hasDcfSelected,
      formData.dcf_capex_pct,
      formData.dcf_da_pct,
      formData.dcf_ebitda_margin_pct,
      formData.dcf_nwc_pct,
      formData.dcf_revenue_growth_pct,
      formData.dcf_tax_rate_pct,
      formData.yearlyFinancials,
    ]
  )
  const growthPctOk =
    typeof formData.dcf_revenue_growth_pct === 'number' &&
    Number.isFinite(formData.dcf_revenue_growth_pct)
  const marginPctOk =
    typeof formData.dcf_ebitda_margin_pct === 'number' &&
    Number.isFinite(formData.dcf_ebitda_margin_pct)
  const canApplyDcfProjectionAutofill =
    formData.dcf_input_mode !== 'fcff_only' &&
    dcfForecastRows.length > 0 &&
    growthPctOk &&
    marginPctOk &&
    dcfProjectionAutofillRows.length > 0 &&
    dcfProjectionAutofillRows.length === dcfForecastRows.length

  const handleDcfInputModeChange = useCallback((mode: 'ebitda' | 'fcff_only') => {
    if (mode === 'fcff_only') {
      setTerminalValueMethod('perpetual_growth')
    }
    setFormData((prev) => {
      if (mode === 'fcff_only') {
        const globals = {
          daPct: prev.dcf_da_pct ?? DCF_DEFAULT_DA_PCT,
          capexPct: prev.dcf_capex_pct ?? DCF_DEFAULT_CAPEX_PCT,
          nwcPct: prev.dcf_nwc_pct ?? DCF_DEFAULT_NWC_PCT,
          taxRatePct: prev.dcf_tax_rate_pct ?? DCF_DEFAULT_TAX_RATE_PCT,
        }
        return {
          ...prev,
          dcf_input_mode: 'fcff_only',
          dcf_terminal_value_method: 'perpetual_growth',
          yearlyFinancials: prev.yearlyFinancials.map((yf) => {
            if (!yf.isForecast) return yf
            const fcff = buildProjectionRowFromForecastRow(
              {
                year: String(yf.year),
                revenue: yf.revenue,
                ebitda: yf.ebitda,
                capex: yf.capex,
                depreciation: yf.depreciation,
                nwc_change: yf.nwc_change,
                free_cash_flow: yf.free_cash_flow,
              },
              globals
            ).fcff
            return { ...yf, revenue: 0, ebitda: 0, free_cash_flow: fcff }
          }),
        }
      }
      const forecastYears = prev.yearlyFinancials
        .filter((r) => r.isForecast)
        .map((r) => Number(r.year))
      const cleared = prev.yearlyFinancials.map((yf) =>
        yf.isForecast ? { ...yf, free_cash_flow: undefined } : yf
      )
      const projectionRows = deriveDcfProjectionPreview({
        yearlyFinancials: cleared,
        smartDefaults: dcfSmartDefaultsFromFormSlice(prev),
        revenueGrowthPct: prev.dcf_revenue_growth_pct,
        ebitdaMarginPct: prev.dcf_ebitda_margin_pct,
        capexPct: prev.dcf_capex_pct,
        daPct: prev.dcf_da_pct,
        nwcPct: prev.dcf_nwc_pct,
        taxRatePct: prev.dcf_tax_rate_pct,
        forecastYears,
      })
      if (projectionRows.length === 0) {
        return {
          ...prev,
          dcf_input_mode: 'ebitda',
          yearlyFinancials: cleared as YearlyFinancials[],
        }
      }
      return {
        ...prev,
        dcf_input_mode: 'ebitda',
        yearlyFinancials: applyDcfProjectionPreviewToForecastRows(
          cleared as YearlyFinancials[],
          projectionRows
        ) as YearlyFinancials[],
      }
    })
  }, [])

  const handleApplyDcfProjectionAutofill = useCallback(() => {
    if (!canApplyDcfProjectionAutofill) return

    setFormData((prev) => ({
      ...prev,
      yearlyFinancials: applyDcfProjectionPreviewToForecastRows(
        prev.yearlyFinancials,
        deriveDcfProjectionPreview({
          yearlyFinancials: prev.yearlyFinancials,
          smartDefaults: dcfSmartDefaultsFromFormSlice(prev),
          revenueGrowthPct: prev.dcf_revenue_growth_pct,
          ebitdaMarginPct: prev.dcf_ebitda_margin_pct,
          capexPct: prev.dcf_capex_pct,
          daPct: prev.dcf_da_pct,
          nwcPct: prev.dcf_nwc_pct,
          taxRatePct: prev.dcf_tax_rate_pct,
          forecastYears: prev.yearlyFinancials
            .filter((row) => row.isForecast)
            .map((row) => Number(row.year)),
        })
      ) as YearlyFinancials[],
    }))

    import('sonner').then(({ toast }) =>
      toast.success(mi('dcfProjectionAutofillApplied', { count: dcfForecastRows.length }))
    )
  }, [canApplyDcfProjectionAutofill, dcfForecastRows.length, mi])

  const dcfForecastYearKeys = useMemo(
    () =>
      dcfForecastRows
        .map((r) => String(r.year))
        .sort()
        .join(','),
    [dcfForecastRows]
  )

  useEffect(() => {
    const allowed = new Set(dcfForecastYearKeys.length > 0 ? dcfForecastYearKeys.split(',') : [])
    const next: Record<string, DcfForecastModelSnapshot> = {}
    for (const k of Object.keys(dcfLastModelSnapshotRef.current)) {
      if (allowed.has(k)) next[k] = dcfLastModelSnapshotRef.current[k]
    }
    dcfLastModelSnapshotRef.current = next
  }, [dcfForecastYearKeys])

  useEffect(() => {
    if (formData.dcf_input_mode === 'fcff_only') {
      dcfLastModelSnapshotRef.current = {}
    }
  }, [formData.dcf_input_mode])

  /** Seed DCF defaults: smart history + integration (Titan/Mercury), then static engine fallbacks. */
  useEffect(() => {
    if (!hasDcfSelected) return

    const smart = dcfSmartDefaultsFromHistory

    setFormData((prev) => {
      const patch: Partial<ValuationFormData> = {}
      const hasForecastRows = dcfForecastRows.length > 0

      if (prev.dcf_wacc_pct == null || !Number.isFinite(prev.dcf_wacc_pct)) {
        patch.dcf_wacc_pct = smart?.waccPct ?? DCF_DEFAULT_WACC_PCT
      }
      if (prev.dcf_terminal_growth_pct == null || !Number.isFinite(prev.dcf_terminal_growth_pct)) {
        patch.dcf_terminal_growth_pct = smart?.terminalGrowthPct ?? DCF_DEFAULT_TERMINAL_GROWTH_PCT
      }

      if (prev.dcf_input_mode !== 'fcff_only' && hasForecastRows) {
        if (prev.dcf_revenue_growth_pct == null || !Number.isFinite(prev.dcf_revenue_growth_pct)) {
          patch.dcf_revenue_growth_pct = smart?.revenueGrowthPct ?? DCF_DEFAULT_REVENUE_GROWTH_PCT
        }
        if (prev.dcf_ebitda_margin_pct == null || !Number.isFinite(prev.dcf_ebitda_margin_pct)) {
          if (smart) {
            patch.dcf_ebitda_margin_pct = smart.ebitdaMarginPct
          } else {
            const rev = latestHistoricalRevenue
            const ebitda = latestHistoricalEbitda
            if (rev && rev > 0 && ebitda != null && Number.isFinite(ebitda)) {
              patch.dcf_ebitda_margin_pct = Math.round((ebitda / rev) * 1000) / 10
            } else {
              patch.dcf_ebitda_margin_pct = DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT
            }
          }
        }
        if (prev.dcf_capex_pct == null || !Number.isFinite(prev.dcf_capex_pct)) {
          patch.dcf_capex_pct =
            integrationDerivedCapexPct ?? smart?.capexPct ?? DCF_DEFAULT_CAPEX_PCT
        }
        if (prev.dcf_da_pct == null || !Number.isFinite(prev.dcf_da_pct)) {
          patch.dcf_da_pct = integrationDerivedDaPct ?? smart?.daPct ?? DCF_DEFAULT_DA_PCT
        }
        if (prev.dcf_nwc_pct == null || !Number.isFinite(prev.dcf_nwc_pct)) {
          patch.dcf_nwc_pct = DCF_DEFAULT_NWC_PCT
        }
        if (prev.dcf_tax_rate_pct == null || !Number.isFinite(prev.dcf_tax_rate_pct)) {
          patch.dcf_tax_rate_pct = smart?.taxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT
        }
      }

      if (Object.keys(patch).length === 0) return prev
      return { ...prev, ...patch }
    })
  }, [
    hasDcfSelected,
    formData.dcf_input_mode,
    dcfForecastRows.length,
    latestHistoricalRevenue,
    latestHistoricalEbitda,
    dcfSmartDefaultsFromHistory,
    integrationDerivedCapexPct,
    integrationDerivedDaPct,
  ])

  /** Live-sync forecast rows from DCF %; rows that diverge from the last model snapshot are treated as manual overrides. */
  useEffect(() => {
    if (!hasDcfSelected || formData.dcf_input_mode === 'fcff_only') return
    if (dcfForecastRows.length === 0) return

    setFormData((prev) => {
      const growth = prev.dcf_revenue_growth_pct
      const margin = prev.dcf_ebitda_margin_pct
      if (
        growth == null ||
        margin == null ||
        !Number.isFinite(growth) ||
        !Number.isFinite(margin)
      ) {
        return prev
      }

      const forecastYears = prev.yearlyFinancials
        .filter((r) => r.isForecast)
        .map((r) => Number(r.year))
      const preview = deriveDcfProjectionPreview({
        yearlyFinancials: prev.yearlyFinancials,
        smartDefaults: dcfSmartDefaultsFromFormSlice(prev),
        revenueGrowthPct: growth,
        ebitdaMarginPct: margin,
        capexPct: prev.dcf_capex_pct,
        daPct: prev.dcf_da_pct,
        nwcPct: prev.dcf_nwc_pct,
        taxRatePct: prev.dcf_tax_rate_pct,
        forecastYears,
      })
      if (preview.length === 0) return prev

      const ref = dcfLastModelSnapshotRef
      let anyChange = false
      const nextYf = prev.yearlyFinancials.map((yf) => {
        if (!yf.isForecast) return yf
        const proj = preview.find((p) => String(p.year) === String(yf.year))
        if (!proj) return yf

        const modelSnap: DcfForecastModelSnapshot = {
          revenue: proj.revenue,
          ebitda: proj.ebitda,
          capex: proj.capex,
          depreciation: proj.da,
          nwc_change: proj.nwcChange,
        }
        const lastSnap = ref.current[String(yf.year)]
        const curSnap = snapshotFromForecastRowLike(yf)
        if (lastSnap && !snapshotsClose(curSnap, lastSnap)) {
          return yf
        }

        const merged = {
          ...yf,
          revenue: proj.revenue,
          ebitda: proj.ebitda,
          capex: proj.capex,
          depreciation: proj.da,
          nwc_change: proj.nwcChange,
          free_cash_flow: undefined,
        }
        if (
          merged.revenue !== yf.revenue ||
          merged.ebitda !== yf.ebitda ||
          (merged.capex ?? 0) !== (yf.capex ?? 0) ||
          (merged.depreciation ?? 0) !== (yf.depreciation ?? 0) ||
          (merged.nwc_change ?? 0) !== (yf.nwc_change ?? 0)
        ) {
          anyChange = true
        }
        ref.current[String(yf.year)] = modelSnap
        return merged
      })

      if (!anyChange) return prev
      return { ...prev, yearlyFinancials: nextYf as YearlyFinancials[] }
    })
  }, [
    hasDcfSelected,
    formData.dcf_input_mode,
    formData.dcf_revenue_growth_pct,
    formData.dcf_ebitda_margin_pct,
    formData.dcf_capex_pct,
    formData.dcf_da_pct,
    formData.dcf_nwc_pct,
    formData.dcf_tax_rate_pct,
    dcfForecastYearKeys,
  ])

  useEffect(() => {
    const persistedAnalysis = formData.business_context?._imported_ledger_analysis as
      | ImportedLedgerAnalysisSummary
      | undefined
    const suggestedCapex =
      importBatchData?.dcf_defaults?.suggested_capex ??
      persistedAnalysis?.dcf_defaults?.suggested_capex
    if (
      !hasDcfSelected ||
      formData.dcf_input_mode === 'fcff_only' ||
      !suggestedCapex ||
      dcfForecastRows.length === 0
    ) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      yearlyFinancials: prev.yearlyFinancials.map((row) =>
        row.isForecast && (row.capex == null || row.capex === 0)
          ? { ...row, capex: suggestedCapex }
          : row
      ),
    }))
  }, [
    dcfForecastRows.length,
    hasDcfSelected,
    formData.business_context,
    formData.dcf_input_mode,
    importBatchData?.dcf_defaults?.suggested_capex,
  ])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (fieldValidation.hasErrors) {
      import('sonner').then(({ toast }) =>
        toast.error(mi('validation.checkFields'), {
          description: Object.values(fieldValidation.errors)[0],
        })
      )
      return
    }
    const trust = useManualFormStore.getState().formData
    const trustOfficialUsable = hasUsableOfficialFinancialsContent(trust.official_financials)
    onSubmit({
      ...formData,
      averageNormalizedEbitda: normalizedData.averageNormalizedEbitda,
      ...(trustOfficialUsable &&
        trust.official_financials && { official_financials: trust.official_financials }),
      ...(trustOfficialUsable &&
        trust.official_variance_analysis != null && {
          official_variance_analysis: trust.official_variance_analysis,
        }),
      ...(trustOfficialUsable &&
        trust.official_verification_badge != null && {
          official_verification_badge: trust.official_verification_badge,
        }),
    })
  }

  // Handle KBO company selection (Mercury parity: prefill business type from NACE)
  const handleCompanySelect = useCallback(
    async (company: KBOCompany) => {
      // Cancel any in-flight NACE lookups (from useEffect or previous company select)
      if (naceAbortRef.current) naceAbortRef.current.abort()
      if (companySelectAbortRef.current) companySelectAbortRef.current.abort()
      const controller = new AbortController()
      companySelectAbortRef.current = controller

      setSelectedCompany(company)
      setCompanySearchValue(company.name ?? '')

      const addr = company.address ?? ''
      const postal = company.postalCode ?? ''
      const city = company.city ?? ''
      const addressStr =
        postal && addr && !addr.includes(postal) ? `${addr}, ${postal} ${city}` : addr

      const canonical = company.canonicalNaceCode?.trim() || company.naceCode?.trim() || ''
      const displayCode = company.activityCode?.trim() || company.naceCode?.trim() || ''
      const baseUpdates: Partial<ValuationFormData> = {
        companyName: company.name ?? '',
        kboNumber: company.kboNumber ?? '',
        legalForm: company.legalForm ?? '',
        address: addressStr,
        naceCode: displayCode,
        canonicalNaceCode: canonical,
        naceDescription: company.naceDescription ?? '',
        businessStructure: mapLegalFormToBusinessStructure(company.legalForm ?? ''),
      }

      setFormData((prev) => ({ ...prev, ...baseUpdates }))
      setNacePrefillError(null)

      updateFormData({
        kbo_number: company.kboNumber ?? '',
        legal_form: company.legalForm ?? '',
        nace_code: canonical,
        nace_description: baseUpdates.naceDescription || '',
        // Clear stale SBI when switching to a BE row or when display matches canonical
        ...(displayCode && canonical && displayCode !== canonical
          ? { activity_code: displayCode }
          : { activity_code: undefined }),
      })

      const naceCode = canonical || company.naceCode?.trim()
      if (naceCode) {
        try {
          const bt = await naceBusinessTypeService.getBusinessTypeForNaceCode(
            naceCode,
            controller.signal,
            company.countryCode || undefined,
          )
          if (controller.signal.aborted) return
          if (bt) {
            const mapped: BusinessType = businessTypesForSearch.find((t) => t.id === bt.id) ?? bt
            setSelectedBusinessType(mapped)
            setFormData((prev) => ({
              ...prev,
              ...baseUpdates,
              businessType: bt.id,
              businessTypeCode: bt.code || bt.id,
              industry: bt.category || 'services',
            }))
            updateFormData({ business_type_id: bt.id, industry: bt.category })
            setNacePrefillError(null)
          } else {
            setNacePrefillError(localizeActivityCodeCopy(t('errors.noBusinessTypeForNace')))
          }
        } catch (err) {
          if (controller.signal.aborted) return
          const msg =
            err instanceof Error && err.message === 'BUSINESS_TYPE_FETCH_FAILED'
              ? localizeActivityCodeCopy(t('errors.businessTypeFetchFailed'))
              : err instanceof Error
                ? localizeActivityCodeCopy(err.message)
                : localizeActivityCodeCopy(t('errors.businessTypeFetchFailed'))
          setNacePrefillError(msg)
        } finally {
          if (companySelectAbortRef.current === controller) {
            companySelectAbortRef.current = null
          }
        }
      } else {
        companySelectAbortRef.current = null
      }
    },
    [businessTypesForSearch, localizeActivityCodeCopy, t, updateFormData]
  )

  const handleBusinessTypeSelect = (value: string, businessType?: BusinessType) => {
    setSelectedBusinessType(businessType || null)
    updateField('businessType', value)
    setNacePrefillError(null)
    if (businessType) {
      updateField('businessTypeCode', businessType.code)
      updateField('industry', businessType.category)
      updateFormData({ business_type_id: value, industry: businessType.category })
    } else {
      updateField('businessTypeCode', '')
      updateField('industry', '')
      updateFormData({ business_type_id: undefined, industry: undefined })
    }
  }

  const executeClearCompany = useCallback(() => {
    prefillCompanyRef.current = null
    setSelectedCompany(null)
    setCompanySearchValue('')
    setNacePrefillError(null)
    setSelectedBusinessType(null)
    setShowChangeCompanyWarning(false)
    setFormData((prev) => ({
      ...prev,
      companyName: '',
      kboNumber: '',
      legalForm: '',
      address: '',
      naceCode: '',
      canonicalNaceCode: '',
      naceDescription: '',
      businessStructure: '',
      businessType: '',
      businessTypeCode: '',
      industry: '',
    }))
    updateFormData({
      business_type_id: undefined,
      industry: undefined,
      kbo_number: '',
      legal_form: '',
      nace_code: '',
      nace_description: '',
      activity_code: undefined,
    })
  }, [updateFormData])

  const handleClearCompany = useCallback(() => {
    if (prefillCompanyRef.current && selectedCompany) {
      setShowChangeCompanyWarning(true)
      return
    }
    executeClearCompany()
  }, [executeClearCompany, selectedCompany])

  const handleCSVFileSelected = useCallback(
    (_file: File, parsedData: ParsedCSVData) => {
      setShowCSVUpload(false)
      const source = parsedData.detectedType === 'generic' ? 'yuki' : parsedData.detectedType
      onCSVImportComplete?.(source, _file.name)
    },
    [onCSVImportComplete]
  )

  // Check if core fields are filled
  const hasCompanyInfo = !!selectedCompany || formData.companyName.length > 0
  const hasBusinessType = !!selectedBusinessType || formData.businessType.length > 0
  const hasFinancials = !!latestCompleteYearlyFinancial
  const hasEbitdaValue = formData.yearlyFinancials.some((yf) => hasExplicitNumericValue(yf.ebitda))
  const totalYearsWithEbitda = formData.yearlyFinancials.filter((yf) =>
    hasExplicitNumericValue(yf.ebitda)
  ).length
  const { canSave, reason: canSaveReason } = useCanSave()
  const canSubmit = hasCompanyInfo && hasBusinessType && hasFinancials && canSave

  // Field-level: detect partially filled years (has one of revenue/ebitda but not both).
  // Forecast years are excluded — they start as empty placeholders by design.
  const partialYears = formData.yearlyFinancials
    .filter(
      (yf) =>
        !yf.isForecast &&
        (((Number(yf.revenue) || 0) > 0 && !hasExplicitNumericValue(yf.ebitda)) ||
          (hasExplicitNumericValue(yf.ebitda) && (Number(yf.revenue) || 0) <= 0))
    )
    .map((yf) => yf.year)

  const shouldShowIntegrationEntry =
    preferIntegrationEntry &&
    !integrationEntryDismissed &&
    !hasMeaningfulYearlyFinancials(formData.yearlyFinancials)
  const persistedImportedLedgerAnalysis = useMemo(() => {
    const raw = formData.business_context?._imported_ledger_analysis
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as ImportedLedgerAnalysisSummary)
      : null
  }, [formData.business_context])
  const effectiveImportedLedgerAnalysis = useMemo(() => {
    const fromBatch =
      importBatchData != null
        ? ({
            latest_fiscal_year: importBatchData.latest_fiscal_year,
            sde_flags: importBatchData.sde_flags,
            ev_equity_bridge: importBatchData.ev_equity_bridge,
            dcf_defaults: importBatchData.dcf_defaults,
          } as ImportedLedgerAnalysisSummary)
        : null
    const base = fromBatch ?? persistedImportedLedgerAnalysis
    if (!base) return null
    return base
  }, [importBatchData, persistedImportedLedgerAnalysis])
  const shouldShowImportedBatchSummary = !!importBatchData || !!effectiveImportedLedgerAnalysis
  const connectedProvider = accountingConnectedStatus?.provider
  /** Pull data inside Venus when disconnected (redirect to Mercury to connect) or when Bizzcontrol/Octopus is connected (batch import). */
  const supportsVenusLiveImport =
    connectedProvider == null ||
    connectedProvider === 'bizzcontrol' ||
    connectedProvider === 'octopus'
  const requiresMercuryImportFlow =
    connectedProvider === 'yuki' ||
    connectedProvider === 'exact' ||
    connectedProvider === 'silverfin'
  const importedProviderLabel =
    importBatchProvider != null
      ? accountingProviderDisplayName(importBatchProvider)
      : connectedProvider != null
        ? accountingProviderDisplayName(connectedProvider)
        : 'Imported accounting'
  const importQualityScore = useMemo(() => {
    if (importBatchData && importBatchData.years.length > 0) {
      return Math.round(
        (importBatchData.years.reduce((sum, year) => sum + (year.quality_score ?? 0), 0) /
          importBatchData.years.length) *
          100
      )
    }

    if (spotlightImportQuality && Object.keys(spotlightImportQuality).length > 0) {
      const qualities = Object.values(spotlightImportQuality)
      const averageConfidence =
        qualities.reduce((sum, quality) => sum + (quality.confidence_score ?? 0), 0) /
        qualities.length
      return Math.round(averageConfidence * 100)
    }

    return null
  }, [importBatchData, spotlightImportQuality])
  const importedYearCount =
    importBatchData?.years.length ??
    [
      ...(formData.current_year_data?.year ? [formData.current_year_data.year] : []),
      ...(formData.historical_years_data ?? []).map((year) => year.year),
    ].filter((year, index, years) => years.indexOf(year) === index).length
  const importedSdeFlagCount = effectiveImportedLedgerAnalysis?.sde_flags?.length ?? 0
  const effectiveEvBridge = effectiveImportedLedgerAnalysis?.ev_equity_bridge

  return (
    <>
      <div className="h-full flex flex-col bg-background overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 flex flex-col">
            <SpotlightBanner />
            <GuidedResolutionOrphanFields />

            {(shouldShowIntegrationEntry || shouldShowImportedBatchSummary) && (
              <section className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                      <CloudDownload className="h-3.5 w-3.5" />
                      {mi('integrationEntry.eyebrow')}
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-foreground">
                      {shouldShowImportedBatchSummary
                        ? `${importedProviderLabel} data imported`
                        : accountingConnectedStatus?.is_connected
                          ? mi('integrationEntry.connectedTitle', {
                              provider: accountingProviderDisplayName(
                                accountingConnectedStatus.provider
                              ),
                            })
                          : mi('integrationEntry.connectTitle')}
                    </h3>
                    <p className="mt-1 text-sm text-foreground/70">
                      {shouldShowImportedBatchSummary
                        ? mi('integrationEntry.importedBatchSummaryDescription', {
                            years: importedYearCount,
                            provider: importedProviderLabel,
                          })
                        : requiresMercuryImportFlow
                          ? mi('integrationEntry.advisorIntegrationsHint')
                          : accountingConnectedStatus?.is_connected
                            ? mi('integrationEntry.connectedDescription', {
                                provider: accountingProviderDisplayName(
                                  accountingConnectedStatus.provider
                                ),
                              })
                            : mi('integrationEntry.connectDescription')}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground/55">
                      <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {mi('integrationEntry.supportedProviders')}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {mi('integrationEntry.overrideNote')}
                      </span>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
                    {!integrationsEnabled && isAccountantFreeOrStarterTier(planType) ? (
                      <>
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5">
                          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <Zap className="h-4 w-4 flex-shrink-0" />
                            <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                              {mi('integrationEntry.proUpsellEyebrow')}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-foreground">
                            {mi('integrationEntry.proUpsellTitle')}
                          </p>
                          <p className="mt-1 text-xs text-foreground/60">
                            {mi('integrationEntry.proUpsellDescription')}
                          </p>
                          <AuroraButton
                            type="button"
                            onClick={handleOpenMercuryIntegrations}
                            className="mt-3 w-full"
                          >
                            <Zap className="mr-2 h-4 w-4" />
                            {mi('integrationEntry.proUpsellCta')}
                          </AuroraButton>
                        </div>
                        <AuroraButton
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setIntegrationEntryDismissed(true)
                          }}
                          className="w-full"
                        >
                          {mi('integrationEntry.manualCta')}
                        </AuroraButton>
                      </>
                    ) : shouldShowImportedBatchSummary ? (
                      <AuroraButton
                        type="button"
                        onClick={handleImportFromAccounting}
                        variant="secondary"
                        disabled={importingFromAccounting}
                        className="w-full"
                      >
                        Refresh imported data
                      </AuroraButton>
                    ) : supportsVenusLiveImport ? (
                      <AuroraButton
                        type="button"
                        onClick={handleImportFromAccounting}
                        disabled={importingFromAccounting}
                        className="w-full"
                      >
                        {importingFromAccounting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CloudDownload className="mr-2 h-4 w-4" />
                        )}
                        {connectedProvider
                          ? mi('integrationEntry.pullDataCta', {
                              provider: accountingProviderDisplayName(connectedProvider),
                            })
                          : mi('integrationEntry.pullDataCtaGeneric')}
                      </AuroraButton>
                    ) : (
                      <AuroraButton
                        type="button"
                        onClick={handleOpenMercuryIntegrations}
                        className="w-full"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {accountingConnectedStatus?.is_connected
                          ? mi('integrationEntry.openIntegrationsSettingsCta')
                          : mi('integrationEntry.connectCta')}
                      </AuroraButton>
                    )}
                    {(integrationsEnabled || !isAccountantFreeOrStarterTier(planType)) && (
                      <AuroraButton
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setIntegrationEntryDismissed(true)
                        }}
                        className="w-full"
                      >
                        {mi('integrationEntry.manualCta')}
                      </AuroraButton>
                    )}
                  </div>
                </div>
                {shouldShowImportedBatchSummary && (
                  <div className="mt-4 space-y-4">
                    <div
                      className={cn(
                        'grid gap-3',
                        effectiveEvBridge ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'
                      )}
                    >
                      <div className="rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-foreground/45">
                          Data quality score
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {importQualityScore != null ? `${importQualityScore}%` : 'n/a'}
                        </div>
                        <p className="mt-1 text-xs text-foreground/55">
                          Trial balance mapped against Belgian MAR classes.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-foreground/45">
                          Historical years
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {importedYearCount}
                        </div>
                        <p className="mt-1 text-xs text-foreground/55">
                          Revenue, EBITDA, cash, debt, and MAR 63 imported.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.12em] text-foreground/45">
                          DCF CapEx default
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {effectiveImportedLedgerAnalysis?.dcf_defaults?.suggested_capex
                            ? formatCurrency(
                                effectiveImportedLedgerAnalysis.dcf_defaults.suggested_capex
                              )
                            : 'n/a'}
                        </div>
                        <p className="mt-1 text-xs text-foreground/55">
                          Auto-filled from historical depreciation (MAR 63 average).
                        </p>
                      </div>
                      {effectiveEvBridge ? (
                        <div className="rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-foreground/45">
                            EV to equity bridge
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-foreground">
                            {formatCurrency(effectiveEvBridge.equity_value)}
                          </div>
                          <p className="mt-1 text-xs text-foreground/55">
                            Net debt {formatCurrency(effectiveEvBridge.net_debt)} from cash{' '}
                            {formatCurrency(effectiveEvBridge.cash_and_equivalents)} and debt{' '}
                            {formatCurrency(effectiveEvBridge.interest_bearing_debt)}.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {importedSdeFlagCount > 0 ? (
                      <div className="rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3 text-sm text-foreground/70">
                        {importedSdeFlagCount} imported normalization prompts were detected and will
                        remain available for later review in the valuation workflow.
                      </div>
                    ) : null}
                  </div>
                )}
                {importAccountingError && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/15 bg-destructive/[0.04] px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{importAccountingError}</span>
                  </div>
                )}
              </section>
            )}

            {/* Step 1: Company Identification */}
            <section className="space-y-4">
              <div className={SECTION_HEADER_ROW_CLASS}>
                <SectionStatusCircle step={1} complete={!!selectedCompany} className="flex" />
                <h3 className="text-sm font-medium text-foreground">
                  {mi('sections.companyDetails')}
                </h3>
              </div>

              <AuroraSelect
                label={mi('fields.operatingCountry')}
                options={TARGET_COUNTRIES.map((c) => ({
                  value: c.code,
                  label: `${c.flag} ${c.name} (${c.currencySymbol})`,
                }))}
                value={formData.country || initialData.country || 'BE'}
                onChange={(val) => {
                  countryUserOverrideRef.current = true
                  const prev = formData.country || initialData.country || 'BE'
                  updateField('country', val)
                  const cc = String(val).trim().toUpperCase().substring(0, 2)
                  if (cc) updateFormData({ country_code: cc })
                  if (val !== prev) {
                    setSelectedCompany(null)
                    setCompanySearchValue('')
                  }
                }}
                helpText={mi('fields.operatingCountryHelp')}
                helpTextPlacement="below"
                size="sm"
                disabled={isCalculating}
              />

              {readOnlyKbo && selectedCompany ? (
                <div className="rounded-lg border border-foreground/[0.08] bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-foreground/50 mb-0.5">
                    {localizeActivityCodeCopy(mi('fields.companyNameOrKbo'))}
                  </p>
                  <p className="text-sm font-medium text-foreground">{selectedCompany.name}</p>
                  {selectedCompany.kboNumber && (
                    <p className="text-xs text-foreground/40 font-mono mt-0.5">
                      {searchCountry === 'NL' ? 'KVK' : 'KBO'} {selectedCompany.kboNumber}
                    </p>
                  )}
                </div>
              ) : (
                <KBOSearchInput
                  label={localizeActivityCodeCopy(mi('fields.companyNameOrKbo'))}
                  value={companySearchValue}
                  onChange={setCompanySearchValue}
                  onCompanySelect={handleCompanySelect}
                  selectedCompany={selectedCompany}
                  onClear={handleClearCompany}
                  searchFn={kboSearchFn}
                  minQueryLength={2}
                  debounceMs={400}
                  size="sm"
                  disabled={isCalculating}
                  countryCode={searchCountry}
                  description={searchCountry === 'NL' ? mi('registryNlSearchHint') : undefined}
                  noResultsHint={searchCountry === 'NL' ? mi('registryNlNoResults') : undefined}
                />
              )}

              <AnimatePresence>
                {showChangeCompanyWarning && selectedCompany && prefillCompanyRef.current && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-3 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground/70 text-xs leading-relaxed">
                          {mi('changeCompanyWarning.message', {
                            companyName: prefillCompanyRef.current.name,
                          })}
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowChangeCompanyWarning(false)}
                            className="rounded-lg border border-foreground/10 bg-background px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted"
                          >
                            {mi('changeCompanyWarning.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={executeClearCompany}
                            className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                          >
                            {mi('changeCompanyWarning.confirm')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {selectedCompany && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <SpotlightFieldWrapper fieldName="industry">
                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5">
                          <ProvenanceDot fieldName="industry" className="mt-2" />
                          <div className="flex-1 min-w-0">
                            <BusinessTypeSearchInput
                              label={mi('fields.businessType')}
                              value={formData.businessType}
                              onChange={handleBusinessTypeSelect}
                              types={
                                businessTypesForSearch.length > 0
                                  ? businessTypesForSearch
                                  : undefined
                              }
                              loading={businessTypesLoading}
                              loadError={businessTypesError}
                              onRetryLoad={refetchBusinessTypes}
                              naceMatchedTypeId={
                                selectedCompany?.naceCode &&
                                formData.businessType?.trim() &&
                                !looksLikeNaceCode(formData.businessType)
                                  ? formData.businessType.trim()
                                  : undefined
                              }
                              size="sm"
                              disabled={isCalculating}
                            />
                          </div>
                        </div>
                      </div>
                    </SpotlightFieldWrapper>
                    {nacePrefillError && (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20 -mt-1">
                        <p className="text-[11px] text-destructive/80">{nacePrefillError}</p>
                        <button
                          type="button"
                          onClick={() => setNaceRetryTrigger((p) => p + 1)}
                          className="text-[11px] font-medium text-primary hover:text-primary/80 shrink-0"
                        >
                          {tKbo('retry')}
                        </button>
                      </div>
                    )}
                    {selectedBusinessType && (
                      <div className="-mt-1 space-y-1">
                        <p className="text-[11px] text-foreground/40">{mi('businessTypeHint')}</p>
                        {effectiveMethods.includes('arr_multiple') ? (
                          <p className="text-[11px] text-foreground/40">
                            {mi('businessTypeArrMethodNote')}
                          </p>
                        ) : null}
                      </div>
                    )}

                    <AuroraSelect
                      label={mi('fields.legalForm')}
                      options={businessStructures}
                      value={formData.businessStructure}
                      onChange={(val) => updateField('businessStructure', val)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Step 2: Ownership & Structure */}
            {selectedCompany && hasBusinessType && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className={SECTION_HEADER_ROW_CLASS}>
                  <SectionStatusCircle
                    step={2}
                    complete={
                      formData.ownerManagers > 0 &&
                      formData.fteEmployees !== undefined &&
                      formData.fteEmployees >= 0
                    }
                    className="flex"
                  />
                  <h3 className="text-sm font-medium text-foreground">
                    {mi('sections.ownershipStructure')}
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <AuroraInput
                      label={mi('fields.ownerManagers')}
                      type="number"
                      min={1}
                      max={10}
                      value={formData.ownerManagers || ''}
                      onChange={(e) => updateField('ownerManagers', Number(e.target.value))}
                      size="sm"
                      placeholder="1"
                      truncateLabel={false}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                      <FieldHelpTrigger
                        context={{
                          field: 'ownerManagers',
                          label: mi('fields.ownerManagers'),
                          value: formData.ownerManagers,
                          hint: mi('ownerManagersHint'),
                        }}
                        onTrigger={onFieldHelpRequest}
                      />
                    </div>
                  </div>
                  <div>
                    <AuroraInput
                      label={mi('fields.totalFte')}
                      type="number"
                      min={0}
                      value={
                        formData.fteEmployees !== undefined && formData.fteEmployees !== null
                          ? String(formData.fteEmployees)
                          : ''
                      }
                      onChange={(e) => {
                        const raw = e.target.value
                        const value =
                          raw === ''
                            ? undefined
                            : (() => {
                                const n = Number(raw)
                                return !isNaN(n) && n >= 0 ? n : undefined
                              })()
                        updateField('fteEmployees', value)
                      }}
                      size="sm"
                      placeholder="0"
                      truncateLabel={false}
                    />
                    {(fieldValidation.errors.fteEmployees ||
                      fieldValidation.warnings.fteEmployees) && (
                      <p
                        className={`text-[10px] mt-0.5 ${fieldValidation.errors.fteEmployees ? 'text-destructive' : 'text-warning'}`}
                      >
                        {fieldValidation.errors.fteEmployees ||
                          fieldValidation.warnings.fteEmployees}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-foreground/40">{mi('ownershipHint')}</p>
              </motion.section>
            )}

            {/* Step 3: Multi-Year Financials */}
            {selectedCompany && hasBusinessType && (
              <motion.section
                ref={financialsStepRef}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className={SECTION_HEADER_ROW_CLASS}>
                  <SectionStatusCircle step={3} complete={hasFinancials} className="flex" />
                  <h3 className="text-sm font-medium text-foreground">
                    {mi('sections.financialHistory')}
                  </h3>
                </div>

                {importAccountingError && (
                  <p className="text-xs text-destructive ml-8">{importAccountingError}</p>
                )}

                <FilingYearPrompt
                  defaultYear={currentFilingYear}
                  dismissed={
                    formData.filingYearConfirmed === true ||
                    hasMeaningfulYearlyFinancials(formData.yearlyFinancials)
                  }
                  onSelect={handleSelectFilingYear}
                />

                {/* Aurora EBITDA Summary Card - only when EBITDA inputs actually contain values */}
                {hasEbitdaValue && hasFinancials && totalYearsWithEbitda > 0 && (
                  <motion.div
                    className={cn(
                      'relative rounded-xl overflow-hidden transition-all duration-300',
                      normalizedData.years.some(
                        (y) => y.totalAdjustment !== 0 || (y.fictiveRentDeduction ?? 0) > 0
                      )
                        ? 'shadow-sm'
                        : ''
                    )}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {/* Animated Aurora gradient border - Kept but made more subtle */}
                    <div
                      className="absolute inset-0 rounded-xl opacity-40"
                      style={{
                        background:
                          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(175 60% 50%) 25%, hsl(264 80% 60%) 50%, hsl(var(--primary)) 75%, hsl(175 60% 50%) 100%)',
                        backgroundSize: '300% 300%',
                        animation: 'aurora-shift 12s ease-in-out infinite',
                        padding: '1px',
                      }}
                    />

                    {/* Inner content with solid background */}
                    <div className="relative m-[1px] rounded-[11px] bg-background p-4">
                      {/* Subtle inner glow */}
                      <div className="absolute inset-0 rounded-[11px] bg-gradient-to-br from-primary/[0.02] via-transparent to-violet-500/[0.02] pointer-events-none" />

                      <div className="relative">
                        {/* Normalization Trigger - always visible when financials entered */}
                        {hasFinancials ? (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground/60 mb-1">
                                {mi('fields.normalizedEbitda')}
                              </p>
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">
                                  {formatCurrency(normalizedData.averageNormalizedEbitda)}
                                </span>
                                <span className="text-xs text-foreground/50">
                                  ({normalizedData.totalYearsWithData}{' '}
                                  {normalizedData.totalYearsWithData === 1
                                    ? mi('year')
                                    : mi('years')}
                                  )
                                </span>
                                {normalizedData.years.some((y) => y.totalAdjustment !== 0) &&
                                  (() => {
                                    const yearsWithData = normalizedData.years.filter((y) =>
                                      hasExplicitNumericValue(y.ebitda)
                                    )
                                    const adjSum = yearsWithData.reduce(
                                      (sum, y) =>
                                        sum +
                                        (Number.isFinite(y.totalAdjustment)
                                          ? y.totalAdjustment
                                          : 0),
                                      0
                                    )
                                    const avgAdj =
                                      yearsWithData.length > 0 ? adjSum / yearsWithData.length : 0
                                    const safeAvg = Number.isFinite(avgAdj) ? avgAdj : 0
                                    return (
                                      <span
                                        className={cn(
                                          'text-sm font-medium',
                                          safeAvg > 0
                                            ? 'text-success'
                                            : safeAvg < 0
                                              ? 'text-secondary'
                                              : 'text-foreground/40'
                                        )}
                                      >
                                        {safeAvg > 0 ? '+' : ''}
                                        {formatCurrency(safeAvg)}
                                      </span>
                                    )
                                  })()}
                              </div>
                              {normalizedData.annualFictiveRentDeduction > 0 && (
                                <p className="mt-2 text-[11px] leading-snug text-foreground/45">
                                  {mi('fictiveRentNormalizedFootnote', {
                                    amount: formatCurrency(
                                      normalizedData.annualFictiveRentDeduction
                                    ),
                                  })}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 sm:shrink-0">
                              {(acceptedNormCount > 0 || taxLatencyCount > 0) && (
                                <button
                                  type="button"
                                  onClick={() => onViewAllNormalizations?.()}
                                  className="text-xs font-medium text-foreground/60 hover:text-foreground transition-colors underline underline-offset-2 decoration-foreground/20 hover:decoration-foreground/40 whitespace-nowrap"
                                >
                                  {acceptedNormCount > 0 && taxLatencyCount > 0
                                    ? `${acceptedNormCount} ${mi('normalizations', { count: acceptedNormCount })} · ${tTax('summary', { count: taxLatencyCount })}`
                                    : acceptedNormCount > 0
                                      ? `${acceptedNormCount} ${mi('normalizations', { count: acceptedNormCount })}`
                                      : tTax('summary', { count: taxLatencyCount })}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onViewAllNormalizations?.()}
                                className={cn(
                                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                                  normalizedData.years.some(
                                    (y) =>
                                      y.totalAdjustment !== 0 || (y.fictiveRentDeduction ?? 0) > 0
                                  )
                                    ? 'bg-background border border-foreground/10 text-foreground hover:bg-foreground/[0.02]'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                )}
                              >
                                {normalizedData.years.some(
                                  (y) =>
                                    y.totalAdjustment !== 0 || (y.fictiveRentDeduction ?? 0) > 0
                                )
                                  ? mi('adjust')
                                  : mi('normalize')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/60 leading-relaxed">
                            <span className="text-foreground font-medium">
                              {mi('whyNormalize')}
                            </span>{' '}
                            {mi('whyNormalizeExplanation')}{' '}
                            <span className="text-foreground">{mi('marketConformLevels')}</span>.
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Year-by-year financial input */}
                <div className="space-y-3">
                  {historicalCardRows.map((yearData, index) => {
                    const normalizedYear = normalizedData.years.find(
                      (y) => y.year === yearData.year && !!y.isForecast === !!yearData.isForecast
                    )
                    const normCount = Number(normalizedYear?.normalizationCount ?? 0)
                    const histOffset = getFilingYearHistoricalOffset(
                      yearData.year,
                      baseFilingYearForLabels
                    )
                    const yearLabelForHelp =
                      yearData.isForecast || histOffset === null
                        ? String(yearData.year)
                        : histOffset === 0
                          ? `${yearData.year} (${mi('filingYearColumnBase')})`
                          : `${yearData.year} (${mi('filingYearColumnBaseMinus', { n: histOffset })})`

                    return (
                      <div
                        key={`${yearData.year}-${yearData.isForecast ? 'f' : 'h'}`}
                        className={cn(
                          'p-3 rounded-xl border transition-colors',
                          yearData.isForecast
                            ? 'border-dashed border-primary/20 bg-primary/[0.02]'
                            : partialYears.includes(yearData.year)
                              ? 'border-warning/40 bg-warning/[0.03]'
                              : yearData.ebitda > 0 && yearData.revenue > 0
                                ? 'border-foreground/[0.08] bg-foreground/[0.02]'
                                : 'border-dashed border-foreground/[0.06]'
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-foreground">
                            {yearData.year}
                            {!yearData.isForecast && histOffset === 0 && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                ({mi('filingYearColumnBase')})
                              </span>
                            )}
                            {!yearData.isForecast && histOffset !== null && histOffset > 0 && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                ({mi('filingYearColumnBaseMinus', { n: histOffset })})
                              </span>
                            )}
                            {yearData.isForecast && (
                              <span className="ml-1.5 text-xs font-normal text-primary/60">
                                ({mi('forecastLabel')})
                              </span>
                            )}
                          </span>
                          {(normCount > 0 ||
                            yearData.isForecast ||
                            (!yearData.isForecast &&
                              canRemoveHistoricalYear(formData.yearlyFinancials))) && (
                            <div className="flex items-center gap-2">
                              {normCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onViewAllNormalizations?.()}
                                  className="text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/15 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                >
                                  {normCount} {mi('normalizations', { count: normCount as number })}
                                </button>
                              )}
                              {yearData.isForecast && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      yearlyFinancials: removeForecastYear(
                                        prev.yearlyFinancials,
                                        yearData.year
                                      ),
                                    }))
                                  }
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/15 text-primary/60 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                                  aria-label={`${t('common.actions.delete')} ${mi('forecastLabel').toLowerCase()} ${yearData.year}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {!yearData.isForecast &&
                                canRemoveHistoricalYear(formData.yearlyFinancials) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestRemoveHistoricalYear(String(yearData.year))
                                    }
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-foreground/10 text-foreground/50 transition-colors hover:border-destructive/30 hover:bg-destructive/[0.06] hover:text-destructive"
                                    aria-label={mi('removeHistoricalYearAria', {
                                      year: String(yearData.year),
                                    })}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                            </div>
                          )}
                        </div>

                        <div className={cn('grid gap-3', 'grid-cols-1 sm:grid-cols-2')}>
                          <SpotlightFieldWrapper fieldName="revenue" fiscalYear={yearData.year}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <ProvenanceDot fieldName="revenue" fiscalYear={yearData.year} />
                                <CurrencyInput
                                  label={mi('fields.revenue')}
                                  value={yearData.revenue}
                                  onChange={(v) =>
                                    updateYearlyFinancials(
                                      yearData.year,
                                      !!yearData.isForecast,
                                      'revenue',
                                      v ?? 0
                                    )
                                  }
                                  size="sm"
                                  placeholder="1.500.000"
                                  truncateLabel={false}
                                />
                              </div>
                              {(fieldValidation.warnings[`revenue-${yearData.year}`] ||
                                fieldValidation.errors[`revenue-${yearData.year}`]) && (
                                <p
                                  className={`text-[10px] mt-0.5 ${fieldValidation.errors[`revenue-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}
                                >
                                  {fieldValidation.errors[`revenue-${yearData.year}`] ||
                                    fieldValidation.warnings[`revenue-${yearData.year}`]}
                                </p>
                              )}
                            </div>
                          </SpotlightFieldWrapper>
                          <SpotlightFieldWrapper fieldName="ebitda" fiscalYear={yearData.year}>
                            <div className="relative">
                              <div className="flex items-center gap-1.5">
                                <ProvenanceDot fieldName="ebitda" fiscalYear={yearData.year} />
                                <CurrencyInput
                                  label={mi('fields.ebitda')}
                                  value={yearData.ebitda}
                                  onChange={(v) =>
                                    updateYearlyFinancials(
                                      yearData.year,
                                      !!yearData.isForecast,
                                      'ebitda',
                                      v ?? 0
                                    )
                                  }
                                  size="sm"
                                  placeholder="250.000"
                                  truncateLabel={false}
                                  rightIcon={
                                    <FieldHelpTrigger
                                      context={{
                                        field: 'ebitda',
                                        label: `EBITDA ${yearLabelForHelp}`,
                                        value: yearData.ebitda,
                                        hint: mi('ebitdaRelevantHint'),
                                        normalizationType: 'other',
                                      }}
                                      onTrigger={onFieldHelpRequest}
                                    />
                                  }
                                />
                              </div>
                              {(fieldValidation.warnings[`ebitda-${yearData.year}`] ||
                                fieldValidation.errors[`ebitda-${yearData.year}`] ||
                                fieldValidation.warnings[`margin-${yearData.year}`]) && (
                                <p
                                  className={`text-[10px] mt-0.5 ${fieldValidation.errors[`ebitda-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}
                                >
                                  {fieldValidation.errors[`ebitda-${yearData.year}`] ||
                                    fieldValidation.warnings[`ebitda-${yearData.year}`] ||
                                    fieldValidation.warnings[`margin-${yearData.year}`]}
                                </p>
                              )}
                            </div>
                          </SpotlightFieldWrapper>
                        </div>

                        <NbbResetHint
                          fiscalYear={yearData.year}
                          currentRevenue={yearData.revenue}
                          currentEbitda={yearData.ebitda}
                          onReset={(field, value) =>
                            updateYearlyFinancials(
                              yearData.year,
                              !!yearData.isForecast,
                              field,
                              value
                            )
                          }
                        />

                        {/* Show normalized EBITDA if different (normalizations and/or fictive rent carve-out) */}
                        {hasExplicitNumericValue(yearData.ebitda) &&
                          normalizedYear &&
                          (normalizedYear.totalAdjustment !== 0 ||
                            (normalizedYear.fictiveRentDeduction ?? 0) > 0) && (
                            <div className="mt-2 flex items-center justify-between text-xs gap-2">
                              <span className="text-foreground/50 shrink-0">
                                {mi('fields.normalizedEbitdaLabel')}
                              </span>
                              <span
                                className={cn(
                                  'font-mono font-semibold text-right min-w-0',
                                  normalizedYear.totalAdjustment > 0
                                    ? 'text-success'
                                    : normalizedYear.totalAdjustment < 0
                                      ? 'text-secondary'
                                      : 'text-foreground'
                                )}
                              >
                                {formatCurrency(
                                  Number.isFinite(normalizedYear.normalizedEbitda)
                                    ? normalizedYear.normalizedEbitda
                                    : 0
                                )}
                                <span className="text-foreground/40 ml-1.5 font-normal">
                                  {' '}
                                  (
                                  {normalizedYear.totalAdjustment !== 0 && (
                                    <>
                                      {normalizedYear.totalAdjustment > 0 ? '+' : ''}
                                      {formatCurrency(normalizedYear.totalAdjustment)}{' '}
                                      {mi('fields.adjustmentSuffix')}
                                    </>
                                  )}
                                  {normalizedYear.totalAdjustment !== 0 &&
                                    (normalizedYear.fictiveRentDeduction ?? 0) > 0 &&
                                    ' · '}
                                  {(normalizedYear.fictiveRentDeduction ?? 0) > 0 && (
                                    <>
                                      −{formatCurrency(normalizedYear.fictiveRentDeduction)}{' '}
                                      {mi('fields.fictiveRentInlineLabel')}
                                    </>
                                  )}
                                  )
                                </span>
                              </span>
                            </div>
                          )}
                        {/* Partial year warning */}
                        {partialYears.includes(yearData.year) && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{mi('fillBothFields')}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add Historical Year — directly under historical rows, before DCF forecast workspace */}
                  {canAppendHistoricalYear(formData.yearlyFinancials) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          yearlyFinancials: [
                            ...prev.yearlyFinancials,
                            {
                              year: String(getNextHistoricalYear(prev.yearlyFinancials)),
                              revenue: 0,
                              ebitda: 0,
                            },
                          ],
                        }))
                      }}
                      className="w-full p-3 rounded-xl border border-dashed border-foreground/[0.08] text-sm text-foreground/40 hover:text-foreground/60 hover:border-foreground/[0.15] hover:bg-foreground/[0.02] transition-colors flex items-center justify-center gap-2"
                      aria-label={`${mi('addYear')} ${getNextHistoricalYear(formData.yearlyFinancials)}`}
                    >
                      <Plus className="w-4 h-4" aria-hidden />
                      {mi('addYear')} ({getNextHistoricalYear(formData.yearlyFinancials)})
                    </button>
                  )}

                  {hasDcfSelected &&
                    dcfForecastRows.length > 0 &&
                    adaptiveHeaderSteps.dcfGlobal != null &&
                    terminalValueMethod && (
                      <DcfGlobalAssumptions
                        key="dcf_forecast_defaults_embedded"
                        variant="forecastDefaultsOnly"
                        className="mt-6 rounded-xl border border-primary/10 bg-primary/[0.03] p-4 sm:p-5"
                        step={dcfForecastDefaultsStep}
                        dcfRevenueGrowthPct={formData.dcf_revenue_growth_pct as number | undefined}
                        dcfEbitdaMarginPct={formData.dcf_ebitda_margin_pct as number | undefined}
                        dcfCapexPct={formData.dcf_capex_pct as number | undefined}
                        dcfDaPct={formData.dcf_da_pct as number | undefined}
                        dcfNwcPct={formData.dcf_nwc_pct as number | undefined}
                        dcfTaxRatePct={formData.dcf_tax_rate_pct as number | undefined}
                        dcfWaccPct={formData.dcf_wacc_pct as number | undefined}
                        dcfTerminalGrowthPct={
                          formData.dcf_terminal_growth_pct as number | undefined
                        }
                        dcfExitMultiple={formData.dcf_exit_multiple as number | undefined}
                        dcfRiskFreeRatePct={formData.dcf_risk_free_rate_pct as number | undefined}
                        dcfEquityRiskPremiumPct={
                          formData.dcf_equity_risk_premium_pct as number | undefined
                        }
                        dcfBeta={formData.dcf_beta as number | undefined}
                        dcfCostOfDebtPct={formData.dcf_cost_of_debt_pct as number | undefined}
                        dcfDebtEquityPct={formData.dcf_debt_equity_pct as number | undefined}
                        dcfTaxShieldPct={formData.dcf_tax_shield_pct as number | undefined}
                        terminalValueMethod={terminalValueMethod}
                        onTerminalValueMethodChange={handleTerminalValueMethodChange}
                        onFieldChange={(field, value) => {
                          setFormData((prev) => ({ ...prev, [field]: value }))
                        }}
                        dcfInputMode={formData.dcf_input_mode ?? 'ebitda'}
                        showDcfInputModeToggle
                        dcfModeSegmentOptions={dcfModeSegmentOptions}
                        onDcfInputModeChange={handleDcfInputModeChange}
                        disabled={isCalculating}
                        dcfDefaultsProvenance={dcfDefaultsProvenance}
                      />
                    )}

                  {hasDcfSelected && dcfForecastRows.length > 0 && (
                    <DcfForecastWorkspace
                      step={dcfForecastWorkspaceStep}
                      showModeToggle={false}
                      forecastRows={dcfForecastRows}
                      derivedProjectionPreview={dcfProjectionAutofillRows}
                      latestHistoricalRevenue={latestHistoricalRevenue}
                      latestHistoricalEbitda={latestHistoricalEbitda}
                      fieldValidation={fieldValidation}
                      globalCapexPct={formData.dcf_capex_pct}
                      globalDaPct={formData.dcf_da_pct}
                      globalNwcPct={formData.dcf_nwc_pct}
                      globalTaxRatePct={formData.dcf_tax_rate_pct}
                      disabled={isCalculating}
                      canAddYear={canAppendForecastYear(formData.yearlyFinancials)}
                      nextForecastYear={getNextForecastYear(formData.yearlyFinancials)}
                      dcfInputMode={formData.dcf_input_mode ?? 'ebitda'}
                      onDcfInputModeChange={handleDcfInputModeChange}
                      onChange={(year, field, value) =>
                        updateYearlyFinancials(year, true, field, value)
                      }
                      onAddYear={() => {
                        setFormData((prev) => {
                          const result = appendManualForecastYear(prev.yearlyFinancials)
                          if (!result.ok) {
                            if (result.reason === 'year_out_of_range') {
                              import('sonner').then(({ toast }) =>
                                toast.error(
                                  mi('forecastYearOutOfRange') || 'Forecast year out of range'
                                )
                              )
                            }
                            return prev
                          }
                          return {
                            ...prev,
                            yearlyFinancials: result.yearlyFinancials as YearlyFinancials[],
                          }
                        })
                      }}
                      onRequestRemoveForecastYears={() => setShowForecastRemovalConfirm(true)}
                    />
                  )}

                  {hasDcfSelected &&
                    dcfForecastRows.length > 0 &&
                    adaptiveHeaderSteps.dcfGlobal != null &&
                    terminalValueMethod && (
                      <DcfGlobalAssumptions
                        key="dcf_discount_terminal_embedded"
                        variant="discountTerminalOnly"
                        className="mt-4"
                        step={dcfWaccTerminalStep}
                        dcfRevenueGrowthPct={formData.dcf_revenue_growth_pct as number | undefined}
                        dcfEbitdaMarginPct={formData.dcf_ebitda_margin_pct as number | undefined}
                        dcfCapexPct={formData.dcf_capex_pct as number | undefined}
                        dcfDaPct={formData.dcf_da_pct as number | undefined}
                        dcfNwcPct={formData.dcf_nwc_pct as number | undefined}
                        dcfTaxRatePct={formData.dcf_tax_rate_pct as number | undefined}
                        dcfWaccPct={formData.dcf_wacc_pct as number | undefined}
                        dcfTerminalGrowthPct={
                          formData.dcf_terminal_growth_pct as number | undefined
                        }
                        dcfExitMultiple={formData.dcf_exit_multiple as number | undefined}
                        dcfRiskFreeRatePct={formData.dcf_risk_free_rate_pct as number | undefined}
                        dcfEquityRiskPremiumPct={
                          formData.dcf_equity_risk_premium_pct as number | undefined
                        }
                        dcfBeta={formData.dcf_beta as number | undefined}
                        dcfCostOfDebtPct={formData.dcf_cost_of_debt_pct as number | undefined}
                        dcfDebtEquityPct={formData.dcf_debt_equity_pct as number | undefined}
                        dcfTaxShieldPct={formData.dcf_tax_shield_pct as number | undefined}
                        terminalValueMethod={terminalValueMethod}
                        onTerminalValueMethodChange={handleTerminalValueMethodChange}
                        onFieldChange={(field, value) => {
                          setFormData((prev) => ({ ...prev, [field]: value }))
                        }}
                        dcfInputMode={formData.dcf_input_mode ?? 'ebitda'}
                        disabled={isCalculating}
                      />
                    )}
                </div>
              </motion.section>
            )}

            {/* Real estate carve-out: sibling section after Financiële historie so DCF forecast/WACC content does not bury it */}
            {selectedCompany && hasBusinessType && hasFinancials && (
              <div className="mt-4">
                <RealEstateCarveOutSection
                  step={balanceSheetCarveOutStep}
                  excludeRealEstate={formData.exclude_real_estate}
                  realEstateBookValue={formData.real_estate_book_value}
                  estimatedMarketRent={formData.estimated_market_rent}
                  onToggleChange={(checked) => {
                    setFormData((prev) => ({
                      ...prev,
                      exclude_real_estate: checked,
                      real_estate_book_value: checked ? prev.real_estate_book_value : undefined,
                      estimated_market_rent: checked ? prev.estimated_market_rent : undefined,
                    }))
                  }}
                  onFieldChange={(field, value) => {
                    setFormData((prev) => ({ ...prev, [field]: value }))
                  }}
                  disabled={isCalculating}
                />
              </div>
            )}
            {/* Adaptive method-specific sections (DCF globals, NAV, SaaS, etc.) */}
            <div className="mt-4 flex flex-col gap-6">
              <AdaptiveSections
                effectiveMethod={effectiveMethod}
                effectiveMethods={effectiveMethods}
                businessCategory={resolvedBusinessCategoryForBonusSections ?? undefined}
                businessTypeId={resolvedBusinessTypeIdForBonusSections ?? undefined}
                saasSignals={saasSignalsForBonusSections}
                formData={formData}
                firmCountryCode={user?.firm_country_code}
                previewCurrencyFormatter={panelCurrencyFormatter}
                sectionHeaderSteps={adaptiveHeaderSteps}
                suppressDcfGlobalAssumptions={hasDcfForecastWorkspace}
                onFieldChange={(field, value) => {
                  setFormData((prev) => ({ ...prev, [field]: value }))
                }}
                onViewAllNormalizations={onViewAllNormalizations}
                currentFiscalYear={
                  historicalCardRows.length > 0 ? Number(historicalCardRows[0].year) : undefined
                }
                onApplyDcfPercentAutofill={handleApplyDcfProjectionAutofill}
                canApplyDcfPercentAutofill={canApplyDcfProjectionAutofill}
                terminalValueMethod={terminalValueMethod}
                onTerminalValueMethodChange={handleTerminalValueMethodChange}
                disabled={isCalculating}
              />

              <AnimatePresence>
                {synthesisMethodsForPanel.length >= 2 && (
                  <motion.div
                    ref={synthesisPanelAnchorRef}
                    key="synthesis-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-foreground/[0.06] pt-6">
                      {synthesisUnlocked ? (
                        <SynthesisWeightingSection
                          methods={synthesisMethodsForPanel}
                          weights={synthesisWeights}
                          justification={synthesisJustification}
                          onWeightsChange={onSynthesisWeightsChange ?? (() => {})}
                          onJustificationChange={onSynthesisJustificationChange ?? (() => {})}
                          step={synthesisStep}
                          disabled={isCalculating}
                          valuationResults={synthesisValuationResults}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSynthesisPaywall?.()}
                          aria-label={mi('synthesis.lockedTitle')}
                          className="w-full rounded-xl border border-dashed border-foreground/10 bg-muted/30 p-4 text-center hover:bg-muted/50 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
                        >
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <Lock className="w-3.5 h-3.5 text-foreground/40 group-hover:text-primary transition-colors" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-foreground/40 group-hover:text-primary transition-colors">
                              {mi('synthesis.lockedTitle')}
                            </span>
                          </div>
                          <p className="text-[11px] text-foreground/40">
                            {mi('synthesis.lockedDescription')}
                          </p>
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sticky Bottom CTA - stays visible when scrolling (mobile keyboard) */}
            <div className="sticky bottom-0 z-20 shrink-0 px-6 py-4 -mx-6 -mb-6 border-t border-foreground/[0.06] bg-background mt-auto">
              <AuroraButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isCalculating}
                disabled={!canSubmit}
              >
                {isCalculating ? mi('calculating') : mi('calculateEstimate')}
              </AuroraButton>
              {!canSubmit && (
                <p className="text-center text-xs text-foreground/40 mt-2">
                  {!canSave
                    ? canSaveReason
                    : !hasCompanyInfo
                      ? mi('validation.enterCompanyName')
                      : !hasBusinessType
                        ? mi('validation.selectBusinessType')
                        : mi('validation.enterFinancials')}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* CSV Upload Modal */}
      <Modal open={showCSVUpload} onOpenChange={setShowCSVUpload}>
        <ModalContent className="max-w-2xl">
          <ModalHeader>
            <ModalTitle>{mi('importModal.title')}</ModalTitle>
            <ModalDescription>{mi('importModal.description')}</ModalDescription>
          </ModalHeader>

          <div className="py-4">
            <CSVUploadCard
              onFileSelected={handleCSVFileSelected}
              onSkip={() => setShowCSVUpload(false)}
            />
          </div>
        </ModalContent>
      </Modal>

      <BizzcontrolImportModal
        open={showBizzcontrolImportModal}
        onOpenChange={(open) => {
          setShowBizzcontrolImportModal(open)
          if (!open) setBizzcontrolImportError(null)
        }}
        locale={locale}
        isLoadingCompanies={loadingBizzcontrolCompanies}
        isImporting={importingBizzcontrolBatch}
        error={bizzcontrolImportError}
        companies={bizzcontrolCompanies}
        selectedCompanyId={selectedBizzcontrolCompanyId}
        onSelectedCompanyIdChange={setSelectedBizzcontrolCompanyId}
        historyRange={bizzcontrolHistoryRange}
        onHistoryRangeChange={setBizzcontrolHistoryRange}
        onImport={handleConfirmBizzcontrolImport}
        manualOverride={bizzcontrolManualOverride}
        onManualOverrideChange={setBizzcontrolManualOverride}
      />

      <OctopusImportModal
        open={showOctopusImportModal}
        onOpenChange={(open) => {
          setShowOctopusImportModal(open)
          if (!open) setOctopusImportError(null)
        }}
        locale={locale}
        isLoadingCompanies={loadingOctopusCompanies}
        isImporting={importingOctopusBatch}
        error={octopusImportError}
        companies={octopusCompanies}
        selectedCompanyId={selectedOctopusCompanyId}
        onSelectedCompanyIdChange={setSelectedOctopusCompanyId}
        historyRange={octopusHistoryRange}
        onHistoryRangeChange={setOctopusHistoryRange}
        onImport={handleConfirmOctopusImport}
        manualOverride={octopusManualOverride}
        onManualOverrideChange={setOctopusManualOverride}
      />

      {/* Historical year removal (data / normalizations) */}
      <Modal
        open={historicalYearPendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setHistoricalYearPendingRemove(null)
        }}
      >
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>
              {historicalYearPendingRemove !== null
                ? mi('removeHistoricalYearConfirmTitle', { year: historicalYearPendingRemove })
                : ''}
            </ModalTitle>
            <ModalDescription>
              {historicalYearPendingRemove !== null
                ? mi('removeHistoricalYearConfirmDescription', {
                    year: historicalYearPendingRemove,
                  })
                : ''}
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setHistoricalYearPendingRemove(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-foreground/10 text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (historicalYearPendingRemove !== null) {
                  commitRemoveHistoricalYear(historicalYearPendingRemove)
                }
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              {t('common.actions.confirm')}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Forecast Removal Confirmation Modal */}
      <Modal
        open={showForecastRemovalConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMethod('dcf')
            prevMethodRef.current = 'dcf'
          }
          setShowForecastRemovalConfirm(open)
        }}
      >
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>{mi('removeForecastPrompt')}</ModalTitle>
            <ModalDescription>{mi('removeForecastDescription')}</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setSelectedMethod('dcf')
                prevMethodRef.current = 'dcf'
                setShowForecastRemovalConfirm(false)
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-foreground/10 text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData((current) => ({
                  ...current,
                  yearlyFinancials: removeForecastYears(current.yearlyFinancials),
                }))
                setShowForecastRemovalConfirm(false)
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              {t('common.actions.confirm')}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export function AdaptiveSections({
  effectiveMethod,
  effectiveMethods,
  businessCategory,
  businessTypeId,
  saasSignals,
  formData,
  firmCountryCode,
  previewCurrencyFormatter,
  sectionHeaderSteps,
  suppressDcfGlobalAssumptions,
  onFieldChange,
  onViewAllNormalizations,
  currentFiscalYear,
  onApplyDcfPercentAutofill,
  canApplyDcfPercentAutofill,
  terminalValueMethod,
  onTerminalValueMethodChange,
  disabled,
}: {
  effectiveMethod: string
  effectiveMethods?: string[]
  businessCategory?: string
  businessTypeId?: string
  saasSignals?: GetBonusSectionsSaasSignals | null
  formData: ValuationFormData
  /** When NL, hide Belgian fiscal (4× EBITDA) notices — matches Titan/PDF gating */
  firmCountryCode?: string
  /** Shared with parent `ManualInputPanel` — one `useManualPreviewFormatters` for panel + fiscal notice */
  previewCurrencyFormatter: Intl.NumberFormat
  sectionHeaderSteps: {
    dcfGlobal?: number
    nav?: number
    saas?: number
    revenue?: number
    sde?: number
  }
  /** When true, DCF globals are rendered in ManualInputPanel (forecast defaults first). */
  suppressDcfGlobalAssumptions?: boolean
  onFieldChange: (field: string, value: number | undefined) => void
  onViewAllNormalizations?: () => void
  currentFiscalYear?: number
  onApplyDcfPercentAutofill?: () => void
  canApplyDcfPercentAutofill?: boolean
  terminalValueMethod?: TerminalValueMethod
  onTerminalValueMethodChange?: (method: TerminalValueMethod) => void
  disabled?: boolean
}) {
  const t = useTranslations('manualInput.methodSelector')
  const normalizationItems = useNormalizationStore((s) => s.items)
  const sdeOwnerCompDoubleCountRisk = useMemo(() => {
    if (!formData.owner_salary_addback || formData.owner_salary_addback <= 0) return false
    return normalizationItems.some(
      (n) => n.status === 'accepted' && n.category === 'salary' && Math.abs(n.adjustment) > 0
    )
  }, [formData.owner_salary_addback, normalizationItems])
  const methods = effectiveMethods ?? [effectiveMethod]
  const sections =
    methods.length > 1
      ? getBonusSectionsForMethods(methods, businessCategory, businessTypeId, saasSignals)
      : getBonusSections(effectiveMethod, businessCategory, businessTypeId, saasSignals)
  const latestCompleteYearlyFinancial = useMemo(
    () => getLatestCompleteYearlyFinancial(formData.yearlyFinancials ?? []),
    [formData.yearlyFinancials]
  )

  const fiscalPreview = useMemo(() => {
    const row = latestCompleteYearlyFinancial
    const ebitda =
      row != null && Number.isFinite(Number(row.ebitda)) ? Number(row.ebitda) : undefined
    const be = resolveBookEquityFromYearRow(row ?? undefined)
    return computeFiscal4xPreview({
      countryCode: formData.country?.trim() || 'BE',
      ebitda,
      bookEquity: be,
      sharesForSale: formData.shares_for_sale ?? 100,
    })
  }, [latestCompleteYearlyFinancial, formData.country, formData.shares_for_sale])

  const saasArrProjectionPreview = useMemo(
    () =>
      sections.includes('saas_metrics') && methods.includes('dcf')
        ? deriveSaasArrProjectionPreview({
            yearlyFinancials: formData.yearlyFinancials,
            saasArr: formData.saas_arr as number | undefined,
            saasMrr: formData.saas_mrr as number | undefined,
            saasArrGrowthPct: formData.saas_arr_growth_pct as number | undefined,
            saasNrrPct: formData.saas_nrr_pct as number | undefined,
            saasChurnPct: formData.saas_churn_pct as number | undefined,
            saasExpansionRevenuePct: formData.saas_expansion_revenue_pct as number | undefined,
          })
        : [],
    [
      sections,
      methods,
      formData.yearlyFinancials,
      formData.saas_arr,
      formData.saas_mrr,
      formData.saas_arr_growth_pct,
      formData.saas_nrr_pct,
      formData.saas_churn_pct,
      formData.saas_expansion_revenue_pct,
    ]
  )
  const importedSaasProvenance =
    typeof formData.business_context === 'object' &&
    formData.business_context &&
    '_imported_saas_provenance' in formData.business_context
      ? ((formData.business_context as Record<string, unknown>)._imported_saas_provenance as {
          source?: string
          confidence?: number
          derivation_method?: string
          fiscal_year?: number
        } | null)
      : null
  const saasSectionComplete = useMemo(
    () =>
      ((formData.saas_arr as number | undefined) ?? 0) > 0 ||
      ((formData.saas_mrr as number | undefined) ?? 0) > 0 ||
      formData.saas_arr_growth_pct != null ||
      formData.saas_gross_margin_pct != null,
    [
      formData.saas_arr,
      formData.saas_mrr,
      formData.saas_arr_growth_pct,
      formData.saas_gross_margin_pct,
    ]
  )

  const firmCode = (firmCountryCode ?? 'BE').trim().toUpperCase().substring(0, 2)
  const showFiscalNotice = methods.includes('fiscal_4x') && firmCode !== 'NL'
  const fiscalPreviewUnavailableMessage =
    !fiscalPreview.available && fiscalPreview.unavailableReason
      ? fiscalPreview.unavailableReason === 'non_be'
        ? t('fields.fiscalPreviewUnavailableNonBe')
        : fiscalPreview.unavailableReason === 'non_positive_ebitda'
          ? t('fields.fiscalPreviewUnavailableEbitda')
          : fiscalPreview.unavailableReason === 'missing_ebitda'
            ? t('fields.fiscalPreviewUnavailableMissingEbitda')
            : fiscalPreview.unavailableReason === 'missing_book_equity'
              ? t('fields.fiscalPreviewUnavailableMissingEquity')
              : null
      : null
  if (sections.length === 0 && !showFiscalNotice) return null

  return (
    <>
      <AnimatePresence mode="sync">
        {showFiscalNotice && (
          <motion.div
            key="fiscal_4x_notice"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-3"
          >
            <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.05] px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mr-1 font-medium text-foreground">
                    {t('fiscalDisclaimerTitle')}:
                  </span>
                  {t('fiscalDisclaimerText')}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">
                      {t('sections.fiscalDerivedMetrics')}
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {t('fields.fiscalPreviewFootnote')}
                    </p>
                  </div>
                </div>
                {fiscalPreviewUnavailableMessage && (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {fiscalPreviewUnavailableMessage}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <PreviewMetricCard
                    label={t('fields.fiscalPreviewAnchor')}
                    value={
                      fiscalPreview.fiscalAnchor != null
                        ? previewCurrencyFormatter.format(fiscalPreview.fiscalAnchor)
                        : '—'
                    }
                  />
                  <PreviewMetricCard
                    label={t('fields.fiscalPreviewBookEquity')}
                    value={
                      fiscalPreview.bookEquityUsed != null
                        ? previewCurrencyFormatter.format(fiscalPreview.bookEquityUsed)
                        : '—'
                    }
                  />
                  <PreviewMetricCard
                    label={t('fields.fiscalPreviewOwnershipStake')}
                    value={
                      fiscalPreview.ownershipMultiplierApplied != null
                        ? t('fields.fiscalPreviewOwnershipStakeValue', {
                            pct: Math.round(fiscalPreview.ownershipMultiplierApplied * 100),
                          })
                        : '—'
                    }
                    hint={t('fields.fiscalPreviewOwnershipStakeHint')}
                  />
                  <PreviewMetricCard
                    label={t('fields.fiscalPreviewImpliedEquity')}
                    value={
                      fiscalPreview.impliedFiscalEquity != null
                        ? previewCurrencyFormatter.format(fiscalPreview.impliedFiscalEquity)
                        : '—'
                    }
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {sections.includes('dcf_projections') &&
          !suppressDcfGlobalAssumptions &&
          terminalValueMethod &&
          onTerminalValueMethodChange &&
          sectionHeaderSteps.dcfGlobal != null && (
            <DcfGlobalAssumptions
              key="dcf_global_assumptions"
              className={showFiscalNotice ? 'mt-6' : undefined}
              step={sectionHeaderSteps.dcfGlobal}
              dcfRevenueGrowthPct={formData.dcf_revenue_growth_pct as number | undefined}
              dcfEbitdaMarginPct={formData.dcf_ebitda_margin_pct as number | undefined}
              dcfCapexPct={formData.dcf_capex_pct as number | undefined}
              dcfDaPct={formData.dcf_da_pct as number | undefined}
              dcfNwcPct={formData.dcf_nwc_pct as number | undefined}
              dcfTaxRatePct={formData.dcf_tax_rate_pct as number | undefined}
              dcfWaccPct={formData.dcf_wacc_pct as number | undefined}
              dcfTerminalGrowthPct={formData.dcf_terminal_growth_pct as number | undefined}
              dcfExitMultiple={formData.dcf_exit_multiple as number | undefined}
              dcfRiskFreeRatePct={formData.dcf_risk_free_rate_pct as number | undefined}
              dcfEquityRiskPremiumPct={formData.dcf_equity_risk_premium_pct as number | undefined}
              dcfBeta={formData.dcf_beta as number | undefined}
              dcfCostOfDebtPct={formData.dcf_cost_of_debt_pct as number | undefined}
              dcfDebtEquityPct={formData.dcf_debt_equity_pct as number | undefined}
              dcfTaxShieldPct={formData.dcf_tax_shield_pct as number | undefined}
              terminalValueMethod={terminalValueMethod}
              onTerminalValueMethodChange={onTerminalValueMethodChange}
              onFieldChange={onFieldChange}
              onApplyToForecastYears={onApplyDcfPercentAutofill}
              canApplyToForecastYears={!!canApplyDcfPercentAutofill}
              forecastYearCount={countForecastYears(formData.yearlyFinancials ?? [])}
              dcfInputMode={formData.dcf_input_mode ?? 'ebitda'}
              disabled={disabled}
            />
          )}
        {sections.includes('nav_asset_schedule') && sectionHeaderSteps.nav != null && (
          <NavAssetScheduleSection
            key="nav_asset_schedule"
            step={sectionHeaderSteps.nav}
            navRealEstateAdjustment={formData.nav_real_estate_adjustment as number | undefined}
            navInventoryAdjustment={formData.nav_inventory_adjustment as number | undefined}
            navHiddenReserves={formData.nav_hidden_reserves as number | undefined}
            navGoodwillWriteoff={formData.nav_goodwill_writeoff as number | undefined}
            navReceivablesAdjustment={formData.nav_receivables_adjustment as number | undefined}
            navOtherRevaluations={formData.nav_other_revaluations as number | undefined}
            navTaxLatencyPct={formData.nav_tax_latency_pct as number | undefined}
            navOffBalanceItems={formData.nav_off_balance_items as number | undefined}
            countryCode={formData.country?.trim() || 'BE'}
            totalAssets={
              latestCompleteYearlyFinancial
                ? Number(latestCompleteYearlyFinancial.total_assets)
                : undefined
            }
            totalLiabilities={
              latestCompleteYearlyFinancial
                ? Number(latestCompleteYearlyFinancial.total_liabilities)
                : undefined
            }
            businessType={formData.industry || undefined}
            onFieldChange={onFieldChange}
            disabled={disabled}
          />
        )}
        {sections.includes('saas_metrics') && sectionHeaderSteps.saas != null && (
          <SaasMetricsSection
            key="saas_metrics"
            step={sectionHeaderSteps.saas}
            complete={saasSectionComplete}
            saasArr={formData.saas_arr as number | undefined}
            saasMrr={formData.saas_mrr as number | undefined}
            saasArrGrowthPct={formData.saas_arr_growth_pct as number | undefined}
            saasChurnPct={formData.saas_churn_pct as number | undefined}
            saasCustomerChurnPct={formData.saas_customer_churn_pct as number | undefined}
            saasNrrPct={formData.saas_nrr_pct as number | undefined}
            saasGrossMarginPct={formData.saas_gross_margin_pct as number | undefined}
            saasCac={formData.saas_cac as number | undefined}
            saasCustomerConcentrationPct={
              formData.saas_customer_concentration_pct as number | undefined
            }
            saasExpansionRevenuePct={formData.saas_expansion_revenue_pct as number | undefined}
            saasSmSpend={formData.saas_sm_spend as number | undefined}
            onFieldChange={onFieldChange}
            disabled={disabled}
            arrProjectionPreview={saasArrProjectionPreview}
            importedSaasProvenance={importedSaasProvenance}
          />
        )}
        {sections.includes('revenue_quality') && sectionHeaderSteps.revenue != null && (
          <RevenueQualitySection
            key="revenue_quality"
            step={sectionHeaderSteps.revenue}
            revContractBacklog={formData.rev_contract_backlog as number | undefined}
            revRecurringAmount={formData.rev_recurring_amount as number | undefined}
            revTopClientAmount={formData.rev_top_client_amount as number | undefined}
            revGrossChurnPct={formData.rev_gross_churn_pct as number | undefined}
            revCapitalizedRdAmount={formData.rev_capitalized_rd_amount as number | undefined}
            latestRevenue={
              latestCompleteYearlyFinancial
                ? Number(latestCompleteYearlyFinancial.revenue)
                : undefined
            }
            effectiveMethods={methods}
            businessTypeId={businessTypeId}
            businessCategory={businessCategory}
            onFieldChange={onFieldChange}
            disabled={disabled}
          />
        )}
        {sections.includes('sde_owner_compensation') && sectionHeaderSteps.sde != null && (
          <>
            {sdeOwnerCompDoubleCountRisk && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-1 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Owner compensation is set as both an SDE add-back and an EBITDA normalization.
                    This may double-count the adjustment. Consider removing one.
                  </span>
                </div>
              </motion.div>
            )}
            <SdeOwnerCompensationSection
              key="sde_owner_compensation"
              step={sectionHeaderSteps.sde}
              ownerSalaryAddback={formData.owner_salary_addback as number | undefined}
              revenue={
                latestCompleteYearlyFinancial
                  ? Number(latestCompleteYearlyFinancial.revenue)
                  : undefined
              }
              ebitda={
                latestCompleteYearlyFinancial
                  ? Number(latestCompleteYearlyFinancial.ebitda)
                  : undefined
              }
              onFieldChange={onFieldChange}
              disabled={disabled}
            />
          </>
        )}
      </AnimatePresence>
      {process.env.NODE_ENV === 'development' && (
        <Suspense fallback={null}>
          <MethodPreviewAuditDevPanel />
        </Suspense>
      )}
    </>
  )
}
