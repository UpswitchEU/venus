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
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useNbbPrefillStore } from '../store/useNbbPrefillStore'
import { createContextLogger } from '../utils/logger'
import { applyBootstrapPrefillToForm } from './bootstrapPrefillApply'
import { resolveCountryCode } from './bootstrapPrefillGuards'
import { useOfficialEnrichmentPolling } from './useOfficialEnrichmentPolling'

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
  useOfficialEnrichmentPolling(bootstrapRef)
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

    // useBootstrapSync.syncSession owns existing-report prefill (deferred microtask).
    // Running applyPrefillToForm here too double-writes Zustand stores in the same
    // tick as sync — the Mercury accountant handoff crash (React #185).
    if (bootstrap.report.mode === 'existing' && bootstrap.report.hasExistingData) {
      logger.info(
        hasMeaningfulPrefill
          ? 'Skipping duplicate prefill — useBootstrapSync owns existing-report bootstrap data'
          : 'Skipping prefill - existing report, no meaningful prefill data (deferring to restoration)',
        {
          reportId: bootstrap.report.reportId?.substring(0, 30),
          mode: bootstrap.report.mode,
          hasExistingData: bootstrap.report.hasExistingData,
          confidence: bootstrap.prefillData.confidence,
        }
      )
      globalPrefillApplied = true
      globalPrefillReportId = bootstrap.report.reportId
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
      applyBootstrapPrefillToForm(prefillData, updateFormData, prefillFromBusinessCard)

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
 * Reset prefill state (for testing or re-initialization)
 */
export function resetPrefillState(): void {
  // This would need to be called from outside the hook
  // Typically by re-mounting the component or calling the bootstrap refresh
}

export default useBootstrapPrefill
