/**
 * useBootstrapPrefill Hook
 *
 * Applies bootstrap prefill data to form stores.
 *
 * WORLD CLASS: Uses useLayoutEffect for synchronous application before paint,
 * preventing visual "jumps" where fields appear empty then fill in.
 *
 * @module hooks/useBootstrapPrefill
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { useBootstrapSafe } from '../lib/bootstrap'
import type {
  BusinessTypeInfo,
  CompanyInfo,
  PartialFinancials,
  PrefillData,
} from '../lib/bootstrap/types'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { buildBusinessTypeFormData } from '../components/ValuationForm/utils/businessTypeFormData'
import { getCurrentFilingYear } from '../utils/fiscalYear'
import { createContextLogger } from '../utils/logger'

const logger = createContextLogger('BootstrapPrefill')

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

// Track if prefill has been applied globally (survives re-renders/re-mounts)
let globalPrefillApplied = false
let globalPrefillReportId: string | null = null

/**
 * Apply bootstrap prefill data to form stores
 *
 * WORLD CLASS: This hook uses useLayoutEffect to apply prefill BEFORE the browser
 * paints, ensuring the form renders with data already populated (no visual jump).
 *
 * It applies prefilled data once after bootstrap completes.
 */
export function useBootstrapPrefill(): {
  hasPrefilled: boolean
  prefillConfidence: number
  readOnlyKbo: boolean
  autoAdvancePastPrefilledSteps: boolean
} {
  const bootstrap = useBootstrapSafe()
  const hasPrefilledRef = useRef(false)
  const [hasPrefilled, setHasPrefilled] = useState(false)

  // Get form store actions - access via getState to avoid re-renders
  const formStore = useManualFormStore

  // WORLD CLASS: Use useLayoutEffect for synchronous execution before paint
  // This ensures the form fields are populated BEFORE the user sees them
  useLayoutEffect(() => {
    // Skip if no bootstrap context
    if (!bootstrap) {
      logger.debug('Bootstrap context not available yet')
      return
    }

    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      logger.debug('Bootstrap still in progress, waiting...')
      return
    }

    // Skip if bootstrap failed
    if (bootstrap.bootstrapError) {
      logger.warn('Bootstrap failed, skipping prefill', {
        error: bootstrap.bootstrapError,
      })
      return
    }

    // MERCURY FIX: For existing reports, apply prefill if bootstrap has meaningful data
    // Previously we skipped entirely and deferred to restoration - but loadSession is async,
    // so the form stayed blank until it completed. Bootstrap prefill has the data from
    // Titan's buildPrefill (session_data) - apply it immediately for instant display.
    // Restoration will run when loadSession completes and merge any additional data.
    // Include financials (revenue/EBITDA) so we apply prefill when only financial data exists
    const hasMeaningfulPrefill =
      bootstrap.hasPrefilledData &&
      bootstrap.prefillData.confidence >= 0.05 &&
      (!!bootstrap.prefillData.companyInfo?.companyName?.trim() ||
        !!bootstrap.prefillData.companyInfo?.kboNumber ||
        !!bootstrap.prefillData.kboData?.kboNumber ||
        !!bootstrap.prefillData.companyInfo?.vatNumber ||
        (bootstrap.prefillData.financials &&
          ((bootstrap.prefillData.financials.revenue != null &&
            bootstrap.prefillData.financials.revenue > 0) ||
            (bootstrap.prefillData.financials.ebitda != null &&
              bootstrap.prefillData.financials.ebitda > 0) ||
            (bootstrap.prefillData.financials.yearData &&
              Object.keys(bootstrap.prefillData.financials.yearData).length > 0))))

    if (
      bootstrap.report.mode === 'existing' &&
      bootstrap.report.hasExistingData &&
      !hasMeaningfulPrefill
    ) {
      logger.info(
        'Skipping prefill - existing report, no meaningful prefill data (deferring to restoration)',
        {
          reportId: bootstrap.report.reportId?.substring(0, 30),
          mode: bootstrap.report.mode,
          hasExistingData: bootstrap.report.hasExistingData,
          confidence: bootstrap.prefillData.confidence,
        }
      )
      hasPrefilledRef.current = true
      setHasPrefilled(true)
      return
    }

    // Get current report ID to track which report we've prefilled
    const currentReportId = bootstrap.report.reportId

    // Reset prefill state when navigating to a different report (enables prefill for new report)
    if (currentReportId && currentReportId !== globalPrefillReportId) {
      resetBootstrapPrefillState()
    }

    // Skip if already prefilled for THIS report (prevents re-prefill on re-mount)
    if (globalPrefillApplied && globalPrefillReportId === currentReportId) {
      hasPrefilledRef.current = true
      setHasPrefilled(true)
      return
    }

    // Skip if no meaningful prefill data (country-only may still be <0.05 if weights change — keep NL/BE path)
    if (!bootstrap.hasPrefilledData || bootstrap.prefillData.confidence < 0.05) {
      const countryOnly = resolveCountryCode(
        bootstrap.prefillData.companyInfo?.countryCode
      )
      if (bootstrap.report.mode === 'new' && countryOnly) {
        queueMicrotask(() => {
          const cur = formStore.getState().formData.country_code?.trim().toUpperCase()
          if (cur === countryOnly) return
          formStore.getState().updateFormData({ country_code: countryOnly })
        })
        logger.info('Applied bootstrap country prefill (below confidence threshold)', {
          country_code: countryOnly,
          confidence: bootstrap.prefillData.confidence,
        })
      } else {
        logger.debug('No meaningful prefill data from bootstrap', {
          hasPrefilledData: bootstrap.hasPrefilledData,
          confidence: bootstrap.prefillData.confidence,
        })
      }
      globalPrefillApplied = true
      globalPrefillReportId = currentReportId
      hasPrefilledRef.current = true
      setHasPrefilled(true)
      return
    }

    const { prefillData } = bootstrap

    // Get form store actions directly to avoid stale closures
    const { updateFormData, prefillFromBusinessCard } = formStore.getState()

    // ✅ FIX: Defer state updates to prevent React error #185
    // useLayoutEffect runs during commit phase; queueMicrotask runs earlier than setTimeout(0)
    // so form store is populated sooner, reducing timing issues with collectedData/initialData
    queueMicrotask(() => {
      // Apply prefill data to form AFTER render completes
      applyPrefillToForm(prefillData, updateFormData, prefillFromBusinessCard)

      // Verify form data was actually set (read after update)
      const formDataAfterPrefill = formStore.getState().formData

      // Mark as prefilled globally and locally
      globalPrefillApplied = true
      globalPrefillReportId = currentReportId
      hasPrefilledRef.current = true
      setHasPrefilled(true)

      logger.info('Applied bootstrap prefill to form (deferred)', {
        sources: prefillData.sources,
        confidence: prefillData.confidence.toFixed(2),
        fieldsPopulated: prefillData.fieldsPopulated.length,
        fieldsRemaining: prefillData.fieldsRemaining.length,
        hasKboData: !!prefillData.kboData,
        companyName: prefillData.companyInfo?.companyName?.substring(0, 20),
        // Verify form data was set
        formDataAfterPrefill: {
          company_name: formDataAfterPrefill.company_name?.substring(0, 30),
          hasKboNumber: !!formDataAfterPrefill.kbo_number,
          hasBusinessTypeId: !!formDataAfterPrefill.business_type_id,
          hasFoundingYear: !!formDataAfterPrefill.founding_year,
          hasBusinessContext: !!formDataAfterPrefill.business_context,
        },
      })
    })
  }, [bootstrap, formStore])

  return {
    hasPrefilled: hasPrefilled || hasPrefilledRef.current,
    prefillConfidence: bootstrap?.prefillData.confidence || 0,
    readOnlyKbo: bootstrap?.prefillData.readOnlyKbo ?? false,
    autoAdvancePastPrefilledSteps: bootstrap?.prefillData.autoAdvancePastPrefilledSteps ?? false,
  }
}

