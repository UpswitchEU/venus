/**
 * Prefill Resolver
 *
 * Aggregates data from multiple sources for form prefilling:
 * - KBO Registry (Belgian companies)
 * - User Profile / Business Card
 * - Existing Session Data
 * - URL Parameters
 *
 * @module lib/bootstrap/resolvers/PrefillResolver
 */

import { REGISTRY_SEARCH_CLIENT_TIMEOUT_MS } from '@/services/registry/types'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { getApiUrl } from '../../../utils/getMercuryUrl'
import { mergeSessionSurfaceForOptionalPrefill } from '../../../utils/mergeOptionalSessionPrefillFields'
import type {
  BootstrapContext,
  BootstrapHints,
  BootstrapResolver,
  BusinessTypeInfo,
  CompanyInfo,
  IdentityState,
  KBOCompanyEntity,
  PartialFinancials,
  PrefillData,
  PrefillSource,
  ResolverResult,
} from '../types'
import { DEFAULT_PREFILL } from '../types'
import { calculatePrefillConfidence, mergeWithPriority, truncateForLog } from '../utils'

const API_URL = getApiUrl()

// Fields that we track for prefill completeness
const ALL_PREFILL_FIELDS = [
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

/**
 * Raw KBO record shape returned by the Titan registry endpoints
 * (`/api/v2/registry/search` and `/api/v2/registry/kbo/lookup`).
 * Mirrors `KboCompanyEntity` in `apps/titan-api/src/integrations/registry/dto/kbo-lookup.dto.ts`.
 */
interface RawKboRecord {
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
   * (BE: NACE → mapping; NL: SBI alias → canonical NACE → mapping). */
  business_type_id?: string
  /** Server-resolved sector title (e.g. "Logistics"). */
  business_type_title?: string
}

interface UserProfile {
  id: string
  email?: string
  company_name?: string
  business_type_id?: string
  industry?: string
  country?: string
  kbo_number?: string
  vat_number?: string
  city?: string
  postal_code?: string
  legal_form?: string
  founded_year?: number
  employee_count_range?: string
  nace_code?: string
  nace_description?: string
}

interface SessionDataForPrefill {
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
  historical_years_data?: Array<{ year: number; revenue?: number; ebitda?: number }>
  year_data?: Record<number, { revenue?: number; ebitda?: number }>
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

function normalizeCountryCode(countryCode?: string | null): string | undefined {
  if (!countryCode) return undefined
  const normalized = countryCode.trim().toUpperCase()
  if (normalized === 'UK') return 'GB'
  return normalized.length > 0 ? normalized : undefined
}

function resolveCountryCode(...candidates: Array<string | null | undefined>): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate)
    if (normalized) return normalized
  }

  return undefined
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
  /** Dutch KVK number — exactly 8 digits (e.g. `12345678`). */
  kvkNumber?: string
  /** Activity / NACE code (4 or 5 digits). Best-effort. */
  naceCode?: string
  /** Original query with detected identifiers stripped — usable as a name search. */
  cleanedName: string
}

/**
 * Extract Belgian KBO/VAT, Dutch KVK, and NACE identifiers from a free-form
 * prefilled query string. Defensive against missing/extra whitespace and `BE`
 * prefix variants. NACE extraction only runs after a KBO/KVK is found, since
 * a 4-digit sequence in an arbitrary company name (year, postal code) would
 * otherwise be a false positive.
 *
 * Detection order matters:
 *   1. Belgian KBO (10 digits, starts with 0) — checked first because it is
 *      a strict superset of the 8-digit check; a 10-digit all-digit string
 *      starting with 0 would otherwise falsely match the KVK branch.
 *   2. Dutch KVK (exactly 8 digits, no leading 0 required).
 *   3. NACE code — only after a registry number is isolated.
 */
