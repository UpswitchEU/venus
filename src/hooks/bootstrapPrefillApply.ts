import { buildBusinessTypeFormData } from '../components/ValuationForm/utils/businessTypeFormData'
import type {
  BusinessTypeInfo,
  CompanyInfo,
  PartialFinancials,
  PrefillData,
} from '../lib/bootstrap/types'
import { isLegalFormBusinessTypeValue } from '../services/naceBusinessTypeService'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { type ImportQualityPerYear, useImportQualityStore } from '../store/useImportQualityStore'
import { useNbbPrefillStore } from '../store/useNbbPrefillStore'
import { useNormalizationStore } from '../store/useNormalizationStore'
import { useSessionStore } from '../store/useSessionStore'
import { useTaxLatencyStore } from '../store/useTaxLatencyStore'
import type { ValuationFormData } from '../types/valuation'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import { getCurrentFilingYear, normalizeHistoricalYearsForFiling } from '../utils/fiscalYear'
import {
  buildNormalizationItemsFromImportedLedgerAnalysis,
  buildReportedEbitdaByYearFromFormRecords,
  normalizeImportedLedgerReviewStatuses,
} from '../utils/importedLedgerNormalization'
import { buildTaxLatencyCandidatesFromImportedLedgerAnalysis } from '../utils/importedLedgerTaxLatencies'
import { createContextLogger } from '../utils/logger'
import {
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
} from '../utils/mergeOptionalSessionPrefillFields'
import { hasUsableOfficialFinancialsContent } from '../utils/officialFinancialsContent'
import {
  shouldBlockUntrustedFinancialPrefill,
  stripUntrustedOperatingFinancialPrefill,
} from '../utils/officialValuationInputPolicy'
import { SESSION_BUSINESS_CARD_CLEAR_KEYS } from '../utils/optionalSessionPrefillKeys'
import { formatBootstrapCompanyAddress } from '../utils/registryCompanyDisplay'
import { hasConflictingRegistryIdentity } from '../utils/registryIdentity'
import { buildBusinessCard } from './bootstrapPrefillBusinessCard'
import {
  type BootstrapPrefillPatch,
  getRecordNumber,
  getRecordString,
  type ManualBusinessCard,
  readNormalizationItems,
  readTaxLatencyItems,
  resolveCountryCode,
  toTaxLatencyFormInput,
} from './bootstrapPrefillGuards'

const logger = createContextLogger('BootstrapPrefill')

function removeBusinessCardFields<T extends object>(value: T): T {
  const next = { ...value } as Record<string, unknown>
  for (const key of SESSION_BUSINESS_CARD_CLEAR_KEYS) {
    delete next[key]
  }
  return next as T
}

/**
 * Apply bootstrap prefill data to form stores.
 *
 * Keeps the data-mapping pipeline outside the React hook so the hook only owns
 * lifecycle scheduling and this module owns field translation/store hydration.
 */
