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

import {
  type CompanyGraphContext,
  companyGraphContextsMatch,
  isCompanyGraphContextForAudience,
  parseCompanyGraphContext,
} from '../../../types/companyGraphContext'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import { getApiUrl } from '../../../utils/getMercuryUrl'
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
import { calculatePrefillConfidence, truncateForLog } from '../utils'
import { fetchRegistryPrefill, resolveCountryCode } from './PrefillRegistryClient'
import {
  ALL_PREFILL_FIELDS,
  asRecord,
  extractSessionPrefill,
  getPopulatedFields,
  mergeCompanyInfo,
  mergeFinancials,
  parseEmployeeCount,
  readString,
  type SessionDataForPrefill,
} from './PrefillResolverModel'

export { parsePrefilledQueryIdentifiers } from './PrefillRegistryClient'

const API_URL = getApiUrl()

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
  company_graph_context?: unknown
}

function resolveWorkspaceCompanyGraphContext(
  identity: IdentityState | undefined,
  ...candidates: Array<CompanyGraphContext | undefined>
): CompanyGraphContext | undefined {
  const present = candidates.filter((candidate): candidate is CompanyGraphContext => !!candidate)
  if (present.length === 0 || !identity) return undefined

  const expectedAudience = identity.type === 'accountant_for_client' ? 'advisor' : 'owner'
  if (present.some((candidate) => !isCompanyGraphContextForAudience(candidate, expectedAudience))) {
    return undefined
  }
  if (present.some((candidate) => !companyGraphContextsMatch(candidate, present[0]))) {
    return undefined
  }
  return present[0]
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
      const sessionDataRecord = asRecord(sessionData)
      const sessionBusinessInfo = asRecord(sessionDataRecord?._businessInfo)
      const resolvedCountryCode =
        resolveCountryCode(
          readString(sessionDataRecord?.country_code),
          readString(sessionBusinessInfo?.country_code),
          readString(sessionBusinessInfo?.country)
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
          ? Promise.resolve(extractSessionPrefill(sessionData as SessionDataForPrefill))
          : Promise.resolve(null),
      ])

      // Track sources
      if (kboResult) sources.push('kbo')
      if (profileResult) sources.push('user_profile')
      if (sessionResult) sources.push('session')

      // Merge company info — see `mergeCompanyInfo` for the precedence rules.
      // Summary: KBO (URL-driven) wins for identity fields when present;
      // otherwise session > profile.
      const companyInfo = mergeCompanyInfo(
        sessionResult?.companyInfo,
        profileResult?.companyInfo,
        kboResult?.companyInfo
      )

      const financials = mergeFinancials(sessionResult?.financials, profileResult?.financials)
      const companyGraphContext = resolveWorkspaceCompanyGraphContext(
        identity,
        sessionResult?.companyGraphContext,
        profileResult?.companyGraphContext
      )

      let businessType = sessionResult?.businessType || profileResult?.businessType

      // Fast path: Titan resolved the business type server-side during the
      // registry search (BE: NACE → mapping; NL: SBI alias → canonical NACE →
      // mapping). Use it directly so we skip the network round-trip below.
      const serverBtId = normalizeBusinessTypeId(
        kboResult?.companyInfo?.businessTypeId || kboResult?.kboData?.businessTypeId
      )
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
          // `country` is a legacy session/profile field that is not part of
          // the normalized CompanyInfo contract, so read it defensively.
          resolveCountryCode(
            companyInfo?.countryCode,
            readString(asRecord(companyInfo)?.country)
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
      const populatedFields = getPopulatedFields(companyInfo, financials, businessType)
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
          companyGraphContext,
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
    return fetchRegistryPrefill(query, countryCode, { logger: this.logger })
  }

  /**
   * Fetch user profile / business card
   */
  private async fetchUserProfile(identity: IdentityState): Promise<{
    companyInfo?: CompanyInfo
    financials?: PartialFinancials
    businessType?: BusinessTypeInfo
    companyGraphContext?: CompanyGraphContext
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
      const candidateCompanyGraphContext = parseCompanyGraphContext(profile.company_graph_context)
      const expectedAudience = identity.type === 'accountant_for_client' ? 'advisor' : 'owner'
      const companyGraphContext =
        candidateCompanyGraphContext &&
        isCompanyGraphContextForAudience(candidateCompanyGraphContext, expectedAudience)
          ? candidateCompanyGraphContext
          : undefined

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
        employeeCount: parseEmployeeCount(profile.employee_count_range),
      }

      let businessType: BusinessTypeInfo | undefined
      const businessTypeId = normalizeBusinessTypeId(profile.business_type_id)
      if (businessTypeId) {
        businessType = await this.fetchBusinessType(businessTypeId)
      }

      this.logger.info('[PrefillResolver] User profile fetched', {
        userId: truncateForLog(userId),
        hasCompanyName: !!profile.company_name,
        hasBusinessType: !!businessType,
      })

      return { companyInfo, financials, businessType, companyGraphContext }
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

      const businessTypeId = normalizeBusinessTypeId(bt.id)
      if (!businessTypeId) return undefined

      return {
        id: businessTypeId,
        code: businessTypeId,
        title: bt.title || bt.name,
        category: bt.category?.name ?? bt.category?.title ?? bt.category_id,
        industry: bt.industry ?? bt.category_id,
        industryMapping: bt.industry_mapping ?? businessTypeId,
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
      const canonicalBusinessTypeId = normalizeBusinessTypeId(businessTypeId)
      if (!canonicalBusinessTypeId) return undefined

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const response = await fetch(
        `${API_URL}/api/v2/business-types/${encodeURIComponent(canonicalBusinessTypeId)}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (!response.ok) {
        return undefined
      }

      const data = await response.json()
      const bt = data.data || data
      const resolvedBusinessTypeId = normalizeBusinessTypeId(bt.id) ?? canonicalBusinessTypeId

      return {
        id: resolvedBusinessTypeId,
        code: normalizeBusinessTypeId(bt.code) ?? resolvedBusinessTypeId,
        title: bt.title || bt.name,
        category: bt.category,
        industry: bt.industry,
        industryMapping: bt.industry_mapping ?? resolvedBusinessTypeId,
        multiples: bt.multiples,
      }
    } catch {
      return undefined
    }
  }
}

// Export singleton instance
export const prefillResolver = new PrefillResolver()
