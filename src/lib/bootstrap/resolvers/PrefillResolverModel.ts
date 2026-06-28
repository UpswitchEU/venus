import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import { parseEmployeeCount } from '../../../utils/employeeCount'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { mergeSessionSurfaceForOptionalPrefill } from '../../../utils/mergeOptionalSessionPrefillFields'
import type { BusinessTypeInfo, CompanyInfo, PartialFinancials } from '../types'
import { mergeWithPriority } from '../utils'
import { resolveCountryCode } from './PrefillRegistryClient'

export const ALL_PREFILL_FIELDS = [
  'company_name',
  'business_type_id',
  'industry',
  'country_code',
  'founding_year',
  'employee_count',
  'revenue',
  'ebitda',
  'kbo_number',
  'vat_number',
  'legal_form',
  'city',
  'postal_code',
  'nace_code',
  'nace_description',
  'activity_code',
  'taxonomy',
  'canonical_nace_code',
]

export interface SessionDataForPrefill {
  company_name?: string
  business_type_id?: string
  industry?: string
  country_code?: string
  founding_year?: number
  employee_count?: number
  number_of_employees?: number
  revenue?: number
  ebitda?: number
  current_year_data?: { year?: number; revenue?: number | null; ebitda?: number | null }
  historical_years_data?: Array<{
    year: number
    revenue?: number | null
    ebitda?: number | null
  }>
  year_data?: Record<number, { revenue?: number | null; ebitda?: number | null }>
  kbo_number?: string
  vat_number?: string
  legal_form?: string
  city?: string
  postal_code?: string
  nace_code?: string
  nace_description?: string
  activity_code?: string
  activity_label?: string
  taxonomy?: string
  canonical_nace_code?: string
  _businessInfo?: Record<string, unknown>
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function validYear(value: unknown): number | undefined {
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : undefined
}

function financialYearDataFrom(value: unknown): { revenue?: number; ebitda?: number } {
  const record = asRecord(value)
  if (!record) return {}
  const revenue = finiteNumber(record.revenue)
  const ebitda = finiteNumber(record.ebitda)
  return {
    ...(revenue !== undefined ? { revenue } : {}),
    ...(ebitda !== undefined ? { ebitda } : {}),
  }
}

function upsertYearData(
  target: Record<number, { revenue?: number; ebitda?: number }>,
  year: unknown,
  value: unknown,
  options: { preserveExistingNonZero?: boolean } = {}
): void {
  const normalizedYear = validYear(year)
  if (normalizedYear === undefined) return

  const incoming = financialYearDataFrom(value)
  if (incoming.revenue === undefined && incoming.ebitda === undefined) return

  const existing = target[normalizedYear] ?? {}
  const next = { ...existing }

  for (const key of ['revenue', 'ebitda'] as const) {
    const value = incoming[key]
    if (value === undefined) continue
    const existingValue = existing[key]
    if (
      options.preserveExistingNonZero &&
      value === 0 &&
      typeof existingValue === 'number' &&
      Number.isFinite(existingValue) &&
      existingValue !== 0
    ) {
      continue
    }
    next[key] = value
  }

  target[normalizedYear] = next
}

function buildSessionYearData(
  merged: Record<string, unknown>,
  currentYearData: { year?: number; revenue?: number | null; ebitda?: number | null } | undefined
): Record<number, { revenue?: number; ebitda?: number }> | undefined {
  const yearData: Record<number, { revenue?: number; ebitda?: number }> = {}
  const explicitYearData = asRecord(merged.year_data) ?? asRecord(merged.yearData)

  if (explicitYearData) {
    for (const [year, data] of Object.entries(explicitYearData)) {
      upsertYearData(yearData, year, data)
    }
  }

  if (Array.isArray(merged.historical_years_data)) {
    for (const row of merged.historical_years_data) {
      const record = asRecord(row)
      upsertYearData(yearData, record?.year, record)
    }
  }

  if (currentYearData) {
    upsertYearData(yearData, currentYearData.year ?? getCurrentFilingYear(), currentYearData, {
      preserveExistingNonZero: true,
    })
  }

  return Object.keys(yearData).length > 0 ? yearData : undefined
}

export function extractSessionPrefill(sessionData: SessionDataForPrefill): {
  companyInfo?: CompanyInfo
  financials?: PartialFinancials
  businessType?: BusinessTypeInfo
} {
  const merged = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>

  const canonicalNace =
    (merged.canonical_nace_code as string) || (merged.nace_code as string) || undefined
  const activityPresentation = (merged.activity_code as string) || undefined
  const companyInfo: CompanyInfo = {
    companyName: merged.company_name as string,
    kboNumber: merged.kbo_number as string,
    vatNumber: merged.vat_number as string,
    legalForm: merged.legal_form as string,
    city: merged.city as string,
    postalCode: merged.postal_code as string,
    countryCode: resolveCountryCode(
      merged.country_code as string | undefined,
      merged.country as string | undefined
    ),
    foundingYear: merged.founding_year as number,
    canonicalNaceCode: canonicalNace,
    naceCode:
      activityPresentation && canonicalNace && activityPresentation.trim() !== canonicalNace.trim()
        ? activityPresentation
        : canonicalNace,
    naceDescription:
      (merged.activity_label as string) || (merged.nace_description as string) || undefined,
    activityCode: activityPresentation,
    activityLabel: merged.activity_label as string,
    taxonomy: merged.taxonomy as string,
  }

  const cyd = merged.current_year_data as
    | { year?: number; revenue?: number | null; ebitda?: number | null }
    | undefined
  const yearData = buildSessionYearData(merged, cyd)
  const currentYear = validYear(cyd?.year) ?? getCurrentFilingYear()
  const currentYearFinancials = yearData?.[currentYear]
  const revenue =
    currentYearFinancials?.revenue ?? finiteNumber(cyd?.revenue) ?? finiteNumber(merged.revenue)
  const ebitda =
    currentYearFinancials?.ebitda ?? finiteNumber(cyd?.ebitda) ?? finiteNumber(merged.ebitda)

  const financials: PartialFinancials = {
    revenue,
    ebitda,
    employeeCount: (merged.employee_count ?? merged.number_of_employees) as number,
    yearData,
  }

  let businessType: BusinessTypeInfo | undefined
  const businessTypeId = normalizeBusinessTypeId(merged.business_type_id)
  if (businessTypeId) {
    businessType = {
      id: businessTypeId,
      title: '',
      industry: merged.industry as string,
    }
  }

  return { companyInfo, financials, businessType }
}

export function mergeCompanyInfo(
  session?: CompanyInfo,
  profile?: CompanyInfo,
  kbo?: CompanyInfo
): CompanyInfo | undefined {
  if (!session && !profile && !kbo) {
    return undefined
  }

  if (!kbo) {
    return mergeWithPriority(profile, session) as CompanyInfo
  }

  return mergeWithPriority(profile, session, kbo) as CompanyInfo
}

export function mergeFinancials(
  session?: PartialFinancials,
  profile?: PartialFinancials
): PartialFinancials | undefined {
  if (!session && !profile) {
    return undefined
  }

  return mergeWithPriority(profile, session) as PartialFinancials
}

export function getPopulatedFields(
  companyInfo?: CompanyInfo,
  financials?: PartialFinancials,
  businessType?: BusinessTypeInfo
): string[] {
  const populated: string[] = []

  if (companyInfo) {
    if (companyInfo.companyName) populated.push('company_name')
    if (companyInfo.kboNumber) populated.push('kbo_number')
    if (companyInfo.vatNumber) populated.push('vat_number')
    if (companyInfo.legalForm) populated.push('legal_form')
    if (companyInfo.city) populated.push('city')
    if (companyInfo.postalCode) populated.push('postal_code')
    if (companyInfo.countryCode) populated.push('country_code')
    if (companyInfo.foundingYear) populated.push('founding_year')
    if (companyInfo.naceCode) populated.push('nace_code')
    if (companyInfo.naceDescription) populated.push('nace_description')
  }

  if (financials) {
    if (financials.revenue != null && Number.isFinite(Number(financials.revenue))) {
      populated.push('revenue')
    }
    if (financials.ebitda != null && Number.isFinite(Number(financials.ebitda))) {
      populated.push('ebitda')
    }
    if (financials.employeeCount) populated.push('employee_count')
  }

  if (businessType) {
    populated.push('business_type_id')
    if (businessType.industry) populated.push('industry')
  }

  return populated
}

export { parseEmployeeCount }
