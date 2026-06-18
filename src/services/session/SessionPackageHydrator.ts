import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationModal'
import {
  SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  sanitizePreSelectedValuationMethod,
  sessionHasStoredPreSelectedMethod,
} from '../../constants/sessionUiKeys'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { type ImportQualityPerYear, useImportQualityStore } from '../../store/useImportQualityStore'
import {
  recoverPendingNormalizations,
  useNormalizationStore,
} from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import {
  recoverPendingTaxLatencies,
  type TaxLatencyItem,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import type { BuyerReadinessPackage } from '../../types/buyerReadiness'
import type { ValuationFormData, ValuationResponse, ValuationSession } from '../../types/valuation'
import {
  type FormSnapshotForRevenueNav,
  parseCurrentYearRevenueForMethodNav,
} from '../../utils/currentYearRevenueForMethodNav'
import { hydrateClientValuationResultsMap } from '../../utils/extractValuationResultsMap'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../utils/fiscalYear'
import {
  buildNormalizationItemsFromImportedLedgerAnalysis,
  buildReportedEbitdaByYearFromFormRecords,
  type ImportedLedgerAnalysisLike,
  normalizeImportedLedgerReviewStatuses,
} from '../../utils/importedLedgerNormalization'
import {
  buildTaxLatencyCandidatesFromImportedLedgerAnalysis,
  type ImportedLedgerTaxLatencyAnalysisLike,
} from '../../utils/importedLedgerTaxLatencies'
import { generalLogger } from '../../utils/logger'
import {
  buildOptionalSessionGapFillPatch,
  mergeSessionSurfaceForOptionalPrefill,
} from '../../utils/mergeOptionalSessionPrefillFields'
import { markMercurySessionPrefillSuppressed } from '../../utils/prefillRestorationGate'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { seedNbbPrefillFromFormData } from './SessionNbbPrefillHydrator'

export interface SessionHydrationPackage {
  htmlReport: string | null
  pricingRange: { min: number; mid: number; max: number; currency: string } | null
  versions: {
    current: number
    total: number
    history?: Array<{
      version: number
      createdAt: Date
      summary: string | null
      createdBy: string | null
    }>
  }
  pdf: { url: string | null; status: 'ready' | 'generating' | 'none' }
  formData?: Record<string, unknown>
  buyerReadiness?: BuyerReadinessPackage
}

interface VersionStub {
  id: string
  reportId: string
  versionNumber: number
  versionLabel: string
  createdAt: Date
  createdBy: string | null
  formData: Record<string, unknown>
  valuationResult: null
  htmlReport: null
  changesSummary: { totalChanges: number; sections: never[]; fields: never[] }
  isActive: boolean
  isPinned: boolean
  notes: string | null
}

interface PackageHydrationOptions {
  reportId: string
  pkg: SessionHydrationPackage
  flow?: 'manual' | 'conversational'
  onRestored: (reportId: string) => void
}

const PACKAGE_CAMEL_TO_SNAKE: Record<string, string> = {
  companyName: 'company_name',
  kboNumber: 'kbo_number',
  vatNumber: 'vat_number',
  businessTypeId: 'business_type_id',
  businessTypeSegments: 'business_type_segments',
  businessTypeMix: 'business_type_mix',
  businessTypeWeights: 'business_type_weights',
  businessDescription: 'business_description',
  subIndustry: 'subIndustry',
  employeeCount: 'number_of_employees',
  numberOfEmployees: 'number_of_employees',
  employees: 'employees',
  foundingYear: 'founding_year',
  filingYearConfirmed: 'filing_year_confirmed',
  countryCode: 'country_code',
  postalCode: 'postal_code',
  netIncome: 'net_income',
  historicalYearsData: 'historical_years_data',
  forecastYearsData: 'forecast_years_data',
  dcfDiscountingConvention: 'dcf_discounting_convention',
  dcfTaxShieldProjections: 'dcf_tax_shield_projections',
  currentYearData: 'current_year_data',
  naceCode: 'nace_code',
  naceDescription: 'nace_description',
  canonicalNaceCode: 'canonical_nace_code',
  activityCode: 'activity_code',
  activityLabel: 'activity_label',
  businessContext: 'business_context',
  officialFinancials: 'official_financials',
  officialVarianceAnalysis: 'official_variance_analysis',
  officialVerificationBadge: 'official_verification_badge',
  legalForm: 'legal_form',
}

function mapPackageFormData(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const snakeKey = PACKAGE_CAMEL_TO_SNAKE[key] ?? key
    if (snakeKey === '_businessInfo' || snakeKey === 'businessInfo') continue
    if (snakeKey.startsWith('_bootstrap')) continue
    const current = mapped[snakeKey]
    if (
      current !== undefined &&
      current !== null &&
      !(typeof current === 'string' && current.trim() === '') &&
      (value === null || (typeof value === 'string' && value.trim() === ''))
    ) {
      continue
    }
    mapped[snakeKey] = value
  }

  const mappedCurrentYearData = mapped.current_year_data as
    | { year?: number; revenue?: number; ebitda?: number }
    | undefined
  if (mappedCurrentYearData && typeof mappedCurrentYearData === 'object') {
    mapped.current_year_data = {
      ...mappedCurrentYearData,
      year: normalizeCurrentYearForFiling(mappedCurrentYearData.year, mapped.filing_year_confirmed),
    }
  }

  if (Array.isArray(mapped.historical_years_data)) {
    mapped.historical_years_data = normalizeHistoricalYearsForFiling(
      mapped.historical_years_data as Array<{
        year: number
        revenue?: number
        ebitda?: number
      }>,
      mapped.filing_year_confirmed
    )
  }

  return mapped
}

