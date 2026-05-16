/**
 * useFormSessionSync Hook
 *
 * ROOT CAUSE FIX: Removed session object dependency to prevent render loops
 *
 * Single Responsibility - Sync form changes TO session (one direction only)
 * Restoration is handled centrally by SessionRestorationService.
 * This hook ONLY syncs form changes to session store (debounced).
 *
 * Key Changes:
 * - No longer subscribes to session object (prevents re-renders)
 * - Reads session state internally via getState() when needed
 * - Only subscribes to formData changes
 *
 * @see SessionRestorationService - Centralized restoration service
 * @see useSessionStore.loadSession - Entry point for session loading with restoration
 *
 * @module hooks/useFormSessionSync
 */

import { useCallback, useEffect } from 'react'
import { useSessionStore } from '../store/useSessionStore'
import { useTaxLatencyStore } from '../store/useTaxLatencyStore'
import type { ValuationFormData } from '../types/valuation'
import { debounceWithFlush } from '../utils/debounce'
import {
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { generalLogger } from '../utils/logger'
import {
  mergeSessionSurfaceForOptionalPrefill,
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
  stableOptionalPrefillSourceSignature,
} from '../utils/mergeOptionalSessionPrefillFields'
import { NameGenerator } from '../utils/nameGenerator'
import { buildCurrentYearData, OPTIONAL_YEAR_DATA_FIELDS } from '../utils/yearData'

const SKIP_OPTIONAL_SESSION_SYNC_KEYS = new Set<string>(['revenue', 'ebitda', 'shares_for_sale'])

type AutosyncDataRoot = Record<string, unknown>

type YearMetricsRow = { year: unknown; revenue: unknown; ebitda: unknown }

function fingerprintHistoricalSlice(rows: unknown): YearMetricsRow[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter(
      (y): y is Record<string, unknown> => y != null && typeof y === 'object' && !Array.isArray(y)
    )
    .map((y) => ({ year: y.year, revenue: y.revenue, ebitda: y.ebitda }))
    .sort((a, b) => Number(a.year) - Number(b.year))
}

function isAutosyncComparableRoot(value: unknown): value is AutosyncDataRoot {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function taxLatenciesEqualForAutosync(
  storeItems: unknown[] | undefined,
  sessionData: Record<string, unknown> | null | undefined
): boolean {
  if (storeItems === undefined) return true
  const s = sessionData?._taxLatencies
  const normalized = Array.isArray(s) ? s : []
  return JSON.stringify(storeItems) === JSON.stringify(normalized)
}

/** Exported for tests — debounced autosave must not treat DCF / NAV-only edits as “no change”. */
export function areFormAndSessionDataEqualForAutosync(
  formData: unknown,
  sessionData: unknown,
  taxLatencyItems?: unknown[]
): boolean {
  if (!isAutosyncComparableRoot(formData) || !isAutosyncComparableRoot(sessionData)) {
    return false
  }
  const fd = formData

  /** Flatten `_businessInfo` into top-level fields so manual saves and integration payloads compare equally. */
  const sessionSurface = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<
    string,
    unknown
  >

  const keyFields = [
    'company_name',
    'revenue',
    'ebitda',
    'industry',
    'business_model',
    'founding_year',
    'business_type_id',
    'rev_recurring_amount',
    'rev_top_client_amount',
    'rev_gross_churn_pct',
  ] as const

  for (const field of keyFields) {
    if (fd[field] !== sessionSurface[field]) {
      return false
    }
  }

  if (
    isFilingYearConfirmedValue(fd.filing_year_confirmed) !==
    isFilingYearConfirmedValue(sessionSurface.filing_year_confirmed)
  ) {
    return false
  }

  const formCurrentYear = fd.current_year_data as Record<string, unknown> | undefined
  const sessionCurrentYear = sessionSurface.current_year_data as Record<string, unknown> | undefined
  if (!!formCurrentYear !== !!sessionCurrentYear) {
    return false
  }
  if (formCurrentYear || sessionCurrentYear) {
    const fieldsToCompare = ['year', 'revenue', 'ebitda', ...OPTIONAL_YEAR_DATA_FIELDS]
    for (const field of fieldsToCompare) {
      if (formCurrentYear?.[field] !== sessionCurrentYear?.[field]) {
        return false
      }
    }
  }

  const formHistNorm = Array.isArray(fd.historical_years_data) ? fd.historical_years_data : []
  const sessHistNorm = Array.isArray(sessionSurface.historical_years_data)
    ? sessionSurface.historical_years_data
    : []
  if (formHistNorm.length !== sessHistNorm.length) return false
  const formStr = JSON.stringify(fingerprintHistoricalSlice(formHistNorm))
  const sessStr = JSON.stringify(fingerprintHistoricalSlice(sessHistNorm))
  if (formStr !== sessStr) return false

  const formFc = Array.isArray(fd.forecast_years_data) ? fd.forecast_years_data : []
  const sessFc = Array.isArray(sessionSurface.forecast_years_data)
    ? sessionSurface.forecast_years_data
    : []
  if (formFc.length !== sessFc.length) return false
  const fcFormStr = JSON.stringify(fingerprintHistoricalSlice(formFc))
  const fcSessStr = JSON.stringify(fingerprintHistoricalSlice(sessFc))
  if (fcFormStr !== fcSessStr) return false

  // Inject the store-side tax latencies into the form-side signature
  // surface so the signature comparison stays symmetric with the session
  // (which carries ``_taxLatencies`` directly). Without this, a session
  // with tax latencies always looked "richer" than the form (which holds
  // tax latencies in a separate Zustand store, not on ``formData``), and
  // the signature mismatch fired a spurious PATCH on every bootstrap
  // hydration where Mercury supplied tax latencies. The dedicated
  // ``taxLatenciesEqualForAutosync`` check below still catches a real
  // delta — this only restores form/session signature parity.
  const fdForSig =
    taxLatencyItems !== undefined && Array.isArray(taxLatencyItems) && taxLatencyItems.length > 0
      ? { ...fd, _taxLatencies: taxLatencyItems }
      : fd
  if (
    stableOptionalPrefillSourceSignature(fdForSig) !==
    stableOptionalPrefillSourceSignature(sessionSurface)
  ) {
    return false
  }

  if (!taxLatenciesEqualForAutosync(taxLatencyItems, sessionSurface)) {
    return false
  }

  return true
}

interface UseFormSessionSyncOptions {
  reportId: string | null | undefined
  formData: ValuationFormData
}

/**
 * Hook for synchronizing form data changes TO session store
 *
 * ROOT CAUSE FIX: Reads session state internally to prevent component re-renders
 * Only subscribes to formData changes, not session changes
 * Restoration (session → form) is handled centrally by SessionRestorationService
 */
export const useFormSessionSync = ({ reportId, formData }: UseFormSessionSyncOptions) => {
  const _taxLatencyItems = useTaxLatencyStore((s) => s.items)
  const isDataEqual = useCallback(
    (fd: unknown, sd: unknown, tax: unknown[] | undefined) =>
      areFormAndSessionDataEqualForAutosync(fd, sd, tax),
    []
  )

  // Debounced sync: form data → session store (500ms delay)
  // CRITICAL: Read session state inside the debounced function, not as a dependency
  // This prevents the component from re-rendering when session updates
  // Uses debounceWithFlush for page unload - flush() saves pending changes before tab close
  const debouncedSyncToSession = useCallback(
    debounceWithFlush(async (data: typeof formData) => {
      // Guard: don't sync while restoration is in progress to avoid overwriting restored data
      if (!useSessionStore.getState().restorationComplete) {
        return
      }

      // Read session state inside the debounced function (not subscribed)
      const currentSession = useSessionStore.getState().session
      const updateSessionData = useSessionStore.getState().updateSessionData

      if (!currentSession || !reportId || currentSession.reportId !== reportId) {
        return
      }

      if (!data || Object.keys(data).length === 0) {
        return
      }

      const taxItems = useTaxLatencyStore.getState().items
      // Skip sync if data matches what's already in session (prevents loops during restoration)
      if (currentSession.sessionData && isDataEqual(data, currentSession.sessionData, taxItems)) {
        generalLogger.debug('Skipping sync - form data matches session data', {
          reportId: currentSession.reportId,
        })
        return
      }

      try {
        // Convert ValuationFormData to Partial<ValuationRequest> for session
        // ✅ FIX: Include ALL form fields for complete persistence
        const normalizedCurrentYear = normalizeCurrentYearForFiling(
          data.current_year_data?.year ??
            (data as ValuationFormData & { year?: number | string | null }).year,
          data.filing_year_confirmed
        )
        const normalizedHistoricalYears = normalizeHistoricalYearsForFiling(
          data.historical_years_data,
          data.filing_year_confirmed
        )

        const dataRecord = data as unknown as Record<string, unknown>
        const sessionUpdate: Record<string, unknown> = {
          company_name: data.company_name,
          country_code: data.country_code,
          industry: data.industry,
          subIndustry: data.subIndustry,
          business_model: data.business_model,
          founding_year: data.founding_year,
          business_description: data.business_description,
          business_highlights: data.business_highlights,
          reason_for_selling: data.reason_for_selling,
          city: data.city,
          revenue: data.revenue,
          ebitda: data.ebitda,
          filing_year_confirmed: data.filing_year_confirmed,
          current_year_data: buildCurrentYearData({
            // Respect the explicitly selected base year when the accountant confirms a newer filing year.
            year: normalizedCurrentYear,
            revenue: data.revenue ?? data.current_year_data?.revenue ?? 0,
            ebitda: data.ebitda ?? data.current_year_data?.ebitda ?? 0,
            currentYearData: data.current_year_data,
          }),
          historical_years_data: normalizedHistoricalYears,
          ...(data.forecast_years_data !== undefined && {
            forecast_years_data: data.forecast_years_data,
          }),
          number_of_employees: data.number_of_employees,
          number_of_owners: data.number_of_owners,
          recurring_revenue_percentage: data.recurring_revenue_percentage,
          comparables: data.comparables,
          business_type_id: data.business_type_id,
          business_type: data.business_type,
          shares_for_sale: 100,
          business_context: data.business_context,
          rev_recurring_amount: data.rev_recurring_amount,
          rev_top_client_amount: data.rev_top_client_amount,
          rev_gross_churn_pct: data.rev_gross_churn_pct,
          kbo_number: data.kbo_number,
          vat_number: data.vat_number,
          postal_code: data.postal_code,
          legal_form: data.legal_form,
          nace_code: data.nace_code,
          nace_description: data.nace_description,
        }

        for (const key of OPTIONAL_SESSION_PREFILL_SCALAR_KEYS) {
          if (SKIP_OPTIONAL_SESSION_SYNC_KEYS.has(key)) continue
          const v = dataRecord[key]
          if (v !== undefined) {
            sessionUpdate[key] = v
          }
        }
        for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
          const v = dataRecord[key]
          if (v !== undefined) {
            sessionUpdate[key] = v
          }
        }
        if (data.tax_latencies !== undefined) {
          sessionUpdate.tax_latencies = data.tax_latencies
        }
        if (data.balance_sheet_adjustments !== undefined) {
          sessionUpdate.balance_sheet_adjustments = data.balance_sheet_adjustments
        }
        sessionUpdate._taxLatencies = useTaxLatencyStore.getState().items

        // Remove undefined values
        Object.keys(sessionUpdate).forEach((key) => {
          if (sessionUpdate[key] === undefined) {
            delete sessionUpdate[key]
          }
        })

        // ✅ LOGGING: Verify historical data is synced
        const histForLog = sessionUpdate.historical_years_data
        if (Array.isArray(histForLog)) {
          generalLogger.debug('[useFormSessionSync] Syncing historical data', {
            reportId: currentSession.reportId,
            yearsCount: histForLog.length,
            years: histForLog.map((d) => (d as { year?: unknown }).year),
            yearsWithData: histForLog.map((d) => {
              const row = d as { year?: unknown; revenue?: unknown; ebitda?: unknown }
              return {
                year: row.year,
                hasRevenue: row.revenue != null && Number.isFinite(Number(row.revenue)),
                hasEbitda: row.ebitda != null && Number.isFinite(Number(row.ebitda)),
              }
            }),
          })
        }

        // ✅ FIX: Update local store first
        await updateSessionData(sessionUpdate as Parameters<typeof updateSessionData>[0])

        // ✅ NEW: Auto-update valuation name when company_name changes
        // This ensures name is updated immediately as user types
        const companyNameUpdate = sessionUpdate.company_name
        if (
          typeof companyNameUpdate === 'string' &&
          companyNameUpdate.trim() &&
          currentSession.reportId
        ) {
          const newName = NameGenerator.generateFromCompany(companyNameUpdate)
          const currentName = currentSession.name

          // Only update if name hasn't been manually edited (matches auto-generated pattern or is default)
          const shouldUpdateName =
            !currentName || // No name yet
            currentName === '__new_valuation__' || // Still using default
            currentName.includes('Valuation Report') || // Using default pattern
            currentName === newName || // Already matches
            (currentName.endsWith('business valuation') && newName !== currentName) // Ends with pattern but different company

          if (shouldUpdateName && newName !== currentName) {
            try {
              // Persist name through the centralized session autosave path.
              useSessionStore.getState().updateSession({ name: newName })
              generalLogger.debug('[useFormSessionSync] Queued auto-generated valuation name', {
                reportId: currentSession.reportId,
                companyName: companyNameUpdate,
                newName,
              })
            } catch (error) {
              // Silently fail - name update is non-critical
              generalLogger.debug('[useFormSessionSync] Error updating valuation name', {
                error: error instanceof Error ? error.message : 'Unknown error',
              })
            }
          }
        }

        // ✅ NEW: Persist to backend after updating local store
        // This ensures form fields are saved even if user refreshes before submitting
        try {
          const { saveSession } = useSessionStore.getState()
          await saveSession('autosave') // ✅ FIX: Mark as autosave (debounced form sync)
          generalLogger.debug('Synced form data to session and persisted to backend', {
            reportId: currentSession.reportId,
            fieldsUpdated: Object.keys(sessionUpdate).length,
          })
        } catch (saveError) {
          // Log error but don't throw - local store is updated, backend save can retry
          generalLogger.warn('Failed to persist form data to backend (will retry on next change)', {
            reportId: currentSession.reportId,
            error: saveError instanceof Error ? saveError.message : String(saveError),
            note: 'Local store updated successfully, backend persistence will retry',
          })
        }
      } catch (err) {
        generalLogger.warn('Failed to sync form data to session', { error: err })
      }
    }, 500),
    [] // Only depend on reportId and isDataEqual, not session
  )

  // Sync form data to session store whenever it changes (debounced)
  // CRITICAL: Only subscribes to formData, not session
  useEffect(() => {
    if (formData && Object.keys(formData).length > 0 && reportId) {
      debouncedSyncToSession(formData)
    }
  }, [formData, debouncedSyncToSession, reportId])

  // Flush pending debounced sync on page unload and tab hide to prevent data loss.
  // NOTE: We do NOT flush in cleanup — that can race with unmount and cause async work after
  // unmount (React Strict Mode, fast navigation). beforeunload/pagehide/visibilitychange suffice.
  useEffect(() => {
    const flush = () => debouncedSyncToSession.flush?.()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [debouncedSyncToSession])
}
