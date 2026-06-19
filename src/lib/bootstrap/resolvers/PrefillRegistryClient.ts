import { REGISTRY_SEARCH_CLIENT_TIMEOUT_MS } from '@/services/registry/types'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import { getApiUrl } from '../../../utils/getMercuryUrl'
import type { CompanyInfo, KBOCompanyEntity } from '../types'
import { truncateForLog } from '../utils'

const DEFAULT_API_URL = getApiUrl()

type PrefillRegistryLogger = Pick<Console, 'error' | 'info' | 'warn'>

/**
 * Raw KBO record shape returned by the Titan registry endpoints
 * (`/api/v2/registry/search` and `/api/v2/registry/kbo/lookup`).
 * Mirrors `KboCompanyEntity` in `apps/titan-api/src/integrations/registry/dto/kbo-lookup.dto.ts`.
 */
export interface RawKboRecord {
  kbo_number: string
  company_name: string
  legal_form?: string
  status?: string
  vat_number?: string
  address?: string
  postal_code?: string
  city?: string
  country_code?: string
  nace_code?: string
  nace_description?: string
  /** Full market activity code (NL: 5-digit SBI_2008; BE: NACE_REV2 with dot). */
  activity_code?: string
  /** Human-readable label for activity_code. */
  activity_label?: string
  foundation_date?: string
  is_active?: boolean
  /** Server-resolved business type ID from Titan's enrichRegistrySearchResults
   * (BE: NACE -> mapping; NL: SBI alias -> canonical NACE -> mapping). */
  business_type_id?: string
  /** Server-resolved sector title (e.g. "Logistics"). */
  business_type_title?: string
}

/**
 * Parsed identifiers extracted from a `prefilledQuery` URL parameter.
 *
 * Mercury builds prefilled queries as `"{businessName} {kbo} {nace}"` (see
 * `apps/mercury/shared/utils/buildSellerValuationPrefilledQuery.ts`), but
 * other sources may pass less-structured strings. We detect identifiers
 * defensively so the registry call can be a precise lookup instead of a
 * fuzzy name search with `limit: 1`.
 */
export interface ParsedPrefilledQueryIdentifiers {
  /** Belgian enterprise number, formatted with dots (e.g. `0861.786.602`). */
  kboNumber?: string
  /** Belgian VAT number prefixed with `BE` and no separators. */
  vatNumber?: string
  /** Dutch KVK number - exactly 8 digits (e.g. `12345678`). */
  kvkNumber?: string
  /** Activity / NACE code (4 or 5 digits). Best-effort. */
  naceCode?: string
  /** Original query with detected identifiers stripped - usable as a name search. */
  cleanedName: string
}

export interface PrefillRegistryResult {
  companyInfo?: CompanyInfo
  kboData?: KBOCompanyEntity
}

export interface PrefillRegistryClientOptions {
  apiUrl?: string
  logger?: PrefillRegistryLogger
}

