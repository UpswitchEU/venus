/**
 * Build Startup Valuation Request
 *
 * Single Responsibility: Build the `ValuationRequest` payload for the
 * `startup_valuation` method. Bypasses the SME `buildValuationRequest`
 * pipeline because the venture path does not depend on historical
 * trial-balance data.
 *
 * The shape on the wire is defined by Titan
 * (`apps/titan-api/src/valuations/dto/valuation-request.dto.ts`,
 * `startupInputsSchema`) and consumed by ValuationIQ
 * (`apps/valuation-iq/src/domain/startup_valuation/schemas.py`).
 *
 * @module utils/buildStartupValuationRequest
 */

import { isLegalFormBusinessTypeValue } from '../services/naceBusinessTypeService'
import type { BusinessTypeSegmentInput, ValuationRequest } from '../types/valuation'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { coerceIso2OrNull } from './coerceIso2Country'
import { getCurrentFilingYear } from './fiscalYear'
import { getMercuryUrl } from './getMercuryUrl'
import { normalizeBusinessTypeSegments } from './normalizeBusinessTypeSegments'

export interface BuildStartupValuationRequestOptions {
  companyName: string
  countryCode?: string
  industry?: string
  businessModel?: string
  foundingYear?: number
  naceCode?: string
  naceDescription?: string
  businessTypeId?: string
  businessTypeSegments?: BusinessTypeSegmentInput[]
  businessType?: string
  startupInputs: Record<string, unknown>
  locale?: 'nl' | 'en' | 'fr'
}

const DEFAULT_INDUSTRY = 'technology'
const DEFAULT_BUSINESS_MODEL = 'saas'

/**
 * Build a locale- and environment-aware Mercury URL for the
 * "Invite my Accountant to Certify" CTA on the startup report PDF.
 *
 * `getMercuryUrl()` resolves the right host per environment
 * (preview / staging / production), so PDFs generated in staging
 * link back to staging Mercury rather than production.
 */
function buildAdvisorCtaUrl(locale?: 'nl' | 'en' | 'fr'): string {
  const base = getMercuryUrl().replace(/\/$/, '')
  const loc = locale ?? 'nl'
  const url = new URL(`${base}/${loc}/client/dashboard`)
  url.searchParams.set('source', 'startup_report')
  url.searchParams.set('action', 'invite_accountant')
  return url.toString()
}

/**
 * Build a `ValuationRequest` for the Startup Valuation Engine.
 *
 * The request intentionally:
 *  - sets `current_year_data` to a zero-revenue / zero-EBITDA placeholder
 *    (ValuationIQ's stateless schema requires the field, but the engine
 *    ignores it for the startup path);
 *  - omits `historical_years_data` and `forecast_years_data`;
 *  - hard-pins `selected_method='startup_valuation'` so Titan + ValuationIQ
 *    short-circuit straight to the venture engine.
 */
export function buildStartupValuationRequest({
  companyName,
  countryCode,
  industry,
  businessModel,
  foundingYear,
  naceCode,
  naceDescription,
  businessTypeId,
  businessTypeSegments,
  businessType,
  startupInputs,
  locale,
}: BuildStartupValuationRequestOptions): ValuationRequest {
  const cleanCompanyName = (companyName || 'Unknown Startup').trim() || 'Unknown Startup'
  const cleanCountry = coerceIso2OrNull(countryCode) ?? 'BE'
  const normalizedBusinessTypeId = normalizeBusinessTypeId(businessTypeId)
  const cleanBusinessTypeId =
    normalizedBusinessTypeId && !isLegalFormBusinessTypeValue(normalizedBusinessTypeId)
      ? normalizedBusinessTypeId
      : undefined
  const cleanBusinessTypeSegments = normalizeBusinessTypeSegments(businessTypeSegments)
  const filingYear = getCurrentFilingYear()
  const cleanFoundingYear = (() => {
    const year = Number(foundingYear)
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      return filingYear
    }
    // Cannot be founded after the latest closed-books year used for SME framing.
    return Math.min(year, filingYear)
  })()

  return {
    company_name: cleanCompanyName,
    country_code: cleanCountry,
    industry: industry || DEFAULT_INDUSTRY,
    business_model: businessModel || DEFAULT_BUSINESS_MODEL,
    founding_year: cleanFoundingYear,
    ...(naceCode ? { nace_code: naceCode } : {}),
    ...(naceDescription ? { nace_description: naceDescription } : {}),
    ...(cleanBusinessTypeId ? { business_type_id: cleanBusinessTypeId } : {}),
    ...(cleanBusinessTypeSegments.length > 0
      ? { business_type_segments: cleanBusinessTypeSegments }
      : {}),
    ...(businessType ? { business_type: businessType } : {}),

    // Placeholder financial frame — the Startup Valuation Engine does not
    // consume historical figures; it derives value from qualitative milestones,
    // SAFE/cap-table data and forward-looking traction. Year must align with
    // Titan's `getMaxConfirmableYear()` (calendar year − 1) and filing logic.
    current_year_data: {
      year: getCurrentFilingYear(),
      revenue: 0,
      ebitda: 0,
    },
    historical_years_data: [],
    forecast_years_data: [],

    use_dcf: false,
    use_multiples: false,

    selected_method: 'startup_valuation',
    user_weights: { startup_valuation: 1.0 },

    startup_inputs: startupInputs,

    // Thread the Mercury "invite accountant" deep-link through to the
    // PDF report so the CTA lands on the right environment + locale.
    metadata: {
      startup_advisor_cta_url: buildAdvisorCtaUrl(locale),
    },

    ...(locale ? { locale } : {}),
  }
}