function hydrateTaxLatenciesFromPackage(reportId: string, raw: Record<string, unknown>): void {
  try {
    const recoveredTL = recoverPendingTaxLatencies(reportId)
    if (recoveredTL && recoveredTL.length > 0) {
      useTaxLatencyStore.getState().setItems(recoveredTL, { source: 'system' })
      return
    }

    const rawTaxLatencies =
      (raw as { _taxLatencies?: unknown })._taxLatencies ??
      (raw as { tax_latencies?: unknown }).tax_latencies ??
      (raw as { taxLatencies?: unknown }).taxLatencies
    if (Array.isArray(rawTaxLatencies)) {
      useTaxLatencyStore.getState().setItems(rawTaxLatencies as TaxLatencyItem[], {
        source: 'system',
      })
    }
  } catch {
    // Non-critical
  }
}

function buildReportedEbitdaByYearFromPackageRaw(
  raw: Record<string, unknown>,
  fallbackYear?: number
): Record<number, number> {
  const currentYearData = (raw.current_year_data ?? raw.currentYearData) as
    | { year?: number; ebitda?: number }
    | undefined
  const historicalYearsData = (raw.historical_years_data ?? raw.historicalYearsData) as
    | Array<{ year?: number; ebitda?: number }>
    | undefined
  const yearlyFinancials = (raw.yearlyFinancials ?? raw.yearly_financials) as
    | Array<{ year?: number | string; ebitda?: number; isForecast?: boolean }>
    | undefined
  const rawYearData = raw.year_data ?? raw.yearData
  const yearData =
    rawYearData && typeof rawYearData === 'object' && !Array.isArray(rawYearData)
      ? (rawYearData as Record<string | number, { ebitda?: number }>)
      : undefined

  return buildReportedEbitdaByYearFromFormRecords({
    currentYearData,
    historicalYearsData: Array.isArray(historicalYearsData) ? historicalYearsData : undefined,
    yearlyFinancials: Array.isArray(yearlyFinancials) ? yearlyFinancials : undefined,
    yearData,
    fallbackYear,
    fallbackEbitda: Number(raw.ebitda),
  })
}

function hydrateNormalizationsFromPackage(reportId: string, raw: Record<string, unknown>): void {
  try {
    const businessContext = (raw.business_context ?? raw.businessContext) as
      | Record<string, unknown>
      | undefined
    const analysis = (businessContext?._imported_ledger_analysis ??
      raw._imported_ledger_analysis) as ImportedLedgerAnalysisLike | undefined
    const reportedEbitdaByYear = buildReportedEbitdaByYearFromPackageRaw(
      raw,
      analysis?.latest_fiscal_year
    )
    const recoveredNorm = recoverPendingNormalizations(reportId)
    if (recoveredNorm && recoveredNorm.length > 0) {
      useNormalizationStore
        .getState()
        .setItems(normalizeImportedLedgerReviewStatuses(recoveredNorm, reportedEbitdaByYear))
      return
    }

    const rawNormalizations =
      (raw as { _normalizations?: unknown })._normalizations ??
      (raw as { normalizations?: unknown }).normalizations
    if (Array.isArray(rawNormalizations) && rawNormalizations.length > 0) {
      useNormalizationStore
        .getState()
        .setItems(
          normalizeImportedLedgerReviewStatuses(
            rawNormalizations as NormalizationItem[],
            reportedEbitdaByYear
          )
        )
    }
  } catch {
    // Non-critical
  }
}