export function parsePrefilledQueryIdentifiers(query: string): ParsedPrefilledQueryIdentifiers {
  const result: ParsedPrefilledQueryIdentifiers = { cleanedName: query.trim() }
  if (!query) return result

  // ── Belgian KBO (10 digits, starts with 0) ────────────────────────────
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

  // ── Dutch KVK (exactly 8 digits, not already matched as a KBO fragment) ─
  // Only attempt when no KBO was found — a KBO contains 10 digits and the
  // 8-digit KVK pattern could spuriously match a KBO substring.
  if (!result.kboNumber) {
    // Word-boundary match ensures we don't pick up an 8-digit run inside a
    // longer digit string (e.g. a postal code run embedded in a company name).
    const kvkPattern = /\b(\d{8})\b/
    const kvkMatch = result.cleanedName.match(kvkPattern)
    if (kvkMatch) {
      result.kvkNumber = kvkMatch[1]
      result.cleanedName = result.cleanedName.replace(kvkMatch[0], ' ').trim()
    }
  }

  // ── NACE / SBI code — only after a registry number is isolated ─────────
  const hasRegistryNumber = !!(result.kboNumber || result.kvkNumber)
  if (hasRegistryNumber) {
    const naceMatch = result.cleanedName.match(/\b\d{4,5}\b/)
    if (naceMatch) {
      result.naceCode = naceMatch[0]
      result.cleanedName = result.cleanedName.replace(naceMatch[0], ' ').trim()
    }
  }

  result.cleanedName = result.cleanedName.replace(/\s{2,}/g, ' ').trim()
  return result
}

export class PrefillResolver implements BootstrapResolver<PrefillData> {
  private readonly logger = console

