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
} from '../types';
import { DEFAULT_PREFILL } from '../types';
import { calculatePrefillConfidence, mergeWithPriority, truncateForLog } from '../utils';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                process.env.NEXT_PUBLIC_API_BASE_URL || 
                'https://api.upswitch.app';

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
];

interface UserProfile {
  id: string;
  email?: string;
  company_name?: string;
  business_type_id?: string;
  industry?: string;
  country?: string;
  kbo_number?: string;
  vat_number?: string;
  city?: string;
  postal_code?: string;
  legal_form?: string;
  founded_year?: number;
  employee_count_range?: string;
  nace_code?: string;
  nace_description?: string;
}

interface SessionDataForPrefill {
  company_name?: string;
  business_type_id?: string;
  industry?: string;
  country_code?: string;
  founding_year?: number;
  employee_count?: number;
  revenue?: number;
  ebitda?: number;
  kbo_number?: string;
  vat_number?: string;
  legal_form?: string;
  city?: string;
  postal_code?: string;
  year_data?: Record<number, { revenue?: number; ebitda?: number }>;
  _businessInfo?: Record<string, unknown>;
}

export class PrefillResolver implements BootstrapResolver<PrefillData> {
  private readonly logger = console;

  /**
   * Resolve prefill data from all available sources
   */
  async resolve(
    context: BootstrapContext,
    hints: BootstrapHints,
    identity?: IdentityState,
    sessionData?: Record<string, unknown>
  ): Promise<ResolverResult<PrefillData>> {
    const startTime = performance.now();
    const sources: PrefillSource[] = [];
    
    try {
      // Parallel fetch from all sources
      const [kboResult, profileResult, sessionResult] = await Promise.all([
        hints.hasPrefilledQuery && context.prefilledQuery
          ? this.fetchKBO(context.prefilledQuery)
          : Promise.resolve(null),
        identity?.type === 'authenticated' || identity?.type === 'accountant_for_client'
          ? this.fetchUserProfile(identity)
          : Promise.resolve(null),
        sessionData
          ? Promise.resolve(this.extractSessionPrefill(sessionData as SessionDataForPrefill))
          : Promise.resolve(null),
      ]);

      // Track sources
      if (kboResult) sources.push('kbo');
      if (profileResult) sources.push('user_profile');
      if (sessionResult) sources.push('session');

      // Merge with priority: Session > Profile > KBO > URL params
      const companyInfo = this.mergeCompanyInfo(
        sessionResult?.companyInfo,
        profileResult?.companyInfo,
        kboResult?.companyInfo
      );

      const financials = this.mergeFinancials(
        sessionResult?.financials,
        profileResult?.financials
      );

      const businessType = sessionResult?.businessType || 
                           profileResult?.businessType;

      const kboData = kboResult?.kboData;

      // Calculate which fields are populated
      const populatedFields = this.getPopulatedFields(companyInfo, financials, businessType);
      const remainingFields = ALL_PREFILL_FIELDS.filter(f => !populatedFields.includes(f));
      const confidence = calculatePrefillConfidence(populatedFields, ALL_PREFILL_FIELDS);

      this.logger.info('[PrefillResolver] Resolved prefill data', {
        sources,
        populatedFields: populatedFields.length,
        remainingFields: remainingFields.length,
        confidence: confidence.toFixed(2),
      });

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
        },
        source: sources.join('+') || 'none',
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[PrefillResolver] Resolution failed:', errorMessage);
      
      return {
        success: false,
        data: this.fallback(),
        error: errorMessage,
        source: 'fallback',
        durationMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Fallback for graceful degradation
   */
  fallback(): PrefillData {
    return DEFAULT_PREFILL;
  }

  /**
   * Fetch KBO registry data by company name search
   */
  private async fetchKBO(query: string): Promise<{
    companyInfo?: CompanyInfo;
    kboData?: KBOCompanyEntity;
  } | null> {
    try {
      const response = await fetch(`${API_URL}/api/v2/registry/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_name: query,
          country_code: 'BE',
          limit: 1,
        }),
      });

      if (!response.ok) {
        this.logger.warn('[PrefillResolver] KBO search failed', {
          status: response.status,
        });
        return null;
      }

      const data = await response.json();
      const results = data.results || [];

      if (results.length === 0) {
        return null;
      }

      const kbo = results[0];

      const kboData: KBOCompanyEntity = {
        kboNumber: kbo.kbo_number,
        companyName: kbo.company_name,
        legalForm: kbo.legal_form,
        status: kbo.status,
        vatNumber: kbo.vat_number,
        address: kbo.address,
        postalCode: kbo.postal_code,
        city: kbo.city,
        countryCode: kbo.country_code || 'BE',
        naceCode: kbo.nace_code,
        naceDescription: kbo.nace_description,
        foundationDate: kbo.foundation_date,
        isActive: kbo.is_active,
      };

      const companyInfo: CompanyInfo = {
        companyName: kbo.company_name,
        kboNumber: kbo.kbo_number,
        vatNumber: kbo.vat_number,
        legalForm: kbo.legal_form,
        address: kbo.address,
        postalCode: kbo.postal_code,
        city: kbo.city,
        countryCode: 'BE',
        naceCode: kbo.nace_code,
        naceDescription: kbo.nace_description,
        foundingYear: kbo.foundation_date ? new Date(kbo.foundation_date).getFullYear() : undefined,
        isActive: kbo.is_active,
      };

      this.logger.info('[PrefillResolver] KBO data fetched', {
        companyName: truncateForLog(kbo.company_name, 20),
        kboNumber: kbo.kbo_number,
      });

      return { companyInfo, kboData };
    } catch (error) {
      this.logger.error('[PrefillResolver] KBO fetch error:', error);
      return null;
    }
  }

  /**
   * Fetch user profile / business card
   */
  private async fetchUserProfile(identity: IdentityState): Promise<{
    companyInfo?: CompanyInfo;
    financials?: PartialFinancials;
    businessType?: BusinessTypeInfo;
  } | null> {
    try {
      // Determine which user to fetch profile for
      const userId = identity.type === 'accountant_for_client'
        ? identity.clientContext?.clientUserId
        : identity.userId;

      if (!userId) {
        return null;
      }

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      // Add client context headers if needed
      if (identity.type === 'accountant_for_client' && identity.clientContext) {
        headers['X-Client-User-Id'] = identity.clientContext.clientUserId;
        headers['X-Accountant-User-Id'] = identity.clientContext.accountantUserId;
      }

      const response = await fetch(`${API_URL}/api/v2/users/${userId}/business-card`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        this.logger.warn('[PrefillResolver] Business card fetch failed', {
          status: response.status,
          userId: truncateForLog(userId),
        });
        return null;
      }

      const data = await response.json();
      const profile: UserProfile = data.data || data;

      const companyInfo: CompanyInfo = {
        companyName: profile.company_name,
        kboNumber: profile.kbo_number,
        vatNumber: profile.vat_number,
        legalForm: profile.legal_form,
        postalCode: profile.postal_code,
        city: profile.city,
        countryCode: profile.country || 'BE',
        naceCode: profile.nace_code,
        naceDescription: profile.nace_description,
        foundingYear: profile.founded_year,
      };

      const financials: PartialFinancials = {
        employeeCount: this.parseEmployeeCount(profile.employee_count_range),
      };

      let businessType: BusinessTypeInfo | undefined;
      if (profile.business_type_id) {
        businessType = await this.fetchBusinessType(profile.business_type_id);
      }

      this.logger.info('[PrefillResolver] User profile fetched', {
        userId: truncateForLog(userId),
        hasCompanyName: !!profile.company_name,
        hasBusinessType: !!businessType,
      });

      return { companyInfo, financials, businessType };
    } catch (error) {
      this.logger.error('[PrefillResolver] Profile fetch error:', error);
      return null;
    }
  }

  /**
   * Fetch business type by ID
   */
  private async fetchBusinessType(businessTypeId: string): Promise<BusinessTypeInfo | undefined> {
    try {
      const response = await fetch(`${API_URL}/api/v2/business-types/${businessTypeId}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return undefined;
      }

      const data = await response.json();
      const bt = data.data || data;

      return {
        id: bt.id,
        code: bt.code,
        title: bt.title || bt.name,
        category: bt.category,
        industry: bt.industry,
        industryMapping: bt.industry_mapping,
        multiples: bt.multiples,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Extract prefill data from existing session
   */
  private extractSessionPrefill(sessionData: SessionDataForPrefill): {
    companyInfo?: CompanyInfo;
    financials?: PartialFinancials;
    businessType?: BusinessTypeInfo;
  } {
    // Check both top-level and _businessInfo for data
    const businessInfo = sessionData._businessInfo || {};
    const merged = { ...businessInfo, ...sessionData };

    const companyInfo: CompanyInfo = {
      companyName: merged.company_name as string,
      kboNumber: merged.kbo_number as string,
      vatNumber: merged.vat_number as string,
      legalForm: merged.legal_form as string,
      city: merged.city as string,
      postalCode: merged.postal_code as string,
      countryCode: merged.country_code as string,
      foundingYear: merged.founding_year as number,
    };

    const financials: PartialFinancials = {
      revenue: merged.revenue as number,
      ebitda: merged.ebitda as number,
      employeeCount: merged.employee_count as number,
      yearData: merged.year_data as Record<number, { revenue?: number; ebitda?: number }>,
    };

    let businessType: BusinessTypeInfo | undefined;
    if (merged.business_type_id) {
      businessType = {
        id: merged.business_type_id as string,
        title: '', // Will be resolved later if needed
        industry: merged.industry as string,
      };
    }

    return { companyInfo, financials, businessType };
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
      return undefined;
    }

    return mergeWithPriority(kbo, profile, session) as CompanyInfo;
  }

  /**
   * Merge financials with priority
   */
  private mergeFinancials(
    session?: PartialFinancials,
    profile?: PartialFinancials
  ): PartialFinancials | undefined {
    if (!session && !profile) {
      return undefined;
    }

    return mergeWithPriority(profile, session) as PartialFinancials;
  }

  /**
   * Get list of populated fields
   */
  private getPopulatedFields(
    companyInfo?: CompanyInfo,
    financials?: PartialFinancials,
    businessType?: BusinessTypeInfo
  ): string[] {
    const populated: string[] = [];

    if (companyInfo) {
      if (companyInfo.companyName) populated.push('company_name');
      if (companyInfo.kboNumber) populated.push('kbo_number');
      if (companyInfo.vatNumber) populated.push('vat_number');
      if (companyInfo.legalForm) populated.push('legal_form');
      if (companyInfo.city) populated.push('city');
      if (companyInfo.postalCode) populated.push('postal_code');
      if (companyInfo.countryCode) populated.push('country_code');
      if (companyInfo.foundingYear) populated.push('founding_year');
    }

    if (financials) {
      if (financials.revenue) populated.push('revenue');
      if (financials.ebitda) populated.push('ebitda');
      if (financials.employeeCount) populated.push('employee_count');
    }

    if (businessType) {
      populated.push('business_type_id');
      if (businessType.industry) populated.push('industry');
    }

    return populated;
  }

  /**
   * Parse employee count from range string
   */
  private parseEmployeeCount(range?: string): number | undefined {
    if (!range) return undefined;

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
    };

    return rangeMap[range.trim()];
  }
}

// Export singleton instance
export const prefillResolver = new PrefillResolver();
