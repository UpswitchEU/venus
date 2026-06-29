import type { SessionBootstrapState } from '../lib/bootstrap/types'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import { shouldBlockUntrustedFinancialPrefill } from '../utils/officialValuationInputPolicy'
import { formatBootstrapCompanyAddress } from '../utils/registryCompanyDisplay'

type PrefillDataParam = SessionBootstrapState['prefillData']

function isEmptyLike(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

export function buildGapFillPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of keys) {
    const next = incoming[key]
    if (next === undefined || next === null) continue
    if (!isEmptyLike(existing[key])) continue
    patch[key] = next
  }
  return patch
}

export function mergeBusinessContextGapFill(
  existing: unknown,
  incoming: unknown
): Record<string, unknown> | null {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return null
  const inBc = incoming as Record<string, unknown>
  const exBc =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {}
  const merged = { ...exBc }
  let changed = false
  for (const [key, incomingValue] of Object.entries(inBc)) {
    if (incomingValue === undefined || incomingValue === null) continue
    if (isEmptyLike(merged[key])) {
      merged[key] = incomingValue
      changed = true
    }
  }
  return changed ? merged : null
}

export const CORE_PREFILL_GAP_KEYS = [
  'company_name',
  'country_code',
  'founding_year',
  'kbo_number',
  'vat_number',
  'legal_form',
  'city',
  'postal_code',
  'nace_code',
  'nace_description',
  'canonical_nace_code',
  'taxonomy',
  'activity_code',
  'activity_label',
  'business_type_id',
  'industry',
  'subIndustry',
  'number_of_employees',
  'employee_count',
  'business_description',
] as const

export const PREFILL_METADATA_GAP_KEYS = [
  'year_data',
  'import_quality',
  '_import_quality',
  '_imported_ledger_analysis',
  '_imported_saas_metrics',
  '_imported_saas_provenance',
  '_financial_data_source',
  'official_financials',
  'official_variance_analysis',
  'official_verification_badge',
] as const

function normalizeCountryCode(countryCode?: string | null): string | undefined {
  if (!countryCode) return undefined
  const normalized = countryCode.trim().toUpperCase()
  if (normalized === 'UK') return 'GB'
  return normalized.length > 0 ? normalized : undefined
}

export function resolveCountryCode(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate)
    if (normalized) return normalized
  }

  return undefined
}