export function normalizeCountryCode(countryCode?: string | null): string | undefined {
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

/**
 * Extract Belgian KBO/VAT, Dutch KVK, and NACE identifiers from a free-form
 * prefilled query string. Defensive against missing/extra whitespace and `BE`
 * prefix variants. NACE extraction only runs after a KBO/KVK is found, since
 * a 4-digit sequence in an arbitrary company name (year, postal code) would
 * otherwise be a false positive.
 *
 * Detection order matters:
 *   1. Belgian KBO (10 digits, starts with 0) - checked first because it is
 *      a strict superset of the 8-digit check; a 10-digit all-digit string
 *      starting with 0 would otherwise falsely match the KVK branch.
 *   2. Dutch KVK (exactly 8 digits, no leading 0 required).
 *   3. NACE code - only after a registry number is isolated.
 */
export function parsePrefilledQueryIdentifiers(query: string): ParsedPrefilledQueryIdentifiers {
  const result: ParsedPrefilledQueryIdentifiers = { cleanedName: query.trim() }
  if (!query) return result

  const kboPattern = /\b(?:BE\s*)?0\d{3}[.\s-]?\d{3}[.\s-]?\d{3}\b/i
  const kboMatch = result.cleanedName.match(kboPattern)
  if (kboMatch) {
    const digits = kboMatch[0].replace(/[^0-9]/g, '')
    if (digits.length === 10 && digits.startsWith('0')) {
      result.kboNumber = `${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7, 10)}`
      result.vatNumber = `BE${digits}`
      result.cleanedName = result.cleanedName.replace(kboMatch[0], ' ').trim()
    }
  }

  if (!result.kboNumber) {
    const kvkPattern = /\b(\d{8})\b/
    const kvkMatch = result.cleanedName.match(kvkPattern)
    if (kvkMatch) {
      result.kvkNumber = kvkMatch[1]
      result.cleanedName = result.cleanedName.replace(kvkMatch[0], ' ').trim()
    }
  }

  if (result.kboNumber || result.kvkNumber) {
    const naceMatch = result.cleanedName.match(/\b\d{4,5}\b/)
    if (naceMatch) {
      result.naceCode = naceMatch[0]
      result.cleanedName = result.cleanedName.replace(naceMatch[0], ' ').trim()
    }
  }

  result.cleanedName = result.cleanedName.replace(/\s{2,}/g, ' ').trim()
  return result
}

async function fetchWithRegistryTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REGISTRY_SEARCH_CLIENT_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function searchKboByName(
  name: string,
  countryCode: string,
  apiUrl: string,
  logger: PrefillRegistryLogger
): Promise<RawKboRecord | null> {
  if (!name || name.trim().length < 2) return null

  try {
    const response = await fetchWithRegistryTimeout(`${apiUrl}/api/v2/registry/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        company_name: name.trim(),
        country_code: countryCode,
        limit: 1,
      }),
    })

    if (!response.ok) {
      logger.warn('[PrefillResolver] KBO search failed', {
        status: response.status,
      })
      return null
    }

    const data = await response.json()
    const results = (data?.results || []) as RawKboRecord[]
    return results[0] || null
  } catch (error) {
    logger.error('[PrefillResolver] KBO search error:', error)
    return null
  }
}

async function lookupKboByIdentifier(
  identifiers: ParsedPrefilledQueryIdentifiers,
  countryCode: string,
  apiUrl: string,
  logger: PrefillRegistryLogger
): Promise<RawKboRecord | null> {
  // Dutch KVK must go through registry/search with country_code=NL.
  // The KVK service detects the 8-digit query and does an exact lookup.
  if (identifiers.kvkNumber) {
    return searchKboByName(identifiers.kvkNumber, 'NL', apiUrl, logger)
  }

  try {
    const body: Record<string, string> = {}
    if (identifiers.kboNumber) body.kbo_number = identifiers.kboNumber
    if (identifiers.vatNumber) body.vat_number = identifiers.vatNumber
    if (identifiers.cleanedName) body.company_name = identifiers.cleanedName

    const response = await fetchWithRegistryTimeout(`${apiUrl}/api/v2/registry/kbo/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      if (response.status === 404 && identifiers.cleanedName) {
        return searchKboByName(identifiers.cleanedName, countryCode, apiUrl, logger)
      }
      logger.warn('[PrefillResolver] KBO lookup failed', {
        status: response.status,
      })
      return null
    }

    const data = await response.json()
    return (data?.data || null) as RawKboRecord | null
  } catch (error) {
    logger.error('[PrefillResolver] KBO lookup error:', error)
    return null
  }
}

function mapRawKboRecord(kbo: RawKboRecord, fallbackCountryCode: string): PrefillRegistryResult {
  const resolvedKboCountry = resolveCountryCode(kbo.country_code, fallbackCountryCode) || 'BE'
  const businessTypeId = normalizeBusinessTypeId(kbo.business_type_id)

  const kboData: KBOCompanyEntity = {
    kboNumber: kbo.kbo_number,
    companyName: kbo.company_name,
    legalForm: kbo.legal_form,
    status: kbo.status,
    vatNumber: kbo.vat_number,
    address: kbo.address,
    postalCode: kbo.postal_code,
    city: kbo.city,
    countryCode: resolvedKboCountry,
    naceCode: kbo.nace_code,
    naceDescription: kbo.nace_description,
    activityCode: kbo.activity_code,
    activityLabel: kbo.activity_label,
    foundationDate: kbo.foundation_date,
    isActive: kbo.is_active,
    businessTypeId,
    businessTypeTitle: kbo.business_type_title,
  }

  const companyInfo: CompanyInfo = {
    companyName: kbo.company_name,
    kboNumber: kbo.kbo_number,
    vatNumber: kbo.vat_number,
    legalForm: kbo.legal_form,
    address: kbo.address,
    postalCode: kbo.postal_code,
    city: kbo.city,
    countryCode: resolvedKboCountry,
    naceCode: kbo.nace_code,
    naceDescription: kbo.nace_description,
    activityCode: kbo.activity_code,
    activityLabel: kbo.activity_label,
    foundingYear: kbo.foundation_date ? new Date(kbo.foundation_date).getFullYear() : undefined,
    isActive: kbo.is_active,
    businessTypeId,
    businessTypeTitle: kbo.business_type_title,
  }

  return { companyInfo, kboData }
}

export async function fetchRegistryPrefill(
  query: string,
  countryCode: string,
  options: PrefillRegistryClientOptions = {}
): Promise<PrefillRegistryResult | null> {
  const logger = options.logger ?? console
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL
  const identifiers = parsePrefilledQueryIdentifiers(query)
  const hasExactIdentifier = !!(
    identifiers.kboNumber ||
    identifiers.vatNumber ||
    identifiers.kvkNumber
  )
  const kbo = hasExactIdentifier
    ? await lookupKboByIdentifier(identifiers, countryCode, apiUrl, logger)
    : await searchKboByName(identifiers.cleanedName || query, countryCode, apiUrl, logger)

  if (!kbo) return null

  const result = mapRawKboRecord(kbo, countryCode)
  logger.info('[PrefillResolver] KBO data fetched', {
    companyName: truncateForLog(kbo.company_name, 20),
    kboNumber: kbo.kbo_number,
  })

  return result
}