export function applyBootstrapPrefillToForm(
  prefillData: PrefillData,
  updateFormData: (data: Partial<ValuationFormData>) => void,
  prefillFromBusinessCard: (card: ManualBusinessCard) => void
): void {
  const { companyInfo, financials, businessType, kboData, officialFinancials } = prefillData

  logger.debug('applyPrefillToForm called', {
    hasCompanyInfo: !!companyInfo,
    companyInfoCompanyName: companyInfo?.companyName?.substring(0, 30),
    companyInfoCompanyNameType: typeof companyInfo?.companyName,
    companyInfoCompanyNameIsEmpty: companyInfo?.companyName === '',
    companyInfoKeys: companyInfo ? Object.keys(companyInfo).slice(0, 10) : [],
    hasKboData: !!kboData,
    kboDataCompanyName: kboData?.companyName?.substring(0, 30),
    hasBusinessType: !!businessType,
    sources: prefillData.sources,
    prefillConfidence: prefillData.confidence,
    fieldsPopulated: prefillData.fieldsPopulated.slice(0, 10),
  })

  const allData: BootstrapPrefillPatch = {}

  if (prefillData.companyGraphContext) {
    allData.company_graph_context = prefillData.companyGraphContext
  }

  if (companyInfo) {
    if (companyInfo.companyName && companyInfo.companyName.trim() !== '') {
      allData.company_name = companyInfo.companyName
      logger.debug('Set company_name from companyInfo', {
        company_name: companyInfo.companyName.substring(0, 30),
      })
    }
    if (companyInfo.countryCode) allData.country_code = companyInfo.countryCode
    if (companyInfo.foundingYear) allData.founding_year = companyInfo.foundingYear
    if (companyInfo.city) allData.city = companyInfo.city
    if (companyInfo.postalCode) allData.postal_code = companyInfo.postalCode
    if (companyInfo.legalForm) allData.legal_form = companyInfo.legalForm

    if (companyInfo.kboNumber) allData.kbo_number = companyInfo.kboNumber
    if (companyInfo.vatNumber) allData.vat_number = companyInfo.vatNumber
    if (companyInfo.naceCode) allData.nace_code = companyInfo.naceCode
    if (companyInfo.naceDescription) allData.nace_description = companyInfo.naceDescription
    if (companyInfo.activityCode) allData.activity_code = companyInfo.activityCode
    if (companyInfo.activityLabel) allData.activity_label = companyInfo.activityLabel

    if (companyInfo.kboNumber) {
      allData.business_context = {
        ...(allData.business_context || {}),
        kbo_registration: companyInfo.kboNumber,
        kbo_registration_number: companyInfo.kboNumber,
        legal_form: companyInfo.legalForm || allData.business_context?.legal_form,
        company_id: companyInfo.kboNumber,
        company_address:
          formatBootstrapCompanyAddress({
            address: companyInfo.address,
            postalCode: companyInfo.postalCode,
            city: companyInfo.city,
          }) || allData.business_context?.company_address,
        company_status: 'Active',
        kbo_verified: true,
      }
      logger.debug('Set business_context from companyInfo KBO data', {
        kbo_registration: companyInfo.kboNumber,
        legal_form: companyInfo.legalForm,
      })
    }
  }

  if (kboData) {
    if (kboData.kboNumber && !allData.kbo_number) allData.kbo_number = kboData.kboNumber
    if (kboData.vatNumber && !allData.vat_number) allData.vat_number = kboData.vatNumber
    if (kboData.legalForm && !allData.legal_form) allData.legal_form = kboData.legalForm
    if (kboData.city && !allData.city) allData.city = kboData.city
    if (kboData.postalCode && !allData.postal_code) allData.postal_code = kboData.postalCode
    if (kboData.naceCode && !allData.nace_code) allData.nace_code = kboData.naceCode
    if (kboData.naceDescription && !allData.nace_description)
      allData.nace_description = kboData.naceDescription
    if (kboData.activityCode && !allData.activity_code) allData.activity_code = kboData.activityCode
    if (kboData.activityLabel && !allData.activity_label)
      allData.activity_label = kboData.activityLabel
    if (kboData.companyName && kboData.companyName.trim() !== '' && !allData.company_name) {
      allData.company_name = kboData.companyName
      logger.debug('Set company_name from kboData', {
        company_name: kboData.companyName.substring(0, 30),
      })
    }
    if (kboData.countryCode && !allData.country_code) allData.country_code = kboData.countryCode

    allData.business_context = {
      ...(allData.business_context || {}),
      kbo_registration: kboData.kboNumber || allData.business_context?.kbo_registration,
      kbo_registration_number:
        kboData.kboNumber || allData.business_context?.kbo_registration_number,
      legal_form: kboData.legalForm || allData.business_context?.legal_form,
      company_id: kboData.kboNumber || allData.business_context?.company_id,
      company_status: kboData.status || allData.business_context?.company_status || 'Active',
      company_address:
        formatBootstrapCompanyAddress({
          address: kboData.address,
          postalCode: kboData.postalCode,
          city: kboData.city,
        }) || allData.business_context?.company_address,
      kbo_verified: true,
    }
    logger.debug('Set business_context from kboData', {
      kbo_registration: kboData.kboNumber,
      legal_form: kboData.legalForm,
    })
  }

  const authoritativeCountryCode = resolveCountryCode(
    allData.country_code,
    companyInfo?.countryCode,
    kboData?.countryCode
  )
  if (authoritativeCountryCode) {
    allData.country_code = authoritativeCountryCode
  }

  const blockUntrustedFinancialPrefill = shouldBlockUntrustedFinancialPrefill(
    officialFinancials,
    financials?.dataSource
  )

  applyFinancialPrefill(allData, blockUntrustedFinancialPrefill ? undefined : financials)
  applyOfficialFinancialsPrefill(allData, officialFinancials)
  applyBusinessTypePrefill(allData, businessType)
  ensureCompanyName(allData, companyInfo, kboData)
  applySessionFallbackPrefill(allData, blockUntrustedFinancialPrefill)

  if (Object.keys(allData).length > 0) {
    logger.debug('Applying prefill data to form', {
      fieldsCount: Object.keys(allData).length,
      fields: Object.keys(allData),
      company_name: allData.company_name?.substring(0, 30),
      hasKboNumber: !!allData.kbo_number,
      kboNumber: allData.kbo_number,
      hasBusinessContext: !!allData.business_context,
      businessContextKboRegistration: allData.business_context?.kbo_registration,
      businessContextKboRegistrationNumber: allData.business_context?.kbo_registration_number,
      businessContextLegalForm: allData.business_context?.legal_form,
      businessContextKboVerified: allData.business_context?.kbo_verified,
      businessContextCompanyId: allData.business_context?.company_id,
    })

    updateFormData(allData)
  }

  const finalCompanyName = allData.company_name || companyInfo?.companyName || kboData?.companyName
  if (finalCompanyName && finalCompanyName.trim() !== '') {
    const businessCard = buildBusinessCard(
      { ...companyInfo, companyName: finalCompanyName } as CompanyInfo,
      financials,
      businessType,
      authoritativeCountryCode
    )
    prefillFromBusinessCard(businessCard)
    logger.debug('Called prefillFromBusinessCard', {
      company_name: finalCompanyName.substring(0, 30),
    })
  } else {
    logger.warn('Skipping prefillFromBusinessCard - no company name available', {
      hasCompanyInfo: !!companyInfo,
      hasKboData: !!kboData,
      companyInfoCompanyName: companyInfo?.companyName?.substring(0, 20),
      kboDataCompanyName: kboData?.companyName?.substring(0, 20),
    })
  }
}