function hydrateImportQualityFromPackage(raw: Record<string, unknown>): void {
  try {
    const rawImportQuality =
      (raw as { _import_quality?: unknown })._import_quality ??
      (raw as { import_quality?: unknown }).import_quality ??
      (raw as { importQuality?: unknown }).importQuality
    if (rawImportQuality && typeof rawImportQuality === 'object') {
      const bc = (raw.business_context ?? raw.businessContext) as
        | Record<string, unknown>
        | undefined
      const prov = (bc?._imported_ledger_provenance as { provider?: unknown } | undefined)?.provider
      useImportQualityStore
        .getState()
        .setImportQuality(rawImportQuality as Record<string, ImportQualityPerYear>, {
          provider: typeof prov === 'string' ? prov : null,
        })
    }
  } catch {
    // Non-critical
  }
}

function seedImportedLedgerAnalysisFromPackage(raw: Record<string, unknown>): void {
  try {
    const ns = useNormalizationStore.getState()
    useTaxLatencyStore.getState().setCandidates([])
    const bc = (raw.business_context ?? raw.businessContext) as Record<string, unknown> | undefined
    const analysis = bc?._imported_ledger_analysis ?? raw._imported_ledger_analysis
    if (analysis && typeof analysis === 'object') {
      if (ns.items.length === 0) {
        const items = buildNormalizationItemsFromImportedLedgerAnalysis({
          ...(analysis as ImportedLedgerAnalysisLike),
          reported_ebitda_by_year: buildReportedEbitdaByYearFromPackageRaw(
            raw,
            (analysis as ImportedLedgerAnalysisLike).latest_fiscal_year
          ),
        })
        if (items.length > 0) {
          ns.addItems(items)
        }
      }
      const taxLatencyCandidates = buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
        analysis as ImportedLedgerTaxLatencyAnalysisLike
      )
      useTaxLatencyStore.getState().setCandidates(taxLatencyCandidates)
    }
  } catch {
    // Non-critical
  }
}

function hydrateFormStoresFromPackage(reportId: string, formData: Record<string, unknown>): void {
  const { updateFormData } = useManualFormStore.getState()
  const raw = mergeSessionSurfaceForOptionalPrefill(formData)
  const mapped = mapPackageFormData(raw)

  updateFormData(mapped as Partial<ValuationFormData>)
  const gapPatch = buildOptionalSessionGapFillPatch(
    formData,
    useManualFormStore.getState().formData
  )
  if (Object.keys(gapPatch).length > 0) {
    updateFormData(gapPatch as Partial<ValuationFormData>)
    generalLogger.debug('[SessionRestoration] Package envelope gap-fill after map', {
      reportId: reportId.substring(0, 30),
      keys: Object.keys(gapPatch),
    })
  }

  seedNbbPrefillFromFormData(
    useManualFormStore.getState().formData as unknown as Record<string, unknown>,
    reportId,
    'package'
  )
  markMercurySessionPrefillSuppressed(reportId)

  hydrateTaxLatenciesFromPackage(reportId, raw)
  hydrateNormalizationsFromPackage(reportId, raw)
  hydrateImportQualityFromPackage(raw)
  seedImportedLedgerAnalysisFromPackage(raw)

  generalLogger.info('[SessionRestoration] Form data hydrated from package', {
    reportId: reportId.substring(0, 30),
    fieldCount: Object.keys(mapped).length,
  })
}

function hydrateManualResultFromPackage(
  reportId: string,
  pkg: SessionHydrationPackage,
  pricingResult: Record<string, unknown>
): void {
  const manualStore = useManualResultsStore.getState()
  const existingResult = manualStore.result || {}
  const pkgRenderableHtml = getFirstRenderableReportHtml(pkg.htmlReport)
  const fullResult = {
    valuation_id: reportId,
    ...pricingResult,
    html_report: pkgRenderableHtml,
    valuation_results: hydrateClientValuationResultsMap(existingResult) ?? undefined,
  }
  manualStore.setResult({
    ...existingResult,
    ...fullResult,
  } as ValuationResponse)
  if (pkgRenderableHtml) manualStore.setHtmlReport(pkgRenderableHtml)

  const mergedAfterSet = useManualResultsStore.getState().result as Record<string, unknown> | null
  if (
    mergedAfterSet &&
    !(mergedAfterSet as { selected_valuation_method?: string }).selected_valuation_method &&
    pkg.formData &&
    typeof pkg.formData === 'object'
  ) {
    const rawPkg = pkg.formData as Record<string, unknown>
    if (sessionHasStoredPreSelectedMethod(rawPkg)) {
      const v =
        rawPkg[SESSION_PRE_SELECTED_VALUATION_METHOD_KEY] ??
        rawPkg[SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY]
      if (v === null) {
        useManualResultsStore.getState().setPreSelectedMethod(null)
      } else if (typeof v === 'string') {
        const revFromForm = parseCurrentYearRevenueForMethodNav(
          pkg.formData as FormSnapshotForRevenueNav
        )
        const parsed = sanitizePreSelectedValuationMethod(v, null, revFromForm)
        useManualResultsStore.getState().setPreSelectedMethod(parsed)
      }
    }
  }

  try {
    if (typeof window !== 'undefined') {
      const session = useSessionStore.getState().session
      if (session) {
        const sessionDataPatch = {
          ...(session.sessionData || {}),
          pdfUrl: pkg.pdf?.url || undefined,
          ...(pkg.buyerReadiness ? { _buyerReadiness: pkg.buyerReadiness } : {}),
        } as Partial<ValuationSession>['sessionData']

        useSessionStore.getState().hydrateSession({
          htmlReport: getFirstRenderableReportHtml(pkg.htmlReport) || undefined,
          valuationResult: { ...existingResult, ...fullResult } as ValuationResponse,
          ...(pkg.buyerReadiness ? { buyerReadiness: pkg.buyerReadiness } : {}),
          sessionData: sessionDataPatch,
        } satisfies Partial<ValuationSession>)
      }
    }
  } catch {
    // Non-critical: session may not be loaded yet
  }
}