  /**
   * Resolve prefill data from all available sources
   */
  async resolve(
    context: BootstrapContext,
    hints: BootstrapHints,
    identity?: IdentityState,
    sessionData?: Record<string, unknown>
  ): Promise<ResolverResult<PrefillData>> {
    const startTime = performance.now()
    const sources: PrefillSource[] = []

    try {
      const sessionBusinessInfo = (sessionData as any)?._businessInfo as
        | Record<string, unknown>
        | undefined
      const resolvedCountryCode =
        resolveCountryCode(
          (sessionData as any)?.country_code as string | undefined,
          sessionBusinessInfo?.country_code as string | undefined,
          sessionBusinessInfo?.country as string | undefined
        ) || 'BE'

      // Parallel fetch from all sources
      const [kboResult, profileResult, sessionResult] = await Promise.all([
        hints.hasPrefilledQuery && context.prefilledQuery
          ? this.fetchKBO(context.prefilledQuery, resolvedCountryCode)
          : Promise.resolve(null),
        identity?.type === 'authenticated' || identity?.type === 'accountant_for_client'
          ? this.fetchUserProfile(identity)
          : Promise.resolve(null),
        sessionData
          ? Promise.resolve(this.extractSessionPrefill(sessionData as SessionDataForPrefill))
          : Promise.resolve(null),
      ])

      // Track sources
      if (kboResult) sources.push('kbo')
      if (profileResult) sources.push('user_profile')
      if (sessionResult) sources.push('session')

      // Merge company info — see `mergeCompanyInfo` for the precedence rules.
      // Summary: KBO (URL-driven) wins for identity fields when present;
      // otherwise session > profile.
      const companyInfo = this.mergeCompanyInfo(
        sessionResult?.companyInfo,
        profileResult?.companyInfo,
        kboResult?.companyInfo
      )

      const financials = this.mergeFinancials(sessionResult?.financials, profileResult?.financials)

      let businessType = sessionResult?.businessType || profileResult?.businessType

      // Fast path: Titan resolved the business type server-side during the
      // registry search (BE: NACE → mapping; NL: SBI alias → canonical NACE →
      // mapping). Use it directly so we skip the network round-trip below.
      const serverBtId =
        kboResult?.companyInfo?.businessTypeId || kboResult?.kboData?.businessTypeId
      if (!businessType && serverBtId) {
        const serverBusinessType = await this.fetchBusinessType(serverBtId)
        if (serverBusinessType) {
          businessType = serverBusinessType
          this.logger.info('[PrefillResolver] Resolved business type from server enrichment', {
            businessTypeId: serverBtId,
            countryCode: kboResult?.companyInfo?.countryCode,
          })
        }
      }

      // Fallback: Look up business type from NACE/SBI code when server enrichment didn't resolve.
      // Prefer the full activity_code (e.g. 5-digit SBI "62011") over the truncated 4-digit
      // NACE proxy — buildAliasLookupCandidates on the Titan side falls back through the
      // prefix chain, so either will ultimately resolve, but the 5-digit code is more precise.
      const naceCode =
        companyInfo?.activityCode ||
        companyInfo?.naceCode ||
        kboResult?.kboData?.activityCode ||
        kboResult?.kboData?.naceCode
      if (!businessType && naceCode?.trim()) {
        const naceBusinessType = await this.fetchBusinessTypeForNaceCode(
          naceCode.trim(),
          // Prefer the company's own country code; fall back to the session-
          // resolved country so NL companies get SBI alias resolution
          // (country_code=NL triggers the SBI_2008 alias lookup in Titan).
          resolveCountryCode(
            companyInfo?.countryCode as string | undefined,
            (companyInfo as any)?.country as string | undefined
          ) || resolvedCountryCode
        )
        if (naceBusinessType) {
          businessType = naceBusinessType
          this.logger.info('[PrefillResolver] Resolved business type from NACE fallback', {
            naceCode: naceCode.trim(),
            businessTypeId: businessType.id,
          })
        }
      }

      const kboData = kboResult?.kboData

      // Calculate which fields are populated
      const populatedFields = this.getPopulatedFields(companyInfo, financials, businessType)
      const remainingFields = ALL_PREFILL_FIELDS.filter((f) => !populatedFields.includes(f))
      const confidence = calculatePrefillConfidence(populatedFields, ALL_PREFILL_FIELDS)

      this.logger.info('[PrefillResolver] Resolved prefill data', {
        sources,
        populatedFields: populatedFields.length,
        remainingFields: remainingFields.length,
        confidence: confidence.toFixed(2),
      })

      // STP: Detect if this is a synced client with KBO data enriched by backend
      const isAccountantFlow = identity?.type === 'accountant_for_client'
      const hasKboFromBackend = !!(
        companyInfo?.kboNumber &&
        (kboData || profileResult?.companyInfo?.kboNumber)
      )
      const readOnlyKbo = isAccountantFlow && hasKboFromBackend
      const autoAdvancePastPrefilledSteps = readOnlyKbo && confidence > 0.5

      return {
        success: true,
        data: {
          sources,
          companyInfo,
          financials,
          businessType,
          kboData,
          confidence,
          fieldsPopulated: populatedFields,
          fieldsRemaining: remainingFields,
          readOnlyKbo,
          autoAdvancePastPrefilledSteps,
        },
        source: sources.join('+') || 'none',
        durationMs: performance.now() - startTime,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // BANK-GRADE: Log error - prefill failures are non-critical
      this.logger.warn('[PrefillResolver] Resolution failed - continuing without prefill', {
        error: errorMessage,
      })

      return {
        success: false,
        data: this.fallback(),
        error: errorMessage,
        source: 'error',
        durationMs: performance.now() - startTime,
      }
    }
  }

  /**
   * Default empty prefill state
   * BANK-GRADE: Prefill failures are non-critical - form still works
   */
  fallback(): PrefillData {
    return DEFAULT_PREFILL
  }

  /**
   * Fetch KBO registry data for a `prefilledQuery` URL parameter.
   *
   * Strategy:
   *   1. Parse out a Belgian KBO/VAT identifier if present and call the
   *      exact-match `kbo/lookup` endpoint. This is deterministic and
   *      cannot return the wrong company.
   *   2. If no identifier is parseable, fall back to the previous fuzzy
   *      `registry/search` behavior with the cleaned company name.
   */
  private async fetchKBO(
    query: string,
    countryCode: string
  ): Promise<{
    companyInfo?: CompanyInfo
    kboData?: KBOCompanyEntity
  } | null> {
    const identifiers = parsePrefilledQueryIdentifiers(query)
    const hasExactIdentifier = !!(
      identifiers.kboNumber ||
      identifiers.vatNumber ||
      identifiers.kvkNumber
    )
    const kbo = hasExactIdentifier
      ? await this.lookupKBOByIdentifier(identifiers, countryCode)
      : await this.searchKBOByName(identifiers.cleanedName || query, countryCode)

    if (!kbo) return null

    const resolvedKboCountry = resolveCountryCode(kbo.country_code, countryCode) || 'BE'

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
      businessTypeId: kbo.business_type_id,
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
      businessTypeId: kbo.business_type_id,
      businessTypeTitle: kbo.business_type_title,
    }

    this.logger.info('[PrefillResolver] KBO data fetched', {
      companyName: truncateForLog(kbo.company_name, 20),
      kboNumber: kbo.kbo_number,
    })

    return { companyInfo, kboData }
  }