export function buildPrefillSessionFields(prefillData: PrefillDataParam): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const allowFinancialPrefill = !shouldBlockUntrustedFinancialPrefill(
    prefillData.officialFinancials,
    prefillData.financials?.dataSource
  )
  if (prefillData.companyInfo?.companyName)
    fields.company_name = prefillData.companyInfo.companyName
  else if (prefillData.kboData?.companyName) fields.company_name = prefillData.kboData.companyName
  const authoritativeCountryCode = resolveCountryCode(
    prefillData.companyInfo?.countryCode,
    prefillData.kboData?.countryCode
  )
  if (authoritativeCountryCode) fields.country_code = authoritativeCountryCode
  if (prefillData.companyInfo?.foundingYear)
    fields.founding_year = prefillData.companyInfo.foundingYear
  if (prefillData.companyInfo?.kboNumber) fields.kbo_number = prefillData.companyInfo.kboNumber
  else if (prefillData.kboData?.kboNumber) fields.kbo_number = prefillData.kboData.kboNumber
  if (prefillData.companyInfo?.vatNumber) fields.vat_number = prefillData.companyInfo.vatNumber
  else if (prefillData.kboData?.vatNumber) fields.vat_number = prefillData.kboData.vatNumber
  if (prefillData.companyInfo?.legalForm) fields.legal_form = prefillData.companyInfo.legalForm
  else if (prefillData.kboData?.legalForm) fields.legal_form = prefillData.kboData.legalForm
  if (prefillData.companyInfo?.city) fields.city = prefillData.companyInfo.city
  else if (prefillData.kboData?.city) fields.city = prefillData.kboData.city
  if (prefillData.companyInfo?.postalCode) fields.postal_code = prefillData.companyInfo.postalCode
  else if (prefillData.kboData?.postalCode) fields.postal_code = prefillData.kboData.postalCode
  if (prefillData.companyInfo?.naceCode) fields.nace_code = prefillData.companyInfo.naceCode
  else if (prefillData.kboData?.naceCode) fields.nace_code = prefillData.kboData.naceCode
  if (prefillData.companyInfo?.naceDescription)
    fields.nace_description = prefillData.companyInfo.naceDescription
  else if (prefillData.kboData?.naceDescription)
    fields.nace_description = prefillData.kboData.naceDescription
  if (prefillData.companyInfo?.canonicalNaceCode)
    fields.canonical_nace_code = prefillData.companyInfo.canonicalNaceCode
  if (prefillData.companyInfo?.taxonomy) fields.taxonomy = prefillData.companyInfo.taxonomy
  if (prefillData.companyInfo?.activityCode)
    fields.activity_code = prefillData.companyInfo.activityCode
  else if (prefillData.kboData?.activityCode)
    fields.activity_code = prefillData.kboData.activityCode
  if (prefillData.companyInfo?.activityLabel)
    fields.activity_label = prefillData.companyInfo.activityLabel
  else if (prefillData.kboData?.activityLabel)
    fields.activity_label = prefillData.kboData.activityLabel
  if (prefillData.businessType?.id)
    fields.business_type_id = normalizeBusinessTypeId(prefillData.businessType.id)
  else if (prefillData.companyInfo?.businessTypeId)
    fields.business_type_id = normalizeBusinessTypeId(prefillData.companyInfo.businessTypeId)
  if (prefillData.businessType?.industry) fields.industry = prefillData.businessType.industry
  if (prefillData.businessType?.category) fields.subIndustry = prefillData.businessType.category
  if (allowFinancialPrefill) {
    if (prefillData.financials?.revenue !== undefined)
      fields.revenue = prefillData.financials.revenue
    if (prefillData.financials?.ebitda !== undefined) fields.ebitda = prefillData.financials.ebitda
    if (prefillData.financials?.netIncome !== undefined)
      fields.net_income = prefillData.financials.netIncome
    if (prefillData.financials?.employeeCount !== undefined)
      fields.number_of_employees = prefillData.financials.employeeCount
    if (prefillData.financials?.employeeCount !== undefined)
      fields.employee_count = prefillData.financials.employeeCount
    if (
      prefillData.financials?.yearData &&
      typeof prefillData.financials.yearData === 'object' &&
      Object.keys(prefillData.financials.yearData).length > 0
    ) {
      fields.year_data = prefillData.financials.yearData
    }
    if (prefillData.financials?.importQuality) {
      fields.import_quality = prefillData.financials.importQuality
      fields._import_quality = prefillData.financials.importQuality
    }
    if (prefillData.financials?.importedLedgerAnalysis) {
      fields._imported_ledger_analysis = prefillData.financials.importedLedgerAnalysis
      fields.business_context = {
        ...((fields.business_context as Record<string, unknown> | undefined) ?? {}),
        _imported_ledger_analysis: prefillData.financials.importedLedgerAnalysis,
      }
    }
    if (prefillData.financials?.saasMetrics)
      fields._imported_saas_metrics = prefillData.financials.saasMetrics
    if (prefillData.financials?.saasMetricsProvenance) {
      fields._imported_saas_provenance = prefillData.financials.saasMetricsProvenance
      fields.business_context = {
        ...((fields.business_context as Record<string, unknown> | undefined) ?? {}),
        _imported_saas_provenance: prefillData.financials.saasMetricsProvenance,
      }
    }
    if (prefillData.financials?.dataSource)
      fields._financial_data_source = prefillData.financials.dataSource
  }
  const companyAddress = formatBootstrapCompanyAddress({
    address: prefillData.companyInfo?.address || prefillData.kboData?.address,
    postalCode: prefillData.companyInfo?.postalCode || prefillData.kboData?.postalCode,
    city: prefillData.companyInfo?.city || prefillData.kboData?.city,
  })
  const companyStatus =
    prefillData.kboData?.status ||
    (prefillData.companyInfo?.isActive === true
      ? 'Active'
      : prefillData.companyInfo?.isActive === false
        ? 'Inactive'
        : undefined)
  if (companyAddress || companyStatus) {
    fields.business_context = {
      ...((fields.business_context as Record<string, unknown> | undefined) ?? {}),
      ...(companyAddress ? { company_address: companyAddress } : {}),
      ...(companyStatus ? { company_status: companyStatus } : {}),
    }
  }
  if (prefillData.officialFinancials) {
    fields.official_financials = prefillData.officialFinancials
    if (prefillData.officialFinancials.varianceAnalysis) {
      fields.official_variance_analysis = prefillData.officialFinancials.varianceAnalysis
    }
    if (prefillData.officialFinancials.verificationBadge) {
      fields.official_verification_badge = prefillData.officialFinancials.verificationBadge
    }
  }
  return fields
}

export function buildPrefillFormFields(prefillData: PrefillDataParam): Record<string, unknown> {
  const fields = buildPrefillSessionFields(prefillData)
  const kboNum = prefillData.companyInfo?.kboNumber || prefillData.kboData?.kboNumber
  if (kboNum) {
    const existingBc =
      fields.business_context &&
      typeof fields.business_context === 'object' &&
      !Array.isArray(fields.business_context)
        ? (fields.business_context as Record<string, unknown>)
        : {}
    const companyAddress = formatBootstrapCompanyAddress({
      address: prefillData.companyInfo?.address || prefillData.kboData?.address,
      postalCode: prefillData.companyInfo?.postalCode || prefillData.kboData?.postalCode,
      city: prefillData.companyInfo?.city || prefillData.kboData?.city,
    })
    const companyStatus =
      prefillData.kboData?.status ||
      (prefillData.companyInfo?.isActive === true
        ? 'Active'
        : prefillData.companyInfo?.isActive === false
          ? 'Inactive'
          : undefined)
    fields.business_context = {
      ...existingBc,
      kbo_registration: kboNum,
      kbo_registration_number: kboNum,
      legal_form: prefillData.companyInfo?.legalForm || prefillData.kboData?.legalForm,
      company_id: kboNum,
      company_address: companyAddress,
      company_status: companyStatus || 'Active',
      kbo_verified: true,
    }
  }
  return fields
}
