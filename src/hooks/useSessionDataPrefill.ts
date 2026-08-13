/**
 * useSessionDataPrefill Hook
 *
 * Mounted from **ManualLayout** alongside {@link useBootstrapPrefill}. Bootstrap handles
 * first paint; this hook covers late bootstrap, sparse session snapshots, and async
 * NACE→`business_type_id` resolution. Method-agnostic scalars/structs are applied via
 * {@link queueOptionalGapFillFlush} (shared with {@link useSessionOptionalMethodPrefill}) so
 * `mergeOptionalSessionPrefillFields` runs at most once per macrotask.
 *
 * **Session shape:** manual saves and Hermes-backed Titan payloads target the same flat
 * fields; nested `_businessInfo` is merged via {@link mergeSessionSurfaceForOptionalPrefill}.
 *
 * @module hooks/useSessionDataPrefill
 */

import { useEffect, useRef } from 'react'
import { useBootstrapSafe } from '../lib/bootstrap'
import {
  isLegalFormBusinessTypeValue,
  looksLikeNaceCode,
  naceBusinessTypeService,
} from '../services/naceBusinessTypeService'
import { useManualFormStore } from '../store/manual'
import { useSessionStore } from '../store/useSessionStore'
import { parseCompanyGraphContext } from '../types/companyGraphContext'
import type { ValuationFormData } from '../types/valuation'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import { generalLogger } from '../utils/logger'
import {
  getSessionOptionalPrefillSignature,
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
} from '../utils/mergeOptionalSessionPrefillFields'
import { stripBlockedUntrustedOperatingFinancialSurface } from '../utils/officialValuationInputPolicy'
import { SESSION_BUSINESS_CARD_CLEAR_KEYS } from '../utils/optionalSessionPrefillKeys'
import { shouldSuppressMercurySessionPrefill } from '../utils/prefillRestorationGate'
import { formatRegistryCompanyLocation } from '../utils/registryCompanyDisplay'
import { hasConflictingRegistryIdentity } from '../utils/registryIdentity'
import { sanitizeForecastRowsForDcfInputMode } from '../utils/yearData'
import { queueOptionalGapFillFlush } from './sessionOptionalGapFillFlush'

type SessionPrefillMergedData = Record<string, unknown> & {
  company_name?: string
  companyName?: string
  business_type_id?: string
  business_type?: string
  industry?: string
  country_code?: string
  country?: string
  city?: string
  postal_code?: string
  number_of_employees?: number
  employee_count?: number
  founding_year?: number
  founded_year?: number
  business_description?: string
  subIndustry?: string
  business_model?: string
  historical_years_data?: ValuationFormData['historical_years_data']
  current_year_data?: ValuationFormData['current_year_data']
  forecast_years_data?: ValuationFormData['forecast_years_data']
  filing_year_confirmed?: ValuationFormData['filing_year_confirmed']
  comparables?: ValuationFormData['comparables']
  recurring_revenue_percentage?: number
  kbo_number?: string
  vat_number?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string
  business_context?: ValuationFormData['business_context']
  metadata?: Record<string, unknown>
  owner_salary_addback?: number
  nav_hidden_reserves?: number
  saas_arr?: number
  preparer_ev_ebitda_median?: number
  tax_latencies?: unknown[]
  taxLatencies?: unknown[]
  _taxLatencies?: unknown[]
  _normalizations?: unknown[]
  company_graph_context?: unknown
}

function deleteIdentityPrefillFields(updates: Partial<ValuationFormData>): void {
  const record = updates as Record<string, unknown>
  for (const key of SESSION_BUSINESS_CARD_CLEAR_KEYS) {
    delete record[key]
  }
}