  /**
   * Exact-match registry lookup using a parsed KBO/VAT or KVK identifier.
   *
   * **Belgian KBO/VAT**: routes to the `/kbo/lookup` endpoint which hits the
   * Belgian KBO database directly — deterministic, cannot return the wrong
   * company.
   *
   * **Dutch KVK**: the `/kbo/lookup` endpoint is Belgian-only; sending an
   * 8-digit KVK number there will always 404. Instead we route KVK numbers
   * through the registry search endpoint with `country_code: NL`. The KVK
   * service on Titan detects the 8-digit pattern and performs an exact
   * `filters[kvknummer]` lookup against Overheid.io — same precision,
   * different path.
   */
  private async lookupKBOByIdentifier(
    identifiers: ParsedPrefilledQueryIdentifiers,
    countryCode: string
  ): Promise<RawKboRecord | null> {
    // Dutch KVK — must go through registry/search with country_code=NL.
    // The KVK service detects the 8-digit query and does an exact lookup.
    if (identifiers.kvkNumber) {
      return this.searchKBOByName(identifiers.kvkNumber, 'NL')
    }

    // Belgian KBO/VAT — use the dedicated exact-match lookup endpoint.
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REGISTRY_SEARCH_CLIENT_TIMEOUT_MS)
      const body: Record<string, string> = {}
      if (identifiers.kboNumber) body.kbo_number = identifiers.kboNumber
      if (identifiers.vatNumber) body.vat_number = identifiers.vatNumber
      if (identifiers.cleanedName) body.company_name = identifiers.cleanedName

      const response = await fetch(`${API_URL}/api/v2/registry/kbo/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        // 404 is expected when the identifier doesn't resolve in the registry
        // — fall back to a name search so we still get a best-effort match.
        if (response.status === 404 && identifiers.cleanedName) {
          return this.searchKBOByName(identifiers.cleanedName, countryCode)
        }
        this.logger.warn('[PrefillResolver] KBO lookup failed', {
          status: response.status,
        })
        return null
      }

      const data = await response.json()
      const record = (data?.data || null) as RawKboRecord | null
      return record
    } catch (error) {
      this.logger.error('[PrefillResolver] KBO lookup error:', error)
      return null
    }
  }

  /**
   * Fuzzy registry search by company name. Used as a fallback when no
   * structured identifier is present in the prefilled query.
   */
  private async searchKBOByName(name: string, countryCode: string): Promise<RawKboRecord | null> {
    if (!name || name.trim().length < 2) return null
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REGISTRY_SEARCH_CLIENT_TIMEOUT_MS)
      const response = await fetch(`${API_URL}/api/v2/registry/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_name: name.trim(),
          country_code: countryCode,
          limit: 1,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        this.logger.warn('[PrefillResolver] KBO search failed', {
          status: response.status,
        })
        return null
      }