/**
 * Reset prefill state (call when navigating to a new report)
 */
export function resetBootstrapPrefillState(): void {
  globalPrefillApplied = false
  globalPrefillReportId = null
  logger.debug('Bootstrap prefill state reset')
}

/**
 * Apply prefill data to form stores
 *
 * WORLD CLASS: Ensures all fields are populated including KBO data
 * so the company preview card shows immediately.
 */
function applyPrefillToForm(
  prefillData: PrefillData,
  updateFormData: (data: Partial<any>) => void,
  prefillFromBusinessCard: (card: any) => void
): void {
  const { companyInfo, financials, businessType, kboData } = prefillData

  // CRITICAL LOGGING: Log what we received from bootstrap
  logger.debug('applyPrefillToForm called', {
    hasCompanyInfo: !!companyInfo,
    companyInfoCompanyName: companyInfo?.companyName?.substring(0, 30),
    companyInfoCompanyNameType: typeof companyInfo?.companyName,
    companyInfoCompanyNameIsEmpty: companyInfo?.companyName === '',
    companyInfoKeys: companyInfo ? Object.keys(companyInfo).slice(0, 10) : [],
    hasKboData: !!kboData,
    kboDataCompanyName: kboData?.companyName?.substring(0, 30),
    hasBusinessType: !!businessType,
    sources: prefillData.sources,
    prefillConfidence: prefillData.confidence,
    fieldsPopulated: prefillData.fieldsPopulated.slice(0, 10),
  })

  // Collect ALL data to apply in a single update for consistency
  const allData: Record<string, any> = {}

  // 1. Apply company info (priority: companyInfo > kboData)
  if (companyInfo) {
    // CRITICAL FIX: Only set company_name if it's a non-empty string
    // Empty strings mean "no data available" and should be ignored
    if (companyInfo.companyName && companyInfo.companyName.trim() !== '') {
      allData.company_name = companyInfo.companyName
      logger.debug('Set company_name from companyInfo', {
        company_name: companyInfo.companyName.substring(0, 30),
      })
    }
    if (companyInfo.countryCode) allData.country_code = companyInfo.countryCode
    if (companyInfo.foundingYear) allData.founding_year = companyInfo.foundingYear
    if (companyInfo.city) allData.city = companyInfo.city
    if (companyInfo.postalCode) allData.postal_code = companyInfo.postalCode
    if (companyInfo.legalForm) allData.legal_form = companyInfo.legalForm

    // KBO registry fields - CRITICAL for showing the company preview card
    if (companyInfo.kboNumber) allData.kbo_number = companyInfo.kboNumber
    if (companyInfo.vatNumber) allData.vat_number = companyInfo.vatNumber
    if (companyInfo.naceCode) allData.nace_code = companyInfo.naceCode
    if (companyInfo.naceDescription) allData.nace_description = companyInfo.naceDescription

    // CRITICAL FIX: Set business_context from companyInfo if it has KBO data
    // This ensures the KBO confirmation box shows even when data comes from companyInfo (not kboData)
    if (companyInfo.kboNumber) {
      allData.business_context = {
        ...(allData.business_context || {}), // Preserve existing business_context if any
        kbo_registration: companyInfo.kboNumber,
        kbo_registration_number: companyInfo.kboNumber,
        legal_form: companyInfo.legalForm || allData.business_context?.legal_form,
        company_id: companyInfo.kboNumber, // Use KBO number as company ID
        company_address:
          [companyInfo.postalCode, companyInfo.city].filter(Boolean).join(' ') ||
          allData.business_context?.company_address,
        company_status: 'Active',
        kbo_verified: true, // Flag that KBO was verified
      }
      logger.debug('Set business_context from companyInfo KBO data', {
        kbo_registration: companyInfo.kboNumber,
        legal_form: companyInfo.legalForm,
      })
    }
  }

  // 2. Apply KBO data (may have additional fields not in companyInfo)
  if (kboData) {
    // Only override if not already set from companyInfo
    if (kboData.kboNumber && !allData.kbo_number) allData.kbo_number = kboData.kboNumber
    if (kboData.vatNumber && !allData.vat_number) allData.vat_number = kboData.vatNumber
    if (kboData.legalForm && !allData.legal_form) allData.legal_form = kboData.legalForm
    if (kboData.city && !allData.city) allData.city = kboData.city
    if (kboData.postalCode && !allData.postal_code) allData.postal_code = kboData.postalCode
    if (kboData.naceCode && !allData.nace_code) allData.nace_code = kboData.naceCode
    if (kboData.naceDescription && !allData.nace_description)
      allData.nace_description = kboData.naceDescription
    // CRITICAL FIX: Only use kboData.companyName if it's non-empty and we don't already have one
    if (kboData.companyName && kboData.companyName.trim() !== '' && !allData.company_name) {
      allData.company_name = kboData.companyName
      logger.debug('Set company_name from kboData', {
        company_name: kboData.companyName.substring(0, 30),
      })
    }
    if (kboData.countryCode && !allData.country_code) allData.country_code = kboData.countryCode

    // Store KBO verification status in business_context for the preview card
    // CRITICAL FIX: Merge with existing business_context if it was set from companyInfo
    allData.business_context = {
      ...(allData.business_context || {}), // Preserve existing business_context
      kbo_registration: kboData.kboNumber || allData.business_context?.kbo_registration,
      kbo_registration_number:
        kboData.kboNumber || allData.business_context?.kbo_registration_number,
      legal_form: kboData.legalForm || allData.business_context?.legal_form,
      company_id: kboData.kboNumber || allData.business_context?.company_id,
      company_status: kboData.status || allData.business_context?.company_status || 'Active',
      company_address:
        [kboData.postalCode, kboData.city].filter(Boolean).join(' ') ||
        allData.business_context?.company_address,
      kbo_verified: true, // Flag that KBO was verified
    }
    logger.debug('Set business_context from kboData', {
      kbo_registration: kboData.kboNumber,
      legal_form: kboData.legalForm,
    })
  }

  const authoritativeCountryCode = resolveCountryCode(
    allData.country_code,
    companyInfo?.countryCode,
    kboData?.countryCode
  )
  if (authoritativeCountryCode) {
    allData.country_code = authoritativeCountryCode
  }

  // 3. Apply financials
  if (financials) {
    if (financials.revenue !== undefined) allData.revenue = financials.revenue
    if (financials.ebitda !== undefined) allData.ebitda = financials.ebitda
    if (financials.employeeCount !== undefined)
      allData.number_of_employees = financials.employeeCount
    if (financials.yearData) allData.year_data = financials.yearData

    // Convert yearData or revenue+ebitda to historical_years_data for form display
    // Form expects array of { year, revenue, ebitda } for year-by-year inputs
    const historicalYears: Array<{ year: number; revenue: number; ebitda: number }> = []
    if (financials.yearData && Object.keys(financials.yearData).length > 0) {
      Object.entries(financials.yearData).forEach(([yearStr, data]) => {
        const year = parseInt(yearStr, 10)
        if (year >= 2000 && year <= 2100 && (data?.revenue || data?.ebitda)) {
          historicalYears.push({
            year,
            revenue: data.revenue ?? 0,
            ebitda: data.ebitda ?? 0,
          })
        }
      })
      // Only one real year is available — do NOT fabricate a second year by copying
      // identical values. Doing so creates synthetic data that tells the valuation engine
      // the company had zero growth, which depresses growth-driven methods. Instead, leave
      // just the one year; the engine handles single-year inputs correctly.
    } else if (
      (financials.revenue !== undefined && financials.revenue > 0) ||
      (financials.ebitda !== undefined && financials.ebitda > 0)
    ) {
      // Scalar revenue/ebitda (no per-year breakdown available) — prefill current year only.
      // Again, do NOT duplicate to a prior year with identical figures.
      const currentYear = getCurrentFilingYear()
      const rev = financials.revenue ?? 0
      const ebit = financials.ebitda ?? 0
      historicalYears.push({ year: currentYear, revenue: rev, ebitda: ebit })
    }
    if (historicalYears.length > 0) {
      historicalYears.sort((a, b) => b.year - a.year) // Most recent first
      allData.historical_years_data = historicalYears
      allData.current_year_data = {
        year: historicalYears[0].year,
        revenue: historicalYears[0].revenue,
        ebitda: historicalYears[0].ebitda,
      }
    }
  }

  // 4. Apply business type — use buildBusinessTypeFormData so all downstream fields
  // (business_model, _internal_dcf_preference, etc.) are set consistently.
  if (businessType?.id) {
    const btFormData = buildBusinessTypeFormData(
      {
        id: businessType.id,
        // industryMapping is required by BusinessType interface; fall back to industry or category
        industryMapping: businessType.industry || businessType.category || 'services',
        industry: businessType.industry,
        category: businessType.category,
        // Preference fields are not available in bootstrap data — they remain undefined here
        // and will be populated if the user later makes a manual selection.
      } as any,
      businessType.industry || businessType.category || 'services',
    )
    Object.assign(allData, btFormData)

    logger.debug('Applied buildBusinessTypeFormData in bootstrap prefill', {
      business_type_id: businessType.id,
      industry: allData.industry,
      business_model: allData.business_model,
    })
  }

  // CRITICAL: Ensure company_name is set from either companyInfo or kboData
  // This is the most important field and must be set
  // Only use non-empty strings - empty strings mean "no data available"
  if (!allData.company_name || allData.company_name.trim() === '') {
    // Try to get company name from kboData if companyInfo doesn't have it
    if (kboData?.companyName && kboData.companyName.trim() !== '') {
      allData.company_name = kboData.companyName
      logger.debug('Using company_name from kboData (fallback)', {
        company_name: kboData.companyName.substring(0, 30),
      })
    } else {
      logger.warn('No company_name available from bootstrap prefill', {
        hasCompanyInfo: !!companyInfo,
        companyInfoCompanyName: companyInfo?.companyName,
        hasKboData: !!kboData,
        kboDataCompanyName: kboData?.companyName,
      })
    }
  }

  // Apply all data in a single update FIRST
  if (Object.keys(allData).length > 0) {
    logger.debug('Applying prefill data to form', {
      fieldsCount: Object.keys(allData).length,
      fields: Object.keys(allData),
      company_name: allData.company_name?.substring(0, 30),
      hasKboNumber: !!allData.kbo_number,
      kboNumber: allData.kbo_number,
      hasBusinessContext: !!allData.business_context,
      businessContextKboRegistration: allData.business_context?.kbo_registration,
      businessContextKboRegistrationNumber: allData.business_context?.kbo_registration_number,
      businessContextLegalForm: allData.business_context?.legal_form,
      businessContextKboVerified: allData.business_context?.kbo_verified,
      businessContextCompanyId: allData.business_context?.company_id,
    })

    // ✅ FIX: updateFormData is already deferred by queueMicrotask in useLayoutEffect
    // No need for additional deferral here
    updateFormData(allData)
  }

  // ALSO use prefillFromBusinessCard for industry/business_model mapping
  // This ensures proper mapping of business type to industry codes
  // CRITICAL: Only call if we have a non-empty company name to avoid overwriting with empty value
  // ✅ FIX: prefillFromBusinessCard now uses requestAnimationFrame internally to prevent React error #185
  // No need for additional setTimeout here - the function itself handles deferral
  const finalCompanyName = allData.company_name || companyInfo?.companyName || kboData?.companyName
  if (finalCompanyName && finalCompanyName.trim() !== '') {
    // Build business card with the final company name (from allData if set)
    const businessCard = buildBusinessCard(
      { ...companyInfo, companyName: finalCompanyName } as CompanyInfo,
      financials,
      businessType,
      authoritativeCountryCode
    )
    // Call directly - prefillFromBusinessCard now handles deferral internally
    prefillFromBusinessCard(businessCard)
    logger.debug('Called prefillFromBusinessCard', {
      company_name: finalCompanyName.substring(0, 30),
    })
  } else {
    logger.warn('Skipping prefillFromBusinessCard - no company name available', {
      hasCompanyInfo: !!companyInfo,
      hasKboData: !!kboData,
      companyInfoCompanyName: companyInfo?.companyName?.substring(0, 20),
      kboDataCompanyName: kboData?.companyName?.substring(0, 20),
    })
  }
}

/**
 * Build business card from company info
 */
function buildBusinessCard(
  companyInfo: CompanyInfo,
  financials?: PartialFinancials,
  businessType?: BusinessTypeInfo,
  fallbackCountryCode?: string
): any {
  const resolvedCountryCode = resolveCountryCode(
    companyInfo.countryCode,
    fallbackCountryCode
  )

  return {
    company_name: companyInfo.companyName,
    industry: businessType?.industry || 'services',
    business_model: businessType?.id || 'other',
    founding_year: companyInfo.foundingYear || new Date().getFullYear() - 5,
    country_code: resolvedCountryCode || '',
    employee_count: financials?.employeeCount,
    // KBO registry fields
    kbo_number: companyInfo.kboNumber,
    vat_number: companyInfo.vatNumber,
    city: companyInfo.city,
    postal_code: companyInfo.postalCode,
    legal_form: companyInfo.legalForm,
    nace_code: companyInfo.naceCode,
    nace_description: companyInfo.naceDescription,
  }
}

/**
 * Reset prefill state (for testing or re-initialization)
 */
export function resetPrefillState(): void {
  // This would need to be called from outside the hook
  // Typically by re-mounting the component or calling the bootstrap refresh
}

export default useBootstrapPrefill