function applyFinancialPrefill(
  allData: BootstrapPrefillPatch,
  financials: PrefillData['financials']
): void {
  if (!financials) return

  if (financials.revenue !== undefined) allData.revenue = financials.revenue
  if (financials.ebitda !== undefined) allData.ebitda = financials.ebitda
  if (financials.employeeCount !== undefined) allData.number_of_employees = financials.employeeCount
  if (financials.yearData) allData.year_data = financials.yearData
  if (financials.importedLedgerAnalysis) {
    allData.business_context = {
      ...(allData.business_context || {}),
      _imported_ledger_analysis: financials.importedLedgerAnalysis,
    }

    const importedNormalizationItems = buildNormalizationItemsFromImportedLedgerAnalysis({
      ...financials.importedLedgerAnalysis,
      reported_ebitda_by_year: buildReportedEbitdaByYearFromFormRecords({
        currentYearData: allData.current_year_data as { year?: number; ebitda?: number },
        historicalYearsData: allData.historical_years_data as
          | Array<{ year?: number; ebitda?: number }>
          | undefined,
        yearlyFinancials: allData.yearlyFinancials as
          | Array<{ year?: number | string; ebitda?: number; isForecast?: boolean }>
          | undefined,
        yearData: financials.yearData,
        fallbackYear:
          financials.importedLedgerAnalysis.latest_fiscal_year ?? getCurrentFilingYear(),
        fallbackEbitda: financials.ebitda,
      }),
    })
    if (importedNormalizationItems.length > 0) {
      useNormalizationStore.getState().addItems(importedNormalizationItems)
    }

    const importedTaxLatencyCandidates = buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
      financials.importedLedgerAnalysis
    )
    useTaxLatencyStore.getState().setCandidates(importedTaxLatencyCandidates)
  } else {
    useTaxLatencyStore.getState().setCandidates([])
  }
  if (
    financials.importQuality &&
    typeof financials.importQuality === 'object' &&
    Object.keys(financials.importQuality).length > 0
  ) {
    const existingProvider = useImportQualityStore.getState().provider
    const qualityRows = Object.values(
      financials.importQuality as Record<string, ImportQualityPerYear>
    )
    const provenanceProvider = qualityRows.find(
      (quality) => typeof quality.source_provenance?.provider === 'string'
    )?.source_provenance?.provider
    const importedProvider =
      provenanceProvider ??
      (typeof financials.dataSource === 'string' && financials.dataSource.trim()
        ? financials.dataSource.trim().toLowerCase()
        : existingProvider)
    useImportQualityStore
      .getState()
      .setImportQuality(financials.importQuality as Record<string, ImportQualityPerYear>, {
        provider: importedProvider,
      })
  }
  if (financials.saasMetrics) {
    const importedSaasMetrics = financials.saasMetrics
    if (importedSaasMetrics.saas_arr !== undefined) allData.saas_arr = importedSaasMetrics.saas_arr
    if (importedSaasMetrics.saas_mrr !== undefined) allData.saas_mrr = importedSaasMetrics.saas_mrr
    if (importedSaasMetrics.saas_arr_growth_pct !== undefined)
      allData.saas_arr_growth_pct = importedSaasMetrics.saas_arr_growth_pct
    if (importedSaasMetrics.saas_nrr_pct !== undefined)
      allData.saas_nrr_pct = importedSaasMetrics.saas_nrr_pct
    if (importedSaasMetrics.saas_churn_pct !== undefined)
      allData.saas_churn_pct = importedSaasMetrics.saas_churn_pct
    if (importedSaasMetrics.saas_gross_margin_pct !== undefined)
      allData.saas_gross_margin_pct = importedSaasMetrics.saas_gross_margin_pct
    if (importedSaasMetrics.saas_customer_churn_pct !== undefined) {
      allData.saas_customer_churn_pct = importedSaasMetrics.saas_customer_churn_pct
    }
    if (importedSaasMetrics.saas_customer_concentration_pct !== undefined) {
      allData.saas_customer_concentration_pct = importedSaasMetrics.saas_customer_concentration_pct
    }
    if (importedSaasMetrics.saas_expansion_revenue_pct !== undefined) {
      allData.saas_expansion_revenue_pct = importedSaasMetrics.saas_expansion_revenue_pct
    }
    if (importedSaasMetrics.saas_cac !== undefined) allData.saas_cac = importedSaasMetrics.saas_cac
    if (importedSaasMetrics.saas_sm_spend !== undefined) {
      allData.saas_sm_spend = importedSaasMetrics.saas_sm_spend
    }

    allData.business_context = {
      ...(allData.business_context || {}),
      _imported_saas_metrics: importedSaasMetrics,
      ...(financials.saasMetricsProvenance && {
        _imported_saas_provenance: financials.saasMetricsProvenance,
      }),
    }
  }

  const historicalYears: Array<{
    year: number
    revenue: number
    ebitda: number
    source_provider?: string
    source_kind?: string
    source_synced_at?: string | null
    source_digest?: string
    quality_state?:
      | 'ready'
      | 'source_warning'
      | 'needs_review'
      | 'blocked'
      | 'attested_review'
      | 'advisor_corrected'
    correction_id?: string
    eligibility_reason?: string
    attestation_id?: string
    _source_reconciled?: true
    warning_codes?: string[]
  }> = []
  if (financials.yearData && Object.keys(financials.yearData).length > 0) {
    Object.entries(financials.yearData).forEach(([yearStr, data]) => {
      const year = parseInt(yearStr, 10)
      const hasFiniteRevenue = data?.revenue != null && Number.isFinite(Number(data.revenue))
      const hasFiniteEbitda = data?.ebitda != null && Number.isFinite(Number(data.ebitda))
      if (year >= 2000 && year <= 2100 && (hasFiniteRevenue || hasFiniteEbitda)) {
        const sourceProvider =
          typeof data.source_provider === 'string'
            ? data.source_provider
            : typeof financials.dataSource === 'string' &&
                financials.dataSource !== 'accounting_integration'
              ? financials.dataSource
              : undefined
        historicalYears.push({
          year,
          revenue: data.revenue ?? 0,
          ebitda: data.ebitda ?? 0,
          ...(sourceProvider ? { source_provider: sourceProvider.toLowerCase() } : {}),
          ...(typeof data.source_kind === 'string' ? { source_kind: data.source_kind } : {}),
          ...(typeof data.source_synced_at === 'string' || data.source_synced_at === null
            ? { source_synced_at: data.source_synced_at }
            : {}),
          ...(typeof data.source_digest === 'string' ? { source_digest: data.source_digest } : {}),
          ...([
            'ready',
            'source_warning',
            'needs_review',
            'blocked',
            'attested_review',
            'advisor_corrected',
          ].includes(String(data.quality_state))
            ? {
                quality_state: data.quality_state as
                  | 'ready'
                  | 'source_warning'
                  | 'needs_review'
                  | 'blocked'
                  | 'attested_review'
                  | 'advisor_corrected',
              }
            : {}),
          ...(typeof data.eligibility_reason === 'string'
            ? { eligibility_reason: data.eligibility_reason }
            : {}),
          ...(typeof data.attestation_id === 'string'
            ? { attestation_id: data.attestation_id }
            : {}),
          ...(typeof data.correction_id === 'string' ? { correction_id: data.correction_id } : {}),
          ...(data._source_reconciled === true ? { _source_reconciled: true as const } : {}),
          ...(Array.isArray(data.warning_codes)
            ? {
                warning_codes: data.warning_codes.filter(
                  (code): code is string => typeof code === 'string' && code.trim().length > 0
                ),
              }
            : {}),
        })
      }
    })
  } else if (
    (financials.revenue !== undefined && Number.isFinite(Number(financials.revenue))) ||
    (financials.ebitda !== undefined && Number.isFinite(Number(financials.ebitda)))
  ) {
    const currentYear = getCurrentFilingYear()
    const rev = financials.revenue ?? 0
    const ebit = financials.ebitda ?? 0
    historicalYears.push({ year: currentYear, revenue: rev, ebitda: ebit })
  }
  if (historicalYears.length > 0) {
    historicalYears.sort((a, b) => b.year - a.year)
    const safeHistoricalYears = normalizeHistoricalYearsForFiling(
      historicalYears,
      allData.filing_year_confirmed
    )
    if (safeHistoricalYears.length > 0) {
      const currentYearRow = safeHistoricalYears[0]
      allData.historical_years_data = safeHistoricalYears.slice(1)
      allData.current_year_data = {
        ...currentYearRow,
      }
      allData.yearlyFinancials = safeHistoricalYears.map((row) => ({
        ...row,
        year: String(row.year),
        revenue: Number.isFinite(Number(row.revenue)) ? Number(row.revenue) : 0,
        ebitda: Number.isFinite(Number(row.ebitda)) ? Number(row.ebitda) : 0,
      }))
    } else if (financials.yearData && Object.keys(financials.yearData).length > 0) {
      const filingYear = getCurrentFilingYear()
      allData.current_year_data = {
        year: filingYear,
        revenue: 0,
        ebitda: 0,
      }
      allData.historical_years_data = undefined
    }
  }
}