/** Fallback prefill from `session.sessionData` when bootstrap did not paint first. */
export function useSessionDataPrefill() {
  // LOOP FIX (React #185 hardening, 2026-05-27):
  // Subscribe ONLY to the values that should trigger a re-fire of the
  // prefill effect — never to `formData.*`. Live form state is read via
  // `useManualFormStore.getState()` inside the effect body (the same
  // pattern useFormSessionSync uses).
  //
  // Background: this hook used to do `const { updateFormData, formData } =
  // useManualFormStore()` (whole-store subscription) and list ~10
  // `formData.X` fields as effect deps. Every prefill commit triggered
  // updateFormData, which created a new `formData` reference, which
  // re-fired the effect. The `hasPrefilledRef` gate broke the loop in
  // the happy case, but during the bootstrap settling window — when
  // `sessionData` churns (useBootstrapSync hydrate, restoration merge,
  // late-arriving package fields) — `optionalPrefillSig` flips, resets
  // the gate, and the cycle runs again. Combined with the parallel
  // bootstrap cascade, this kept tripping the React #185 cascade traced
  // in the Mercury accountant existing-report flow.
  //
  // After this hardening, the only re-fire triggers are:
  //   • sessionData reference change (real new session payload)
  //   • reportId change (SPA navigation)
  //   • restorationComplete flips true
  //   • bootstrap object reference change (settled / errored / mode flip)
  // Form mutations no longer feed back into this hook.
  const sessionData = useSessionStore((state) => state.session?.sessionData) as
    | SessionPrefillMergedData
    | undefined
  const reportId = useSessionStore((state) => state.session?.reportId)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const updateFormData = useManualFormStore((s) => s.updateFormData)
  const hasPrefilledRef = useRef(false)
  const cancelledRef = useRef(false)
  const lastReportIdRef = useRef<string | undefined>(undefined)
  const lastOptionalPrefillSigRef = useRef<string | undefined>(undefined)
  const bootstrap = useBootstrapSafe()

  useEffect(() => {
    cancelledRef.current = false
    if (reportId !== lastReportIdRef.current) {
      lastReportIdRef.current = reportId
      hasPrefilledRef.current = false
      lastOptionalPrefillSigRef.current = undefined
    }

    if (shouldSuppressMercurySessionPrefill(reportId)) {
      generalLogger.debug(
        '[useSessionDataPrefill] Skipping — session restoration already hydrated form for this report',
        { reportId }
      )
      hasPrefilledRef.current = true
      return
    }

    if (!restorationComplete) {
      return
    }
    // Read live form state via getState() — never close over the React-subscribed
    // copy. Subscription was removed to break the self-feedback loop (updateFormData
    // → formData change → effect re-fires → updateFormData → ...). See hook header
    // for full reasoning.
    const formData = useManualFormStore.getState().formData
    // MERCURY FIX: For existing reports, allow fallback when form is empty but session has data
    // Restoration (loadSession) is async - form may stay blank until it completes.
    // If session store has sessionData with company/KBO fields and form is empty, apply as fallback.
    const isExistingReport =
      bootstrap?.report?.mode === 'existing' && bootstrap?.report?.hasExistingData
    const formIsEmpty = !formData.company_name?.trim() && !formData.kbo_number?.trim()
    /** Form already has identity — still allow method/financial gap-fill from session. */
    const skipIdentityOnlyBootstrapShortCircuit = isExistingReport && !formIsEmpty
    const optionalPrefillSig = getSessionOptionalPrefillSignature(sessionData)
    if (optionalPrefillSig !== lastOptionalPrefillSigRef.current) {
      lastOptionalPrefillSigRef.current = optionalPrefillSig
      hasPrefilledRef.current = false
    }
    const sessionFlatRaw =
      sessionData && typeof sessionData === 'object'
        ? mergeSessionSurfaceForOptionalPrefill(sessionData)
        : null
    const sessionFlat = sessionFlatRaw
      ? stripBlockedUntrustedOperatingFinancialSurface(sessionFlatRaw)
      : null
    const sessionHasData = !!(
      sessionFlat?.company_name?.toString().trim() ||
      sessionFlat?.kbo_number ||
      sessionFlat?.kboNumber
    )

    if (isExistingReport && formIsEmpty && !sessionHasData) {
      // Form empty, session empty - wait for loadSession
      return
    }

    // Skip if bootstrap has already prefilled with meaningful data
    // Bootstrap is the primary source - only use session data as fallback
    const bootstrapHasMeaningfulPrefill = !!(
      bootstrap &&
      (bootstrap.prefillData.companyGraphContext ||
        bootstrap.hasPrefilledData ||
        (bootstrap.prefillData.fieldsPopulated?.length ?? 0) > 0 ||
        bootstrap.prefillData.confidence >= 0.05 ||
        bootstrap.prefillData.companyInfo?.companyName?.trim() ||
        bootstrap.prefillData.businessType?.id ||
        (bootstrap.prefillData.financials &&
          ((bootstrap.prefillData.financials.revenue != null &&
            Number.isFinite(Number(bootstrap.prefillData.financials.revenue))) ||
            (bootstrap.prefillData.financials.ebitda != null &&
              Number.isFinite(Number(bootstrap.prefillData.financials.ebitda))) ||
            (bootstrap.prefillData.financials.yearData &&
              Object.keys(bootstrap.prefillData.financials.yearData).length > 0))))
    )

    if (
      bootstrap &&
      !bootstrap.isBootstrapping &&
      bootstrapHasMeaningfulPrefill &&
      !skipIdentityOnlyBootstrapShortCircuit
    ) {
      generalLogger.debug('[useSessionDataPrefill] Skipping - bootstrap already prefilled', {
        confidence: bootstrap.prefillData.confidence.toFixed(2),
        fields: bootstrap.prefillData.fieldsPopulated.length,
      })
      hasPrefilledRef.current = true
      // Bootstrap filled identity/KBO first paint; Hermes+NBB+session blobs may still hydrate
      // afterward. One coalesced optional merge closes DCF/NAV/SaaS/SDE/fiscal gaps — same macrotask
      // semantics as mergeOptional elsewhere (race-safe vs loadSession/async Titan writes).
      queueOptionalGapFillFlush()
      return
    }

    // Skip if no session data
    if (!sessionData) {
      return
    }

    // ✅ FIX: Reset hasPrefilledRef if sessionData changes significantly
    // This allows re-prefill if business card data arrives later
    const hasCompanyNameInSession = !!(
      sessionFlat?.company_name?.toString().trim() || sessionFlat?.companyName?.toString().trim()
    )
    if (hasCompanyNameInSession && hasPrefilledRef.current && !formData.company_name?.trim()) {
      // Business card data arrived but wasn't prefilled - reset flag to allow prefill
      generalLogger.debug(
        '[useSessionDataPrefill] Resetting prefill flag - business card data available but form empty',
        {
          hasSessionCompanyName: hasCompanyNameInSession,
          formCompanyName: formData.company_name,
        }
      )
      hasPrefilledRef.current = false
    }

    // Skip if already prefilled (unless we just reset the flag above)
    if (hasPrefilledRef.current) {
      return
    }

    const mergedData = (sessionFlat ?? {}) as SessionPrefillMergedData
    const rawBi = sessionData._businessInfo
    const businessInfo =
      rawBi && typeof rawBi === 'object' && !Array.isArray(rawBi)
        ? (rawBi as Record<string, unknown>)
        : {}
    const sessionRegistryConflicts = hasConflictingRegistryIdentity(formData, mergedData)

    // Check if merged data has business card fields from Mercury
    const hasBusinessCardData = !!(
      mergedData.company_name ||
      mergedData.business_type_id ||
      mergedData.business_type ||
      mergedData.kbo_number ||
      mergedData.founding_year ||
      mergedData.founded_year
    )

    const hasMethodOrFinancialCues = !!(
      mergedData.current_year_data ||
      (Array.isArray(mergedData.historical_years_data) &&
        mergedData.historical_years_data.length > 0) ||
      mergedData.revenue != null ||
      mergedData.ebitda != null ||
      mergedData.dcf_wacc_pct != null ||
      mergedData.business_context ||
      (Array.isArray(mergedData.comparables) && mergedData.comparables.length > 0) ||
      mergedData.forecast_years_data?.length ||
      (mergedData.year_data &&
        typeof mergedData.year_data === 'object' &&
        !Array.isArray(mergedData.year_data) &&
        Object.keys(mergedData.year_data as object).length > 0) ||
      (mergedData.yearData &&
        typeof mergedData.yearData === 'object' &&
        !Array.isArray(mergedData.yearData) &&
        Object.keys(mergedData.yearData as object).length > 0) ||
      (Array.isArray(mergedData.yearlyFinancials) && mergedData.yearlyFinancials.length > 0) ||
      mergedData.official_financials ||
      mergedData.official_variance_analysis ||
      mergedData.official_verification_badge ||
      mergedData.startup_inputs ||
      (mergedData.metadata &&
        typeof mergedData.metadata === 'object' &&
        !Array.isArray(mergedData.metadata) &&
        Object.keys(mergedData.metadata as object).length > 0) ||
      mergedData.owner_salary_addback != null ||
      mergedData.nav_hidden_reserves != null ||
      mergedData.saas_arr != null ||
      mergedData.preparer_ev_ebitda_median != null ||
      mergedData.tax_latencies?.length ||
      mergedData.taxLatencies?.length ||
      mergedData._taxLatencies?.length ||
      mergedData._normalizations?.length ||
      mergedData.company_graph_context
    )

    const formLive = useManualFormStore.getState().formData
    const hasGapFillFromOptional =
      sessionFlat && typeof sessionFlat === 'object'
        ? Object.keys(mergeOptionalSessionPrefillFields(sessionFlat, formLive)).length > 0
        : false

    if (!hasBusinessCardData && !hasMethodOrFinancialCues && !hasGapFillFromOptional) {
      return
    }

    const hasCompanyName = formData.company_name && formData.company_name.trim() !== ''
    const hasBusinessTypeId = formData.business_type_id && formData.business_type_id !== ''

    const runPrefill = async () => {
      const updates: Partial<ValuationFormData> = {}

      const companyGraphContext = parseCompanyGraphContext(mergedData.company_graph_context)
      if (companyGraphContext) {
        updates.company_graph_context = companyGraphContext
      }

      // ✅ FIX: Always prefill critical fields if they're missing, even if form has other data
      // Basic company information
      // ✅ CRITICAL FIX: Check mergedData.company_name exists and is not empty before prefilling
      if (mergedData.company_name && mergedData.company_name.trim() !== '' && !hasCompanyName) {
        updates.company_name = mergedData.company_name.trim()
        generalLogger.debug('[useSessionDataPrefill] Will prefill company_name', {
          company_name: mergedData.company_name,
          hasCompanyName,
          mergedDataKeys: Object.keys(mergedData),
        })
      } else {
        generalLogger.debug('[useSessionDataPrefill] Skipping company_name prefill', {
          hasMergedDataCompanyName: !!mergedData.company_name,
          mergedDataCompanyName: mergedData.company_name,
          hasCompanyName,
          formCompanyName: formData.company_name,
        })
      }
      // Reject NACE-shaped values: resolve via API instead of using raw value
      const rawBusinessType = mergedData.business_type_id || mergedData.business_type
      if (rawBusinessType && !hasBusinessTypeId && !sessionRegistryConflicts) {
        if (looksLikeNaceCode(rawBusinessType)) {
          try {
            const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
              rawBusinessType.trim(),
              undefined,
              mergedData.country_code || mergedData.country || undefined,
              { guaranteeResolution: true }
            )
            if (cancelledRef.current) return
            if (resolved?.id) {
              const resolvedBusinessTypeId = normalizeBusinessTypeId(resolved.id) ?? resolved.id
              updates.business_type_id = resolvedBusinessTypeId
              if (resolved.category) {
                updates.industry = resolved.category
              }
              generalLogger.debug('[useSessionDataPrefill] Resolved business_type_id from NACE', {
                nace_code: rawBusinessType,
                business_type_id: resolvedBusinessTypeId,
              })
            }
          } catch (_err) {
            generalLogger.debug(
              '[useSessionDataPrefill] NACE lookup failed, skipping business_type_id',
              {
                nace_code: rawBusinessType,
              }
            )
          }
        } else if (!isLegalFormBusinessTypeValue(rawBusinessType)) {
          const normalizedBusinessType = normalizeBusinessTypeId(rawBusinessType)
          if (normalizedBusinessType) {
            updates.business_type_id = normalizedBusinessType
          }
        }
      }
      if (mergedData.founding_year) updates.founding_year = mergedData.founding_year
      if (mergedData.founded_year && !updates.founding_year) {
        // Fallback: use founded_year if founding_year not available
        updates.founding_year = mergedData.founded_year
      }
      if (mergedData.country_code) updates.country_code = mergedData.country_code
      if (mergedData.country && !updates.country_code) {
        // Fallback: use country if country_code not available
        updates.country_code = mergedData.country
      }
      if (mergedData.city) updates.city = mergedData.city
      if (mergedData.postal_code) updates.postal_code = mergedData.postal_code
      if (mergedData.number_of_employees)
        updates.number_of_employees = mergedData.number_of_employees
      if (mergedData.employee_count && !updates.number_of_employees) {
        // Fallback: use employee_count if number_of_employees not available
        updates.number_of_employees = mergedData.employee_count
      }
      if (mergedData.business_description)
        updates.business_description = mergedData.business_description
      if (mergedData.industry && !updates.industry) updates.industry = mergedData.industry
      if (mergedData.subIndustry && !formData.subIndustry)
        updates.subIndustry = mergedData.subIndustry
      if (mergedData.business_model) updates.business_model = mergedData.business_model

      // Financial rows — prefill all valuation methods (multiples, DCF, NAV inputs share these)
      if (
        Array.isArray(mergedData.historical_years_data) &&
        mergedData.historical_years_data.length > 0 &&
        (!formData.historical_years_data || formData.historical_years_data.length === 0)
      ) {
        updates.historical_years_data = mergedData.historical_years_data
      }
      if (
        mergedData.current_year_data &&
        typeof mergedData.current_year_data === 'object' &&
        (!formData.current_year_data ||
          (formData.current_year_data.revenue == null && formData.current_year_data.ebitda == null))
      ) {
        updates.current_year_data = {
          ...(formData.current_year_data && typeof formData.current_year_data === 'object'
            ? formData.current_year_data
            : {}),
          ...mergedData.current_year_data,
        } as ValuationFormData['current_year_data']
      }
      if (
        Array.isArray(mergedData.forecast_years_data) &&
        mergedData.forecast_years_data.length > 0 &&
        (!formData.forecast_years_data || formData.forecast_years_data.length === 0)
      ) {
        const dcfInputMode = mergedData.dcf_input_mode ?? formData.dcf_input_mode ?? 'ebitda'
        updates.forecast_years_data = sanitizeForecastRowsForDcfInputMode(
          mergedData.forecast_years_data,
          { dcfInputMode }
        )
      }
      if (mergedData.dcf_input_mode === 'fcff_only' && formData.dcf_input_mode !== 'fcff_only') {
        updates.dcf_input_mode = 'fcff_only'
      }
      if (mergedData.filing_year_confirmed != null && formData.filing_year_confirmed == null) {
        updates.filing_year_confirmed = mergedData.filing_year_confirmed
      }
      if (mergedData.comparables && !formData.comparables) {
        updates.comparables = mergedData.comparables
      }
      if (
        mergedData.recurring_revenue_percentage != null &&
        formData.recurring_revenue_percentage == null
      ) {
        updates.recurring_revenue_percentage = mergedData.recurring_revenue_percentage
      }

      // KBO registry fields (Phase 1.1 enhancement)
      if (mergedData.kbo_number) updates.kbo_number = mergedData.kbo_number
      if (mergedData.vat_number) updates.vat_number = mergedData.vat_number
      if (mergedData.legal_form) updates.legal_form = mergedData.legal_form
      if (mergedData.nace_code) updates.nace_code = mergedData.nace_code
      if (mergedData.nace_description) updates.nace_description = mergedData.nace_description

      // business_context: merge session (SaaS, ledger analysis, KBO) without clobbering existing keys
      const prevBc =
        formData.business_context && typeof formData.business_context === 'object'
          ? (formData.business_context as Record<string, unknown>)
          : {}
      const sessionBc =
        mergedData.business_context && typeof mergedData.business_context === 'object'
          ? (mergedData.business_context as Record<string, unknown>)
          : null
      if (sessionBc && Object.keys(sessionBc).length > 0) {
        updates.business_context = {
          ...prevBc,
          ...sessionBc,
        } as ValuationFormData['business_context']
      } else if (mergedData.kbo_number) {
        updates.business_context = {
          ...prevBc,
          kbo_registration: mergedData.kbo_number,
          kbo_registration_number: mergedData.kbo_number,
          legal_form: mergedData.legal_form,
          company_id: mergedData.kbo_number,
          company_address: formatRegistryCompanyLocation({
            address:
              (mergedData.company_address as string | undefined) ||
              (mergedData.address as string | undefined),
            postalCode: mergedData.postal_code as string | undefined,
            city: mergedData.city as string | undefined,
          }),
          company_status: 'Active',
          kbo_verified: true,
        } as ValuationFormData['business_context']
      }

      // Revenue prefill from latest valuation or current year data
      if (mergedData.current_year_data?.revenue) {
        updates.revenue = mergedData.current_year_data.revenue
      }

      if (sessionRegistryConflicts) {
        deleteIdentityPrefillFields(updates)
        generalLogger.debug('[useSessionDataPrefill] Skipped stale identity prefill', {
          remainingFields: Object.keys(updates),
        })
      }

      // DCF/NAV/SaaS/etc.: coalesced with useSessionOptionalMethodPrefill via queueOptionalGapFillFlush
      // Apply identity + contextual updates first so optional merge sees overlays in getState().
      if (!cancelledRef.current && Object.keys(updates).length > 0) {
        // Mark applied BEFORE the write so the (cancelled) re-fire path bails
        // cleanly even if it sneaks in. Atomic-set under React 18 batching.
        hasPrefilledRef.current = true
        updateFormData(updates)

        generalLogger.info('[useSessionDataPrefill] Form prefilled from Mercury session data', {
          fields: Object.keys(updates),
          primary_company_identity: sessionData.company_name?.toString().trim()
            ? 'top_level'
            : '_businessInfo_or_other',
          company_name: updates.company_name,
          has_kbo_data: !!(updates.kbo_number || updates.vat_number),
          data_source: {
            from_business_info_keys: Object.keys(businessInfo).length,
            merged_field_keys: Object.keys(mergedData).filter((k) => !k.startsWith('_')).length,
          },
        })
      }

      if (!cancelledRef.current) {
        queueOptionalGapFillFlush()
      }
    }
    runPrefill()
    return () => {
      cancelledRef.current = true
    }
  }, [sessionData, updateFormData, reportId, restorationComplete, bootstrap])
}
