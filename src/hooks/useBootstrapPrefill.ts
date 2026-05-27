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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { buildBusinessTypeFormData } from '../components/ValuationForm/utils/businessTypeFormData'
import { useBootstrapSafe } from '../lib/bootstrap'
import type {
  BusinessTypeInfo,
  CompanyInfo,
  PartialFinancials,
  PrefillData,
  PrefillSource,
} from '../lib/bootstrap/types'
import { isLegalFormBusinessTypeValue } from '../services/naceBusinessTypeService'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { type ImportQualityPerYear, useImportQualityStore } from '../store/useImportQualityStore'
import { useNbbPrefillStore } from '../store/useNbbPrefillStore'
import { useNormalizationStore } from '../store/useNormalizationStore'
import { useSessionStore } from '../store/useSessionStore'
import { useTaxLatencyStore } from '../store/useTaxLatencyStore'
import type { ValuationFormData } from '../types/valuation'
import {
  getCurrentFilingYear,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { buildNormalizationItemsFromImportedLedgerAnalysis } from '../utils/importedLedgerNormalization'
import { buildTaxLatencyCandidatesFromImportedLedgerAnalysis } from '../utils/importedLedgerTaxLatencies'
import { createContextLogger } from '../utils/logger'
import { mapBelgianOfficialRegistryResponseToOfficialFinancials } from '../utils/mapBelgianOfficialRegistryResponse'
import {
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
} from '../utils/mergeOptionalSessionPrefillFields'
import { hasUsableOfficialFinancialsContent } from '../utils/officialFinancialsContent'
import { applyUserVsOfficialVariance } from '../utils/officialFinancialsVariance'
import { resolveTrustComparisonUserFigures } from '../utils/resolveTrustComparisonUserFigures'
import {
  type BootstrapPrefillPatch,
  getRecordNumber,
  getRecordString,
  type ManualBusinessCard,
  readNormalizationItems,
  readTaxLatencyItems,
  resolveCountryCode,
  toTaxLatencyFormInput,
} from './bootstrapPrefillGuards'

const logger = createContextLogger('BootstrapPrefill')

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
  const bootstrapRef = useRef(bootstrap)
  bootstrapRef.current = bootstrap
  const hasPrefilledRef = useRef(false)
  // Belt-and-suspenders against the (theoretically impossible) case where the
  // useLayoutEffect re-fires before the queued microtask drains: scheduling is
  // strictly at-most-once per hook lifetime. Resets only on remount, which is
  // the same lifetime as the global prefill flags below.
  const scheduledRef = useRef(false)
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

    // MERCURY FIX: For existing reports, apply prefill if bootstrap has meaningful data
    // Previously we skipped entirely and deferred to restoration - but loadSession is async,
    // so the form stayed blank until it completed. Bootstrap prefill has the data from
    // Titan's buildPrefill (session_data) - apply it immediately for instant display.
    // Restoration will run when loadSession completes and merge any additional data.
    // Include financials (revenue/EBITDA) so we apply prefill when only financial data exists
    const hasMeaningfulPrefill =
      (bootstrap.prefillData.fieldsPopulated?.length ?? 0) > 0 ||
      bootstrap.prefillData.confidence >= 0.05 ||
      !!bootstrap.prefillData.companyInfo?.companyName?.trim() ||
      !!bootstrap.prefillData.companyInfo?.kboNumber ||
      !!bootstrap.prefillData.kboData?.kboNumber ||
      !!bootstrap.prefillData.companyInfo?.vatNumber ||
      !!bootstrap.prefillData.kboData?.vatNumber ||
      !!bootstrap.prefillData.businessType?.id ||
      !!(
        bootstrap.prefillData.financials &&
        ((bootstrap.prefillData.financials.revenue != null &&
          Number.isFinite(Number(bootstrap.prefillData.financials.revenue))) ||
          (bootstrap.prefillData.financials.ebitda != null &&
            Number.isFinite(Number(bootstrap.prefillData.financials.ebitda))) ||
          (bootstrap.prefillData.financials.yearData &&
            Object.keys(bootstrap.prefillData.financials.yearData).length > 0))
      )

    if (bootstrap.bootstrapError) {
      if (!hasMeaningfulPrefill) {
        logger.warn('Bootstrap failed with no usable prefill; skipping', {
          error: bootstrap.bootstrapError,
        })
        return
      }
      logger.warn('Bootstrap reported an error; applying available partial prefill', {
        error: bootstrap.bootstrapError,
      })
    }

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

    // Reset prefill state when navigating to a different report (enables prefill for new report).
    // scheduledRef is reset here too so the new report can schedule its own microtask — the previous
    // report's microtask has already drained by then (microtasks fire before any SPA nav).
    if (currentReportId && currentReportId !== globalPrefillReportId) {
      resetBootstrapPrefillState()
      scheduledRef.current = false
    }

    // Skip if already prefilled for THIS report (prevents re-prefill on re-mount)
    if (globalPrefillApplied && globalPrefillReportId === currentReportId) {
      hasPrefilledRef.current = true
      setHasPrefilled(true)
      return
    }

    // Skip if no meaningful prefill data (country-only may still be <0.05 if weights change — keep NL/BE path)
    if (!hasMeaningfulPrefill) {
      const countryOnly = resolveCountryCode(bootstrap.prefillData.companyInfo?.countryCode)
      // Defer the only store write on this branch (country_code on a new
      // report) out of the commit phase, symmetric with the main prefill
      // path below. Single-store and value-checked, so the cascade surface
      // is smaller than the four-store path, but the principle holds: never
      // mutate Zustand inside a useLayoutEffect commit.
      if (bootstrap.report.mode === 'new' && countryOnly) {
        queueMicrotask(() => {
          const cur = formStore.getState().formData.country_code?.trim().toUpperCase()
          if (cur !== countryOnly) {
            formStore.getState().updateFormData({ country_code: countryOnly })
          }
          logger.info('Applied bootstrap country prefill (below confidence threshold)', {
            country_code: countryOnly,
            confidence: bootstrap.prefillData.confidence,
          })
        })
      } else {
        logger.debug('No meaningful prefill data from bootstrap', {
          hasPrefilledData: bootstrap.hasPrefilledData,
          confidence: bootstrap.prefillData.confidence,
        })
      }
      // Guards stay synchronous: there is no scheduled write on the "else"
      // path, and the country-write microtask is idempotent + value-checked,
      // so marking applied immediately is safe and prevents the effect from
      // re-firing this branch on subsequent bootstrap context churn.
      globalPrefillApplied = true
      globalPrefillReportId = currentReportId
      hasPrefilledRef.current = true
      setHasPrefilled(true)
      return
    }

    const { prefillData } = bootstrap

    // Get form store actions directly to avoid stale closures
    const { updateFormData, prefillFromBusinessCard } = formStore.getState()

    // Defer prefill out of the useLayoutEffect commit phase. applyPrefillToForm
    // synchronously mutates four Zustand stores (NBB, TaxLatency, Normalization,
    // ManualForm); doing that during commit re-opens the React #185 (Maximum
    // update depth) cascade in the Mercury accountant flow where bootstrap
    // settles well after first commit. queueMicrotask runs after the current
    // commit completes but before paint, so the user still doesn't see an
    // empty→filled flash. Guard sets move inside the microtask so the
    // formDataAfterPrefill log reflects the post-apply state; scheduledRef is
    // the strict at-most-once guard for the schedule itself, in case the
    // bootstrap context churns within the microsecond window between
    // queueMicrotask() and drain.
    if (scheduledRef.current) return
    scheduledRef.current = true
    queueMicrotask(() => {
      applyPrefillToForm(prefillData, updateFormData, prefillFromBusinessCard)

      const formDataAfterPrefill = formStore.getState().formData

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
        formDataAfterPrefill: {
          company_name: formDataAfterPrefill.company_name?.substring(0, 30),
          hasKboNumber: !!formDataAfterPrefill.kbo_number,
          hasBusinessTypeId: !!formDataAfterPrefill.business_type_id,
          hasFoundingYear: !!formDataAfterPrefill.founding_year,
          hasBusinessContext: !!formDataAfterPrefill.business_context,
        },
      })
    })
  }, [bootstrap])

  // Async Belgian official enrichment: poll Titan job and merge into form + prefill when ready.
  useEffect(() => {
    const b = bootstrapRef.current
    if (!b) return
    const jobId = b.prefillData.officialEnrichmentJobId
    if (!jobId || b.isBootstrapping) return

    let cancelled = false
    let attempts = 0
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const maxAttempts = 90

    const schedule = (fn: () => void, ms: number) => {
      timeoutId = setTimeout(fn, ms)
    }

    const clearOfficialJob = (reason: string) => {
      logger.warn('Async Belgian official enrichment poll stopped', {
        jobId: jobId.substring(0, 8),
        reason,
      })
      bootstrapRef.current?.updatePrefillData({ officialEnrichmentJobId: undefined })
    }

    const poll = async () => {
      if (cancelled || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) {
          clearOfficialJob(`max_attempts_${maxAttempts}`)
        }
        return
      }
      attempts += 1
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          credentials: 'include',
        })

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            clearOfficialJob(`http_${res.status}`)
            return
          }
          if (!cancelled) {
            schedule(() => {
              void poll()
            }, 2000)
          }
          return
        }

        const data = (await res.json()) as {
          status?: string
          result?: Record<string, unknown> | null
        }
        if (cancelled) return

        const status = data.status
        if (status === 'completed') {
          if (!data.result || typeof data.result !== 'object') {
            clearOfficialJob('completed_empty_result')
            return
          }
          const fdBefore = formStore.getState().formData
          let mapped = mapBelgianOfficialRegistryResponseToOfficialFinancials(data.result)
          const { updateFormData } = formStore.getState()
          if (mapped && !hasUsableOfficialFinancialsContent(mapped)) {
            clearOfficialJob('completed_no_usable_filing_content')
            return
          }
          if (mapped) {
            const { revenue: userRevenue, ebitda: userEbitda } = resolveTrustComparisonUserFigures(
              fdBefore,
              mapped.filingYear
            )
            mapped = applyUserVsOfficialVariance(
              mapped,
              userRevenue,
              userEbitda,
              fdBefore.official_variance_analysis
            )
            const financialPatch: Partial<ValuationFormData> = {
              official_financials: mapped,
              ...(mapped.varianceAnalysis && {
                official_variance_analysis: mapped.varianceAnalysis,
              }),
              ...(mapped.verificationBadge && {
                official_verification_badge: mapped.verificationBadge,
              }),
            }
            // Mirror Titan bootstrap: non-destructive fill from official filing when user fields are still empty.
            if (fdBefore.revenue == null && mapped.revenue != null) {
              financialPatch.revenue = mapped.revenue
            }
            if (fdBefore.ebitda == null && mapped.ebitda != null) {
              financialPatch.ebitda = mapped.ebitda
            }
            const cyd = fdBefore.current_year_data
            if (cyd && (cyd.revenue == null || cyd.ebitda == null)) {
              financialPatch.current_year_data = {
                ...cyd,
                year: normalizeCurrentYearForFiling(cyd.year, fdBefore.filing_year_confirmed),
                revenue:
                  cyd.revenue == null && mapped.revenue != null ? mapped.revenue : cyd.revenue,
                ebitda: cyd.ebitda == null && mapped.ebitda != null ? mapped.ebitda : cyd.ebitda,
              }
            }
            if (Array.isArray(fdBefore.historical_years_data)) {
              financialPatch.historical_years_data = normalizeHistoricalYearsForFiling(
                fdBefore.historical_years_data,
                fdBefore.filing_year_confirmed
              )
            }
            updateFormData(financialPatch)
            const ctx = bootstrapRef.current
            const prevSources = ctx?.prefillData.sources ?? []
            const withoutPending = prevSources.filter(
              (s) => s !== 'official_belgian_filing_pending'
            )
            const sources: PrefillSource[] = withoutPending.includes('official_belgian_filing')
              ? withoutPending
              : [...withoutPending, 'official_belgian_filing']
            ctx?.updatePrefillData({
              officialFinancials: mapped,
              officialEnrichmentJobId: undefined,
              sources,
            })
            logger.info('Merged async Belgian official enrichment into form', {
              jobId: jobId.substring(0, 8),
            })
          } else {
            clearOfficialJob('completed_unmappable_registry_payload')
          }
          return
        }

        if (status === 'failed') {
          clearOfficialJob('job_failed')
          return
        }

        schedule(() => {
          void poll()
        }, 2000)
      } catch {
        if (!cancelled) {
          schedule(() => {
            void poll()
          }, 2000)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

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
  useNbbPrefillStore.getState().clear()
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
  updateFormData: (data: Partial<ValuationFormData>) => void,
  prefillFromBusinessCard: (card: ManualBusinessCard) => void
): void {
  const { companyInfo, financials, businessType, kboData, officialFinancials } = prefillData

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
  const allData: BootstrapPrefillPatch = {}

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
    // Full market activity code (NL: 5-digit SBI; BE: NACE with dot). Must be persisted
    // so subsequent session re-bootstrap uses the precise code for alias lookup instead
    // of the truncated 4-digit NACE proxy stored in nace_code.
    if (companyInfo.activityCode) allData.activity_code = companyInfo.activityCode
    if (companyInfo.activityLabel) allData.activity_label = companyInfo.activityLabel

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
    if (kboData.activityCode && !allData.activity_code) allData.activity_code = kboData.activityCode
    if (kboData.activityLabel && !allData.activity_label)
      allData.activity_label = kboData.activityLabel
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
    if (financials.importedLedgerAnalysis) {
      allData.business_context = {
        ...(allData.business_context || {}),
        _imported_ledger_analysis: financials.importedLedgerAnalysis,
      }

      const importedNormalizationItems = buildNormalizationItemsFromImportedLedgerAnalysis(
        financials.importedLedgerAnalysis
      )
      if (importedNormalizationItems.length > 0) {
        useNormalizationStore.getState().addItems(importedNormalizationItems)
      }

      const importedTaxLatencyCandidates = buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
        financials.importedLedgerAnalysis
      )
      useTaxLatencyStore.getState().setCandidates(importedTaxLatencyCandidates)
    } else {
      useTaxLatencyStore.getState().setCandidates([])
    }
    if (
      financials.importQuality &&
      typeof financials.importQuality === 'object' &&
      Object.keys(financials.importQuality).length > 0
    ) {
      // Bootstrap doesn't carry `_imported_ledger_provenance` directly. Preserve any provider
      // already set by SessionRestoration so a later bootstrap fire can't clobber the trust
      // attribution. If neither has set it, this is null (correct).
      const existingProvider = useImportQualityStore.getState().provider
      useImportQualityStore
        .getState()
        .setImportQuality(financials.importQuality as Record<string, ImportQualityPerYear>, {
          provider: existingProvider,
        })
    }
    if (financials.saasMetrics) {
      const importedSaasMetrics = financials.saasMetrics
      if (importedSaasMetrics.saas_arr !== undefined)
        allData.saas_arr = importedSaasMetrics.saas_arr
      if (importedSaasMetrics.saas_mrr !== undefined)
        allData.saas_mrr = importedSaasMetrics.saas_mrr
      if (importedSaasMetrics.saas_arr_growth_pct !== undefined)
        allData.saas_arr_growth_pct = importedSaasMetrics.saas_arr_growth_pct
      if (importedSaasMetrics.saas_nrr_pct !== undefined)
        allData.saas_nrr_pct = importedSaasMetrics.saas_nrr_pct
      if (importedSaasMetrics.saas_churn_pct !== undefined)
        allData.saas_churn_pct = importedSaasMetrics.saas_churn_pct
      if (importedSaasMetrics.saas_gross_margin_pct !== undefined)
        allData.saas_gross_margin_pct = importedSaasMetrics.saas_gross_margin_pct
      if (importedSaasMetrics.saas_customer_churn_pct !== undefined) {
        allData.saas_customer_churn_pct = importedSaasMetrics.saas_customer_churn_pct
      }
      if (importedSaasMetrics.saas_customer_concentration_pct !== undefined) {
        allData.saas_customer_concentration_pct =
          importedSaasMetrics.saas_customer_concentration_pct
      }
      if (importedSaasMetrics.saas_expansion_revenue_pct !== undefined) {
        allData.saas_expansion_revenue_pct = importedSaasMetrics.saas_expansion_revenue_pct
      }
      if (importedSaasMetrics.saas_cac !== undefined)
        allData.saas_cac = importedSaasMetrics.saas_cac
      if (importedSaasMetrics.saas_sm_spend !== undefined) {
        allData.saas_sm_spend = importedSaasMetrics.saas_sm_spend
      }

      allData.business_context = {
        ...(allData.business_context || {}),
        _imported_saas_metrics: importedSaasMetrics,
        ...(financials.saasMetricsProvenance && {
          _imported_saas_provenance: financials.saasMetricsProvenance,
        }),
      }
    }

    // Convert yearData or revenue+ebitda to historical_years_data for form display
    // Form expects array of { year, revenue, ebitda } for year-by-year inputs
    const historicalYears: Array<{ year: number; revenue: number; ebitda: number }> = []
    if (financials.yearData && Object.keys(financials.yearData).length > 0) {
      Object.entries(financials.yearData).forEach(([yearStr, data]) => {
        const year = parseInt(yearStr, 10)
        // Keep a year row whenever ANY finite numeric value is present —
        // including legitimate zero. The previous `(data?.revenue || data?.ebitda)`
        // guard silently dropped break-even years AND placeholder rows that the
        // server would otherwise refresh from CBSO/integrations on next sync.
        const hasFiniteRevenue = data?.revenue != null && Number.isFinite(Number(data.revenue))
        const hasFiniteEbitda = data?.ebitda != null && Number.isFinite(Number(data.ebitda))
        if (year >= 2000 && year <= 2100 && (hasFiniteRevenue || hasFiniteEbitda)) {
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
      (financials.revenue !== undefined && Number.isFinite(Number(financials.revenue))) ||
      (financials.ebitda !== undefined && Number.isFinite(Number(financials.ebitda)))
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
      const safeHistoricalYears = normalizeHistoricalYearsForFiling(
        historicalYears,
        allData.filing_year_confirmed
      )
      if (safeHistoricalYears.length > 0) {
        const currentYearRow = safeHistoricalYears[0]
        allData.historical_years_data = safeHistoricalYears.slice(1)
        allData.current_year_data = {
          year: currentYearRow.year,
          revenue: currentYearRow.revenue,
          ebitda: currentYearRow.ebitda,
        }
        // Mirror into the array form the calculator panel and Origineel/Genormaliseerd
        // tiles read from. Without this, panel `yearlyFinancials` keeps its placeholder
        // €0 rows and the normalization modal shows €0 / €0 / €0 even when bootstrap
        // delivered Yuki/CBSO figures. See ManualLayout `originalEBITDAByYear`.
        allData.yearlyFinancials = safeHistoricalYears.map((row) => ({
          year: String(row.year),
          revenue: Number.isFinite(Number(row.revenue)) ? Number(row.revenue) : 0,
          ebitda: Number.isFinite(Number(row.ebitda)) ? Number(row.ebitda) : 0,
        }))
      } else if (financials.yearData && Object.keys(financials.yearData).length > 0) {
        // Every yearData row was beyond the filing window (e.g. only "future" years in H1).
        // Replace stale manual-store defaults (current_year_data is initialized once at module load).
        const filingYear = getCurrentFilingYear()
        allData.current_year_data = {
          year: filingYear,
          revenue: 0,
          ebitda: 0,
        }
        allData.historical_years_data = undefined
      }
    }
  }

  if (officialFinancials && hasUsableOfficialFinancialsContent(officialFinancials)) {
    allData.official_financials = officialFinancials
    if (officialFinancials.varianceAnalysis) {
      allData.official_variance_analysis = officialFinancials.varianceAnalysis
    }
    if (officialFinancials.verificationBadge) {
      allData.official_verification_badge = officialFinancials.verificationBadge
    }
  }

  // 3b. Populate NBB prefill store from multi-year CBSO data
  if (officialFinancials?.historicalYears && officialFinancials.historicalYears.length > 0) {
    useNbbPrefillStore.getState().setFromHistoricalYears(officialFinancials.historicalYears)
    logger.info('Populated NBB prefill store from CBSO multi-year data', {
      yearsCount: officialFinancials.historicalYears.length,
      years: officialFinancials.historicalYears.map((y) => y.fiscalYear),
    })
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
      },
      businessType.industry || businessType.category || 'services'
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

  // Same gap-fill as useSessionDataPrefill: Mercury/session may carry DCF, NAV, SaaS, multiples prep
  // that PrefillResolver does not lift into structured PrefillData — merge from raw sessionData.
  const sessionRaw = useSessionStore.getState().session?.sessionData as
    | Record<string, unknown>
    | undefined
  if (sessionRaw && typeof sessionRaw === 'object') {
    const mergedSession = mergeSessionSurfaceForOptionalPrefill(sessionRaw) as Record<
      string,
      unknown
    >
    const optional = mergeOptionalSessionPrefillFields(mergedSession as Record<string, unknown>, {
      ...useManualFormStore.getState().formData,
      ...allData,
    })
    Object.assign(allData, optional)

    const legalForm =
      getRecordString(mergedSession, 'legal_form') ?? getRecordString(mergedSession, 'legalForm')
    if (!allData.legal_form && legalForm) {
      allData.legal_form = legalForm
    }

    const businessTypeId =
      getRecordString(mergedSession, 'business_type_id') ??
      getRecordString(mergedSession, 'businessTypeId') ??
      getRecordString(mergedSession, 'business_type')
    if (
      !allData.business_type_id &&
      businessTypeId &&
      businessTypeId.trim() &&
      !isLegalFormBusinessTypeValue(businessTypeId)
    ) {
      allData.business_type_id = businessTypeId
    }

    const foundingYear =
      getRecordNumber(mergedSession, 'founding_year') ??
      getRecordNumber(mergedSession, 'founded_year')
    if (
      !allData.founding_year &&
      foundingYear != null &&
      Number.isFinite(Number(foundingYear)) &&
      Number(foundingYear) > 0
    ) {
      allData.founding_year = Number(foundingYear)
    }

    const mergedTaxLatencies =
      readTaxLatencyItems(mergedSession.tax_latencies) ??
      readTaxLatencyItems(mergedSession.taxLatencies) ??
      readTaxLatencyItems(mergedSession._taxLatencies)
    if (mergedTaxLatencies && mergedTaxLatencies.length > 0) {
      if (!Array.isArray(allData.tax_latencies) || allData.tax_latencies.length === 0) {
        allData.tax_latencies = mergedTaxLatencies.map(toTaxLatencyFormInput)
      }
      useTaxLatencyStore.getState().setItems(mergedTaxLatencies)
    }

    const mergedNormalizations = readNormalizationItems(mergedSession._normalizations)
    if (mergedNormalizations && mergedNormalizations.length > 0) {
      useNormalizationStore.getState().setItems(mergedNormalizations)
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
): ManualBusinessCard {
  const resolvedCountryCode = resolveCountryCode(companyInfo.countryCode, fallbackCountryCode)

  return {
    company_name: companyInfo.companyName ?? '',
    industry: businessType?.industry || 'services',
    business_model: businessType?.id || 'other',
    founding_year: companyInfo.foundingYear || getCurrentFilingYear() - 5,
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
    activity_code: companyInfo.activityCode,
    activity_label: companyInfo.activityLabel,
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