function applyOfficialFinancialsPrefill(
  allData: BootstrapPrefillPatch,
  officialFinancials: PrefillData['officialFinancials']
): void {
  if (officialFinancials && hasUsableOfficialFinancialsContent(officialFinancials)) {
    allData.official_financials = officialFinancials
    if (officialFinancials.varianceAnalysis) {
      allData.official_variance_analysis = officialFinancials.varianceAnalysis
    }
    if (officialFinancials.verificationBadge) {
      allData.official_verification_badge = officialFinancials.verificationBadge
    }
  }

  if (officialFinancials?.historicalYears && officialFinancials.historicalYears.length > 0) {
    useNbbPrefillStore.getState().setFromHistoricalYears(officialFinancials.historicalYears)
    const snapshotsCount = Object.keys(useNbbPrefillStore.getState().yearSnapshots).length
    if (snapshotsCount === 0) {
      logger.info('Skipped NBB prefill store population from CBSO multi-year data', {
        yearsCount: officialFinancials.historicalYears.length,
        years: officialFinancials.historicalYears.map((y) => y.fiscalYear),
        reason: 'no_usable_revenue_or_ebitda',
      })
      return
    }
    logger.info('Populated NBB prefill store from CBSO multi-year data', {
      yearsCount: officialFinancials.historicalYears.length,
      snapshotsCount,
      years: officialFinancials.historicalYears.map((y) => y.fiscalYear),
    })
  }
}

