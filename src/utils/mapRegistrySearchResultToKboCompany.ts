import type { KBOCompany } from '@/design-system'
import type { CompanySearchResult } from '@/services/registry/types'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { pickLegalFormFromRegistryHit } from './registryUtils'

export interface MapRegistrySearchResultOptions {
  index?: number
  searchCountry?: string
  foundingYear?: number
}

/**
 * Canonical Titan registry hit → Venus {@link KBOCompany}.
 * Keeps street address separate from postal/city so display formatters can dedupe safely.
 */
export function mapRegistrySearchResultToKboCompany(
  result: CompanySearchResult,
  options: MapRegistrySearchResultOptions = {}
): KBOCompany {
  const { index = 0, searchCountry = 'BE', foundingYear: foundingYearOverride } = options
  const raw = result as unknown as Record<string, unknown>
  const legalFormResolved =
    pickLegalFormFromRegistryHit(raw) ||
    (typeof result.legal_form === 'string' ? result.legal_form.trim() : '')

  const canonical = (result.canonical_nace_code || result.nace_code)?.trim() || ''
  const activity = (result.activity_code || '').trim()
  const displayActivity = activity && canonical && activity !== canonical ? activity : undefined
  const activityDescription = (result.activity_label || result.nace_description || '').trim()

  const btIdRaw = raw.business_type_id
  const btTitleRaw = raw.business_type_title
  const businessTypeId = normalizeBusinessTypeId(btIdRaw)
  const businessTypeTitle =
    typeof btTitleRaw === 'string' && btTitleRaw.trim() ? btTitleRaw.trim() : undefined

  const registration = result.kbo_number || result.registration_number || ''
  const countryCode = (result.country_code || searchCountry).trim().toUpperCase().slice(0, 2)
  const foundingYear =
    foundingYearOverride ?? parseFoundingYearFromRegistryHit(raw)

  return {
    id: result.company_id || registration.replace(/[.\s]/g, '') || `kbo-${index}`,
    name: result.company_name,
    kboNumber: registration,
    legalForm: legalFormResolved,
    address: typeof result.address === 'string' ? result.address.trim() : '',
    postalCode: typeof result.postal_code === 'string' ? result.postal_code.trim() : '',
    city: typeof result.city === 'string' ? result.city.trim() : '',
    naceCode: canonical,
    naceDescription: activityDescription,
    canonicalNaceCode: canonical || undefined,
    activityCode: displayActivity,
    activityLabel: activityDescription || undefined,
    activityTaxonomy: result.taxonomy,
    countryCode,
    businessTypeId,
    businessTypeTitle,
    ...(foundingYear != null ? { foundingYear } : {}),
  }
}

function parseFoundingYearFromRegistryHit(raw: Record<string, unknown>): number | undefined {
  const foundingYearRaw = raw.founding_year ?? raw.foundingYear
  if (typeof foundingYearRaw === 'number' && Number.isFinite(foundingYearRaw)) {
    return foundingYearRaw
  }
  const startDateRaw = raw.start_date ?? raw.startDate
  if (typeof startDateRaw === 'string') {
    const match = startDateRaw.match(/(19|20)\d{2}/)
    if (match) return Number(match[0])
  }
  return undefined
}
