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
  const businessTypeCandidates = parseBusinessTypeCandidates(
    raw.business_type_candidates ?? raw.businessTypeCandidates
  )
  const businessTypeIds = dedupeStrings([
    ...parseStringArray(raw.business_type_ids ?? raw.businessTypeIds).map(normalizeBusinessTypeId),
    ...businessTypeCandidates.map((candidate) => candidate.id),
    businessTypeId,
  ])
  const naceCodes = dedupeStrings(
    parseStringArray(raw.nace_codes ?? raw.naceCodes).map((code) => code.trim())
  )

  const registration = result.kbo_number || result.registration_number || ''
  const countryCode = (result.country_code || searchCountry).trim().toUpperCase().slice(0, 2)
  const foundingYear = foundingYearOverride ?? parseFoundingYearFromRegistryHit(raw)

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
    ...(businessTypeIds.length > 0 ? { businessTypeIds } : {}),
    ...(businessTypeCandidates.length > 0 ? { businessTypeCandidates } : {}),
    ...(naceCodes.length > 0 ? { naceCodes } : {}),
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

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseBusinessTypeCandidates(
  value: unknown
): NonNullable<KBOCompany['businessTypeCandidates']> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const id = normalizeBusinessTypeId(raw.business_type_id ?? raw.id)
    if (!id) return []
    const titleRaw = raw.business_type_title ?? raw.title
    const naceRaw = raw.nace_code ?? raw.naceCode
    const weight = parseNumber(
      raw.weight ??
        raw.business_type_weight ??
        raw.businessTypeWeight ??
        raw.normalized_weight ??
        raw.normalizedWeight ??
        raw.allocation ??
        raw.share
    )
    const primaryMultiple = parsePrimaryMultiple(raw.primary_multiple ?? raw.primaryMultiple)
    return [
      {
        id,
        ...(typeof titleRaw === 'string' && titleRaw.trim() ? { title: titleRaw.trim() } : {}),
        ...(typeof naceRaw === 'string' && naceRaw.trim() ? { naceCode: naceRaw.trim() } : {}),
        ...(weight !== undefined ? { weight } : {}),
        ...(primaryMultiple ? { primaryMultiple } : {}),
      },
    ]
  })
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parsePrimaryMultiple(
  value: unknown
): NonNullable<
  NonNullable<KBOCompany['businessTypeCandidates']>[number]['primaryMultiple']
> | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const median = parseNumber(raw.median)
  if (median === undefined) return null
  const lowSampleSuppressed =
    raw.lowSampleSuppressed === true || raw.low_sample_suppressed === true ? true : undefined

  return {
    median,
    ...(parseString(raw.metric) ? { metric: parseString(raw.metric) } : {}),
    ...(parseString(raw.label) ? { label: parseString(raw.label) } : {}),
    ...(parseNumber(raw.p25) !== undefined ? { p25: parseNumber(raw.p25) } : {}),
    ...(parseNumber(raw.p75) !== undefined ? { p75: parseNumber(raw.p75) } : {}),
    ...(parseString(raw.basis) ? { basis: parseString(raw.basis) } : {}),
    ...(lowSampleSuppressed !== undefined ? { lowSampleSuppressed } : {}),
  }
}

function dedupeStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
