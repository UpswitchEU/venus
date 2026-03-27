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
  return normalized.length > 0 ? normalized : undefined
}

function resolveCountryCode(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate)
    if (normalized) return normalized
  }

  return undefined
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

      // Merge with priority: Session > Profile > KBO > URL params
      const companyInfo = this.mergeCompanyInfo(
        sessionResult?.companyInfo,
        profileResult?.companyInfo,
        kboResult?.companyInfo
      )

      const financials = this.mergeFinancials(sessionResult?.financials, profileResult?.financials)

      let businessType = sessionResult?.businessType || profileResult?.businessType

      // Fallback: Look up business type from NACE code when we have nace_code but no businessType
      const naceCode =
        companyInfo?.naceCode || (companyInfo as any)?.nace_code || kboResult?.kboData?.naceCode
      if (!businessType && naceCode?.trim()) {
        const naceBusinessType = await this.fetchBusinessTypeForNaceCode(naceCode.trim())
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
      const hasKboFromBackend = !!(companyInfo?.kboNumber && (kboData || profileResult?.companyInfo?.kboNumber))
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
   * Fetch KBO registry data by company name search
   */
  private async fetchKBO(query: string, countryCode: string): Promise<{
    companyInfo?: CompanyInfo
    kboData?: KBOCompanyEntity
  } | null> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const response = await fetch(`${API_URL}/api/v2/registry/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_name: query,
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
      const results = data.results || []

      if (results.length === 0) {
        return null
      }

      const kbo = results[0]

      const kboData: KBOCompanyEntity = {
        kboNumber: kbo.kbo_number,
        companyName: kbo.company_name,
        legalForm: kbo.legal_form,
        status: kbo.status,
        vatNumber: kbo.vat_number,
        address: kbo.address,
        postalCode: kbo.postal_code,
        city: kbo.city,
        countryCode: resolveCountryCode(kbo.country_code, countryCode) || 'BE',
        naceCode: kbo.nace_code,
        naceDescription: kbo.nace_description,
        foundationDate: kbo.foundation_date,
        isActive: kbo.is_active,
      }

      const companyInfo: CompanyInfo = {
        companyName: kbo.company_name,
        kboNumber: kbo.kbo_number,
        vatNumber: kbo.vat_number,
        legalForm: kbo.legal_form,
        address: kbo.address,
        postalCode: kbo.postal_code,
        city: kbo.city,
        countryCode: resolveCountryCode(kbo.country_code, countryCode) || 'BE',
        naceCode: kbo.nace_code,
        naceDescription: kbo.nace_description,
        foundingYear: kbo.foundation_date ? new Date(kbo.foundation_date).getFullYear() : undefined,
        isActive: kbo.is_active,
      }

      this.logger.info('[PrefillResolver] KBO data fetched', {
        companyName: truncateForLog(kbo.company_name, 20),
        kboNumber: kbo.kbo_number,
      })

      return { companyInfo, kboData }
    } catch (error) {
      this.logger.error('[PrefillResolver] KBO fetch error:', error)
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
    naceCode: string
  ): Promise<BusinessTypeInfo | undefined> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const response = await fetch(
        `${API_URL}/api/v2/nace/codes/${encodeURIComponent(naceCode)}/business-type`,
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
    // Check both top-level and _businessInfo for data
    const businessInfo = sessionData._businessInfo || {}
    const merged = { ...businessInfo, ...sessionData }

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
        (businessInfo as Record<string, unknown>).country as string | undefined
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

    // Extract financials: prefer top-level, fallback to current_year_data (Mercury accountant flow)
    const cyd = merged.current_year_data as { year?: number; revenue?: number | null; ebitda?: number | null } | undefined
    const revenue =
      (merged.revenue as number) ?? (cyd?.revenue != null ? Number(cyd.revenue) : undefined)
    const ebitda =
      (merged.ebitda as number) ?? (cyd?.ebitda != null ? Number(cyd.ebitda) : undefined)
    const yearData =
      (merged.year_data as Record<number, { revenue?: number; ebitda?: number }>) ??
      (merged.historical_years_data &&
      Array.isArray(merged.historical_years_data) &&
      merged.historical_years_data.length > 0
        ? Object.fromEntries(
            merged.historical_years_data.map((y: { year: number; revenue?: number; ebitda?: number }) => [
              y.year,
              { revenue: y.revenue, ebitda: y.ebitda },
            ])
          )
        : cyd?.revenue != null || cyd?.ebitda != null
          ? { [cyd!.year ?? new Date().getFullYear()]: { revenue: cyd!.revenue ?? undefined, ebitda: cyd!.ebitda ?? undefined } }
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
   * Merge company info with priority
   */
  private mergeCompanyInfo(
    session?: CompanyInfo,
    profile?: CompanyInfo,
    kbo?: CompanyInfo
  ): CompanyInfo | undefined {
    if (!session && !profile && !kbo) {
      return undefined
    }

    return mergeWithPriority(kbo, profile, session) as CompanyInfo
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
      if (financials.revenue) populated.push('revenue')
      if (financials.ebitda) populated.push('ebitda')
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