function applyBusinessTypePrefill(
  allData: BootstrapPrefillPatch,
  businessType: BusinessTypeInfo | undefined
): void {
  if (!businessType?.id) return

  const businessTypeId = normalizeBusinessTypeId(businessType.id) ?? businessType.id
  const btFormData = buildBusinessTypeFormData(
    {
      id: businessTypeId,
      industryMapping: businessType.industry || businessType.category || 'services',
      industry: businessType.industry,
      category: businessType.category,
    },
    businessType.industry || businessType.category || 'services'
  )
  Object.assign(allData, btFormData)

  logger.debug('Applied buildBusinessTypeFormData in bootstrap prefill', {
    business_type_id: businessTypeId,
    industry: allData.industry,
    business_model: allData.business_model,
  })
}

function ensureCompanyName(
  allData: BootstrapPrefillPatch,
  companyInfo: CompanyInfo | undefined,
  kboData: PrefillData['kboData']
): void {
  if (allData.company_name && allData.company_name.trim() !== '') return

  if (kboData?.companyName && kboData.companyName.trim() !== '') {
    allData.company_name = kboData.companyName
    logger.debug('Using company_name from kboData (fallback)', {
      company_name: kboData.companyName.substring(0, 30),
    })
    return
  }

  logger.warn('No company_name available from bootstrap prefill', {
    hasCompanyInfo: !!companyInfo,
    companyInfoCompanyName: companyInfo?.companyName,
    hasKboData: !!kboData,
    kboDataCompanyName: kboData?.companyName,
  })
}