      const data = await response.json()
      const results = (data?.results || []) as RawKboRecord[]
      return results[0] || null
    } catch (error) {
      this.logger.error('[PrefillResolver] KBO search error:', error)
      return null
    }
  }

  /**
   * Fetch user profile / business card
   */
  private async fetchUserProfile(identity: IdentityState): Promise<{
    companyInfo?: CompanyInfo
    financials?: PartialFinancials
    businessType?: BusinessTypeInfo
  } | null> {
    try {
      // Determine which user to fetch profile for
      const userId =
        identity.type === 'accountant_for_client'
          ? identity.clientContext?.clientUserId
          : identity.userId

      if (!userId) {
        return null
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      }

      // Add client context headers if needed (omit X-Client-User-Id when null - pending invitation)
      if (identity.type === 'accountant_for_client' && identity.clientContext) {
        if (identity.clientContext.clientUserId) {
          headers['X-Client-User-Id'] = identity.clientContext.clientUserId
        }
        headers['X-Accountant-User-Id'] = identity.clientContext.accountantUserId
      }

      // ✅ CRITICAL FIX: Use correct endpoint - /api/v2/business-cards/:userId instead of /api/v2/users/:userId/business-card
      const response = await fetch(`${API_URL}/api/v2/business-cards/${userId}`, {
        method: 'GET',
        credentials: 'include',
        headers,
      })

      if (!response.ok) {
        this.logger.warn('[PrefillResolver] Business card fetch failed', {
          status: response.status,
          userId: truncateForLog(userId),
        })
        return null
      }

      const data = await response.json()
      const profile: UserProfile = data.data || data

      const companyInfo: CompanyInfo = {
        companyName: profile.company_name,
        kboNumber: profile.kbo_number,
        vatNumber: profile.vat_number,
        legalForm: profile.legal_form,
        postalCode: profile.postal_code,
        city: profile.city,
        countryCode: resolveCountryCode(profile.country),
        naceCode: profile.nace_code,
        naceDescription: profile.nace_description,
        foundingYear: profile.founded_year,
      }

      const financials: PartialFinancials = {
        employeeCount: this.parseEmployeeCount(profile.employee_count_range),
      }

      let businessType: BusinessTypeInfo | undefined
      if (profile.business_type_id) {
        businessType = await this.fetchBusinessType(profile.business_type_id)
      }

      this.logger.info('[PrefillResolver] User profile fetched', {
        userId: truncateForLog(userId),
        hasCompanyName: !!profile.company_name,
        hasBusinessType: !!businessType,
      })

      return { companyInfo, financials, businessType }
    } catch (error) {
      this.logger.error('[PrefillResolver] Profile fetch error:', error)
      return null
    }
  }

  /**
   * Fetch business type for a NACE code (reverse lookup).
   * Uses Titan's NACE→business type mapping.
   */
  private async fetchBusinessTypeForNaceCode(
    naceCode: string,
    marketCountryCode?: string
  ): Promise<BusinessTypeInfo | undefined> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const params = new URLSearchParams({ naceCode })
      if (marketCountryCode) {
        params.set('country_code', marketCountryCode.toUpperCase())
      }
      const response = await fetch(
        `${API_URL}/api/v2/nace/codes/${encodeURIComponent(naceCode)}/business-type?${params}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (!response.ok) return undefined

      const data = await response.json()
      const bt = data.business_type
      const confidence = data.confidence ?? 0

      // Only use mapping if confidence is high enough
      if (!bt?.id || confidence < 0.85) return undefined

      return {
        id: bt.id,
        code: bt.id,
        title: bt.title || bt.name,
        category: bt.category?.name ?? bt.category?.title ?? bt.category_id,
        industry: bt.industry ?? bt.category_id,
        industryMapping: bt.industry_mapping ?? bt.id,
        multiples: bt.multiples,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Fetch business type by ID
   */
  private async fetchBusinessType(businessTypeId: string): Promise<BusinessTypeInfo | undefined> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const response = await fetch(`${API_URL}/api/v2/business-types/${businessTypeId}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        return undefined
      }

      const data = await response.json()
      const bt = data.data || data

      return {
        id: bt.id,
        code: bt.code,
        title: bt.title || bt.name,
        category: bt.category,
        industry: bt.industry,
        industryMapping: bt.industry_mapping,
        multiples: bt.multiples,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Extract prefill data from existing session
   */
  private extractSessionPrefill(sessionData: SessionDataForPrefill): {
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
        activityPresentation &&
        canonicalNace &&
        activityPresentation.trim() !== canonicalNace.trim()
          ? activityPresentation
          : canonicalNace,
      naceDescription:
        (merged.activity_label as string) || (merged.nace_description as string) || undefined,
      activityCode: activityPresentation,
      activityLabel: merged.activity_label as string,
      taxonomy: merged.taxonomy as string,
    }

    // Extract financials: prefer top-level, fallback to current_year_data (Mercury accountant flow)
    const cyd = merged.current_year_data as
      | { year?: number; revenue?: number | null; ebitda?: number | null }
      | undefined
    const revenue =
      (merged.revenue as number) ?? (cyd?.revenue != null ? Number(cyd.revenue) : undefined)
    const ebitda =
      (merged.ebitda as number) ?? (cyd?.ebitda != null ? Number(cyd.ebitda) : undefined)
    const yearData =
      (merged.year_data as Record<number, { revenue?: number; ebitda?: number }>) ??
      (merged.yearData as Record<number, { revenue?: number; ebitda?: number }>) ??
      (merged.historical_years_data &&
      Array.isArray(merged.historical_years_data) &&
      merged.historical_years_data.length > 0
        ? Object.fromEntries(
            merged.historical_years_data.map(
              (y: { year: number; revenue?: number; ebitda?: number }) => [
                y.year,
                { revenue: y.revenue, ebitda: y.ebitda },
              ]
            )
          )
        : cyd?.revenue != null || cyd?.ebitda != null
          ? {
              [cyd!.year ?? getCurrentFilingYear()]: {
                revenue: cyd!.revenue ?? undefined,
                ebitda: cyd!.ebitda ?? undefined,
              },
            }
          : undefined)

    const financials: PartialFinancials = {
      revenue,
      ebitda,
      employeeCount: (merged.employee_count ?? merged.number_of_employees) as number,
      yearData,
    }

    let businessType: BusinessTypeInfo | undefined
    if (merged.business_type_id) {
      businessType = {
        id: merged.business_type_id as string,
        title: '', // Will be resolved later if needed
        industry: merged.industry as string,
      }
    }

    return { companyInfo, financials, businessType }
  }

  /**
   * Merge company info from session, user profile, and KBO sources.
   *
   * **Precedence rules:**
   *
   * - When KBO data is present, it came from an explicit URL `prefilledQuery`
   *   (the user navigated here to value *that specific company*). KBO must
   *   beat the signed-in user's business card for the **company identity**
   *   fields (name, KBO/VAT, legal form, address, NACE, founding year).
   *   Otherwise an owner-operator who is also valuing an external target
   *   (e.g. orphaned-seller flow on Mercury) sees their own company's
   *   identity overwrite the URL-driven one. See incident: bakery owner
   *   valuing a restaurant via the dashboard CTA.
   *
   * - For non-identity fields KBO doesn't carry (e.g. `industry`), the
   *   normal session > profile fallback still applies via the spread.
   *
   * - When KBO is absent, fall back to the prior behavior:
   *   session > profile (later sources win in `mergeWithPriority`).
   */
  private mergeCompanyInfo(
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

    // KBO present: identity fields are authoritative. Order: profile, session,
    // kbo so that kbo wins for any field it provides while session/profile
    // still fill gaps (e.g. an `industry` value not present on the KBO record).
    return mergeWithPriority(profile, session, kbo) as CompanyInfo
  }

  /**
   * Merge financials with priority
   */
  private mergeFinancials(
    session?: PartialFinancials,
    profile?: PartialFinancials
  ): PartialFinancials | undefined {
    if (!session && !profile) {
      return undefined
    }

    return mergeWithPriority(profile, session) as PartialFinancials
  }

  /**
   * Get list of populated fields
   */
  private getPopulatedFields(
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

  /**
   * Parse employee count from range string
   */
  private parseEmployeeCount(range?: string): number | undefined {
    if (!range) return undefined

    const rangeMap: Record<string, number> = {
      '1-10': 5,
      '10-50': 25,
      '11-25': 18,
      '26-50': 38,
      '50-100': 75,
      '51-100': 75,
      '100-500': 250,
      '101-500': 250,
      '500+': 750,
    }

    return rangeMap[range.trim()]
  }
}

// Export singleton instance
export const prefillResolver = new PrefillResolver()