function hydrateVersionHistoryFromPackage(reportId: string, pkg: SessionHydrationPackage): void {
  if (!pkg.versions.history || pkg.versions.history.length === 0) return

  const versionStore = useVersionHistoryStore.getState()
  const versions: VersionStub[] = pkg.versions.history.map((version) => ({
    id: `pkg-${reportId}-v${version.version}`,
    reportId,
    versionNumber: version.version,
    versionLabel: `Version ${version.version}`,
    createdAt: new Date(version.createdAt),
    createdBy: version.createdBy,
    formData: {},
    valuationResult: null,
    htmlReport: null,
    changesSummary: { totalChanges: 0, sections: [], fields: [] },
    isActive: version.version === pkg.versions.current,
    isPinned: false,
    notes: version.summary,
  }))

  const existingVersions = versionStore.versions[reportId] || []
  const mergedVersions: VersionStub[] = [...versions]

  existingVersions.forEach((version) => {
    if (
      !mergedVersions.find(
        (packageVersion) => packageVersion.versionNumber === version.versionNumber
      )
    ) {
      mergedVersions.push(version as unknown as VersionStub)
    }
  })

  mergedVersions.sort((a, b) => b.versionNumber - a.versionNumber)
  versionStore.versions[reportId] = mergedVersions as unknown as typeof existingVersions

  generalLogger.debug('[SessionRestoration] Hydrated version history from package', {
    reportId: reportId.substring(0, 30),
    versionCount: versions.length,
    total: pkg.versions.total,
  })
}

export function hydrateSessionFromPackage({
  reportId,
  pkg,
  flow = 'manual',
  onRestored,
}: PackageHydrationOptions): void {
  const startTime = performance.now()

  generalLogger.info('[SessionRestoration] WORLD-CLASS: Instant hydration from package', {
    reportId: reportId.substring(0, 30),
    hasHtmlReport: !!pkg.htmlReport,
    hasPricing: !!pkg.pricingRange,
    formFieldCount: pkg.formData ? Object.keys(pkg.formData).length : 0,
    versionCount: pkg.versions.total,
    pdfStatus: pkg.pdf.status,
    hasBuyerReadiness: !!pkg.buyerReadiness,
  })

  try {
    if (flow === 'manual' && pkg.formData && Object.keys(pkg.formData).length > 0) {
      try {
        hydrateFormStoresFromPackage(reportId, pkg.formData)
      } catch (formError) {
        generalLogger.warn(
          '[SessionRestoration] Form hydration from package failed (non-critical)',
          {
            error: formError instanceof Error ? formError.message : String(formError),
          }
        )
      }
    }

    const pricingResult = pkg.pricingRange
      ? {
          equity_value_low: pkg.pricingRange.min,
          equity_value_mid: pkg.pricingRange.mid,
          equity_value_high: pkg.pricingRange.max,
          currency: pkg.pricingRange.currency,
        }
      : {}

    if (flow === 'manual') {
      hydrateManualResultFromPackage(reportId, pkg, pricingResult)
    } else {
      generalLogger.debug(
        '[SessionRestoration] Skipping conversational hydration - stores removed',
        {
          reportId: reportId.substring(0, 30),
        }
      )
    }

    hydrateVersionHistoryFromPackage(reportId, pkg)

    onRestored(reportId)
    useSessionStore.getState().setRestorationComplete(true)

    const durationMs = performance.now() - startTime
    generalLogger.info('[SessionRestoration] WORLD-CLASS: Instant hydration complete', {
      reportId: reportId.substring(0, 30),
      durationMs: Math.round(durationMs),
    })
  } catch (error) {
    generalLogger.error('[SessionRestoration] Package hydration failed', {
      reportId: reportId.substring(0, 30),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