function applySessionFallbackPrefill(
  allData: BootstrapPrefillPatch,
  blockUntrustedFinancialPrefill: boolean
): void {
  const sessionRaw = useSessionStore.getState().session?.sessionData as
    | Record<string, unknown>
    | undefined
  if (!sessionRaw || typeof sessionRaw !== 'object') return

  const mergedSessionRaw = mergeSessionSurfaceForOptionalPrefill(sessionRaw) as Record<
    string,
    unknown
  >
  const mergedSession = blockUntrustedFinancialPrefill
    ? stripUntrustedOperatingFinancialPrefill(mergedSessionRaw)
    : mergedSessionRaw
  const currentFormData = useManualFormStore.getState().formData
  const sessionRegistryConflicts = hasConflictingRegistryIdentity(
    { ...currentFormData, ...allData },
    mergedSession
  )
  let optional = mergeOptionalSessionPrefillFields(mergedSession as Record<string, unknown>, {
    ...currentFormData,
    ...allData,
  })
  if (sessionRegistryConflicts) {
    optional = removeBusinessCardFields(optional)
    logger.debug('Skipped stale session business-card prefill after registry mismatch', {
      optionalKeys: Object.keys(optional),
    })
  }
  Object.assign(allData, optional)

  const legalForm =
    getRecordString(mergedSession, 'legal_form') ?? getRecordString(mergedSession, 'legalForm')
  if (!sessionRegistryConflicts && !allData.legal_form && legalForm) {
    allData.legal_form = legalForm
  }

  const businessTypeId = normalizeBusinessTypeId(
    getRecordString(mergedSession, 'business_type_id') ??
      getRecordString(mergedSession, 'businessTypeId') ??
      getRecordString(mergedSession, 'business_type')
  )
  if (
    !allData.business_type_id &&
    !sessionRegistryConflicts &&
    businessTypeId &&
    businessTypeId.trim() &&
    !isLegalFormBusinessTypeValue(businessTypeId)
  ) {
    allData.business_type_id = businessTypeId
  }

  const foundingYear =
    getRecordNumber(mergedSession, 'founding_year') ??
    getRecordNumber(mergedSession, 'founded_year')
  if (
    !allData.founding_year &&
    foundingYear != null &&
    Number.isFinite(Number(foundingYear)) &&
    Number(foundingYear) > 0
  ) {
    allData.founding_year = Number(foundingYear)
  }

  const mergedTaxLatencies =
    readTaxLatencyItems(mergedSession.tax_latencies) ??
    readTaxLatencyItems(mergedSession.taxLatencies) ??
    readTaxLatencyItems(mergedSession._taxLatencies)
  if (mergedTaxLatencies && mergedTaxLatencies.length > 0) {
    if (!Array.isArray(allData.tax_latencies) || allData.tax_latencies.length === 0) {
      allData.tax_latencies = mergedTaxLatencies.map(toTaxLatencyFormInput)
    }
    useTaxLatencyStore.getState().setItems(mergedTaxLatencies)
  }

  const mergedNormalizations = readNormalizationItems(mergedSession._normalizations)
  if (mergedNormalizations && mergedNormalizations.length > 0) {
    useNormalizationStore.getState().setItems(
      normalizeImportedLedgerReviewStatuses(
        mergedNormalizations,
        buildReportedEbitdaByYearFromFormRecords({
          currentYearData: allData.current_year_data as { year?: number; ebitda?: number },
          historicalYearsData: Array.isArray(allData.historical_years_data)
            ? (allData.historical_years_data as Array<{ year?: number; ebitda?: number }>)
            : undefined,
          yearlyFinancials: Array.isArray(allData.yearlyFinancials)
            ? (allData.yearlyFinancials as Array<{
                year?: number | string
                ebitda?: number
                isForecast?: boolean
              }>)
            : undefined,
          yearData:
            allData.year_data && typeof allData.year_data === 'object'
              ? (allData.year_data as Record<string | number, { ebitda?: number }>)
              : undefined,
          fallbackEbitda: Number(allData.ebitda),
        })
      )
    )
  }
}
