/**
 * useBootstrapSync Hook
 *
 * Syncs bootstrap state with existing Venus stores.
 * This is the bridge between the new bootstrap system and existing store architecture.
 *
 * Syncs:
 * - Bootstrap identity → Auth store
 * - Bootstrap prefill → Form store
 * - Bootstrap report → Session store
 * - Bootstrap client context → Client context store
 *
 * @module hooks/useBootstrapSync
 */

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../lib/auth'
import { useBootstrapSafe } from '../lib/bootstrap'
import type { SessionBootstrapState } from '../lib/bootstrap/types'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import type { ValuationFormData, ValuationSession } from '../types/valuation'
import {
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { createContextLogger } from '../utils/logger'
import {
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
  stableOptionalPrefillSourceSignature,
} from '../utils/mergeOptionalSessionPrefillFields'
import {
  buildIdentityFingerprint,
  readNewValuationPrefill,
} from '../utils/newValuationPrefillStorage'
import { extractRenderableHtmlFromSessionPayload } from '../utils/reportHtmlRecovery'
import { getFirstRenderableReportHtml } from '../utils/safetyNetReportHtml'
import {
  buildGapFillPatch,
  buildPrefillFormFields,
  buildPrefillSessionFields,
  CORE_PREFILL_GAP_KEYS,
  mergeBusinessContextGapFill,
  PREFILL_METADATA_GAP_KEYS,
  resolveCountryCode,
} from './bootstrapSyncPrefillMapping'

const logger = createContextLogger('BootstrapSync')

type PrefillDataParam = SessionBootstrapState['prefillData']
type BootstrapMinimalSession = Partial<ValuationSession> & { pdfUrl?: string }
type BootstrapSessionData = NonNullable<ValuationSession['sessionData']> & Record<string, unknown>
type BootstrapPricingRange = NonNullable<SessionBootstrapState['valuationPackage']>['pricingRange']

function asFormPatch(value: Record<string, unknown>): Partial<ValuationFormData> {
  return value as unknown as Partial<ValuationFormData>
}

function asSessionData(value: Record<string, unknown>): BootstrapSessionData {
  return value as unknown as BootstrapSessionData
}

function pricingRangeToValuationResult(
  pricingRange: BootstrapPricingRange
): ValuationSession['valuationResult'] {
  if (!pricingRange) return undefined

  return {
    equity_value_low: pricingRange.min,
    equity_value_mid: pricingRange.mid,
    equity_value_high: pricingRange.max,
    currency: pricingRange.currency,
  } as unknown as ValuationSession['valuationResult']
}

/** Country-only prefill can score below 0.05 confidence — still hydrate form store for new reports */
function applyCountryPrefillIfNewReport(
  report: SessionBootstrapState['report'],
  prefillData: PrefillDataParam
): void {
  if (report.mode !== 'new') return
  const cc = resolveCountryCode(prefillData.companyInfo?.countryCode)
  if (!cc) return
  const cur = useManualFormStore.getState().formData.country_code?.trim().toUpperCase()
  if (cur === cc) return
  useManualFormStore.getState().updateFormData({ country_code: cc })
  logger.info('Applied country from bootstrap (syncSession, no confidence gate)', {
    reportId: report.reportId.substring(0, 30),
    country_code: cc,
  })
}

function hasMeaningfulPrefill(prefillData: PrefillDataParam): boolean {
  if ((prefillData.fieldsPopulated?.length ?? 0) > 0) return true
  if (prefillData.confidence >= 0.05) return true
  if (prefillData.companyInfo?.companyName?.trim()) return true
  if (prefillData.kboData?.companyName?.trim()) return true
  if (prefillData.companyInfo?.canonicalNaceCode?.trim()) return true
  if (prefillData.companyInfo?.taxonomy?.trim()) return true
  if (prefillData.businessType?.id) return true
  if (prefillData.businessType?.category) return true
  if (
    prefillData.financials?.revenue != null &&
    Number.isFinite(Number(prefillData.financials.revenue))
  ) {
    return true
  }
  if (
    prefillData.financials?.ebitda != null &&
    Number.isFinite(Number(prefillData.financials.ebitda))
  ) {
    return true
  }
  if (prefillData.financials?.yearData && Object.keys(prefillData.financials.yearData).length > 0) {
    return true
  }
  if (
    Array.isArray(prefillData.officialFinancials?.historicalYears) &&
    prefillData.officialFinancials.historicalYears.length > 0
  ) {
    return true
  }
  return false
}

function stableBootstrapSyncSignature(state: SessionBootstrapState): string {
  const p = state.prefillData
  const prefillSurfaceSig = stableOptionalPrefillSourceSignature(
    mergeSessionSurfaceForOptionalPrefill(buildPrefillSessionFields(p))
  )
  const ci = p.companyInfo ?? {}
  const sources = [...(p.sources ?? [])].sort().join(',')
  const pkg = state.valuationPackage
  const pkgFormSig = pkg?.formData
    ? stableOptionalPrefillSourceSignature(mergeSessionSurfaceForOptionalPrefill(pkg.formData))
    : 'none'
  const pkgSig = pkg
    ? [
        String(pkg.versions?.current ?? ''),
        String(pkg.versions?.total ?? ''),
        String(pkg.htmlReport?.length ?? 0),
        String(
          Object.keys(pkg.formData ?? {})
            .sort()
            .join(',')
        ),
        pkg.pricingRange
          ? `${pkg.pricingRange.min}:${pkg.pricingRange.mid}:${pkg.pricingRange.max}:${pkg.pricingRange.currency}`
          : '',
        pkgFormSig,
      ].join(':')
    : 'none'
  return [
    state.report.reportId,
    state.report.mode,
    String(state.report.hasExistingData),
    p.confidence.toFixed(4),
    (p.fieldsPopulated ?? []).slice().sort().join(','),
    prefillSurfaceSig,
    String(ci.companyName ?? ''),
    String(ci.kboNumber ?? ''),
    String(ci.canonicalNaceCode ?? ''),
    String(ci.taxonomy ?? ''),
    sources,
    pkgSig,
  ].join('|')
}

interface SyncStatus {
  identity: boolean
  session: boolean
  prefill: boolean
  clientContext: boolean
}

/**
 * Sync bootstrap state with existing stores
 *
 * This hook is the key integration point that bridges the new bootstrap system
 * with the existing store architecture. It ensures all stores are populated
 * with bootstrap data when bootstrap completes.
 */
// Module-level ref used by sync functions (shared across hook instances)
const syncStatusRef = {
  current: { identity: false, session: false, prefill: false, clientContext: false } as SyncStatus,
}

/** Single sync per report+signature — ValuationReport and ManualLayout both mount this hook. */
let globalBootstrapSyncReportId: string | null = null
let globalBootstrapSyncSignature: string | null = null
let globalBootstrapSyncScheduledKey: string | null = null

function resetGlobalBootstrapSyncGate(nextReportId?: string | null): void {
  if (nextReportId && globalBootstrapSyncReportId === nextReportId) return
  globalBootstrapSyncReportId = null
  globalBootstrapSyncSignature = null
  globalBootstrapSyncScheduledKey = null
}

/** Force-clear sync dedupe after bootstrap retry (same reportId must re-run setEngine). */
export function resetBootstrapSyncGateForRetry(): void {
  globalBootstrapSyncReportId = null
  globalBootstrapSyncSignature = null
  globalBootstrapSyncScheduledKey = null
}

/** @internal Vitest-only — clears module dedupe between cases */
export function resetGlobalBootstrapSyncGateForTests(): void {
  resetGlobalBootstrapSyncGate()
}

export function useBootstrapSync(): {
  isSynced: boolean
  syncStatus: SyncStatus
} {
  const bootstrap = useBootstrapSafe()
  const [isSynced, setIsSynced] = useState(false)
  const hasSyncedRef = useRef(false)
  const lastSyncSignatureRef = useRef<string | undefined>(undefined)
  /** Enables re-sync when navigating to another report without remounting ManualLayout */
  const lastSyncedReportIdRef = useRef<string | undefined>(undefined)
  /**
   * Microtask scheduling guard. Set to the signature of the sync we've
   * already scheduled (not yet drained). Prevents double-scheduling when
   * the effect re-fires between `queueMicrotask` and the microtask
   * actually running — e.g. if BootstrapProvider's `setState` from
   * `setEngine` triggers another bootstrap state update in the same
   * tick. Cleared inside the microtask body before the writes happen
   * so the next legitimate signature change can schedule again.
   */
  const syncScheduledForSignatureRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!bootstrap) {
      return
    }

    const reportId = bootstrap.state?.report?.reportId?.trim()
    if (reportId && lastSyncedReportIdRef.current && lastSyncedReportIdRef.current !== reportId) {
      hasSyncedRef.current = false
      lastSyncSignatureRef.current = undefined
      syncScheduledForSignatureRef.current = undefined
      resetGlobalBootstrapSyncGate()
      setIsSynced(false)
      logger.info('Bootstrap reportId changed — resetting sync gate for new valuation', {
        previousReportId: lastSyncedReportIdRef.current.substring(0, 30),
        nextReportId: reportId.substring(0, 30),
      })
    }

    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      return
    }

    // Skip if bootstrap failed — clear dedupe so a successful retry re-runs setEngine.
    if (bootstrap.bootstrapError) {
      hasSyncedRef.current = false
      lastSyncSignatureRef.current = undefined
      syncScheduledForSignatureRef.current = undefined
      resetBootstrapSyncGateForRetry()
      setIsSynced(false)
      logger.warn('Bootstrap failed, skipping sync', {
        error: bootstrap.bootstrapError,
      })
      return
    }

    const state = bootstrap.state
    const syncSignature = stableBootstrapSyncSignature(state)
    const syncKey = `${reportId ?? 'none'}:${syncSignature}`

    const engineReady = !!useSessionStore.getState().engine
    if (
      globalBootstrapSyncReportId === reportId &&
      globalBootstrapSyncSignature === syncSignature &&
      engineReady
    ) {
      if (!hasSyncedRef.current) {
        hasSyncedRef.current = true
        lastSyncSignatureRef.current = syncSignature
        if (reportId) lastSyncedReportIdRef.current = reportId
        setIsSynced(true)
      }
      return
    }

    if (hasSyncedRef.current && syncSignature === lastSyncSignatureRef.current) {
      return
    }
    // Already scheduled for this exact signature — let the in-flight microtask
    // finish; re-scheduling would queue duplicate writes against the same data.
    if (
      syncScheduledForSignatureRef.current === syncSignature ||
      globalBootstrapSyncScheduledKey === syncKey
    ) {
      return
    }
    syncScheduledForSignatureRef.current = syncSignature
    globalBootstrapSyncScheduledKey = syncKey

    // Defer the cross-store sync to a microtask — see history comment below.
    //
    // syncSession mutates two stores synchronously (session via
    // `hydrateSessionAndComplete`, form via `updateFormData`), and
    // syncClientContext mutates a third (clientContext via
    // `setClientContext`). Running them inside the current useEffect
    // body means subscribers downstream of `bootstrap` (BootstrapProvider
    // value, ManualLayout's hook chain) see those notifications in the
    // SAME tick as the bootstrap state update. The combined cascade is what
    // kept tripping React #185 in the Mercury accountant
    // existing-report flow even after the engine-null + atomic-seed +
    // useBootstrapPrefill microtask fixes — same root cause (multiple
    // store notifications inside one commit window), different surface.
    //
    // queueMicrotask runs after the current commit's subscribers settle
    // but before paint, so we don't introduce a visible empty→filled
    // flash. React 18 auto-batches the resulting setStates across stores
    // into a single re-render per subscriber.
    queueMicrotask(() => {
      // Re-check: bootstrap may have errored/been cleared between schedule
      // and drain. The captured `state` is fine to use (we copied it at
      // schedule time and won't react to mutations), but we want to honour
      // a fresh error if one came in.
      if (bootstrap.bootstrapError) {
        syncScheduledForSignatureRef.current = undefined
        globalBootstrapSyncScheduledKey = null
        return
      }

      // Engine + session hydrate in one microtask (React #185 hardening): calling
      // `setEngine` synchronously in BootstrapProvider after `setState(result)` caused
      // an extra Zustand notification in the same commit window as this effect scheduling.
      syncEngine(state)
      syncIdentity(state)
      syncSession(state)
      syncClientContext(state)

      // New + existing report hydrates use `hydrateSessionAndComplete` inside
      // syncSession (status='loaded' in the same notification).

      hasSyncedRef.current = true
      lastSyncSignatureRef.current = syncSignature
      if (reportId) {
        lastSyncedReportIdRef.current = reportId
      }
      // Clear the schedule guard AFTER the writes so a re-render between
      // here and the next effect run can re-schedule if the signature has
      // legitimately changed.
      syncScheduledForSignatureRef.current = undefined
      globalBootstrapSyncScheduledKey = null
      globalBootstrapSyncReportId = reportId ?? null
      globalBootstrapSyncSignature = syncSignature
      setIsSynced(true)

      logger.info('Bootstrap sync complete (deferred)', {
        syncStatus: syncStatusRef.current,
        identityType: state.identity.type,
        reportMode: state.report.mode,
        prefillConfidence: state.prefillData.confidence.toFixed(2),
      })
    })
  }, [bootstrap])

  return {
    isSynced,
    syncStatus: { ...syncStatusRef.current },
  }
}

/**
 * Set session engine from bootstrap identity (deferred with sync microtask).
 */
function syncEngine(state: SessionBootstrapState): void {
  try {
    useSessionStore.getState().setEngine(state.identity)
    logger.debug('Session engine set from bootstrap sync', {
      identityType: state.identity.type,
    })
  } catch (error) {
    logger.error('Failed to set session engine from bootstrap', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Sync identity from bootstrap to auth store
 */
function syncIdentity(state: SessionBootstrapState): void {
  try {
    const { identity } = state
    const authStore = useAuthStore.getState()

    // Only sync if we have user data that auth store doesn't have
    if (identity.type === 'authenticated' && identity.userId) {
      // Check if auth store already has the user
      if (!authStore.user || authStore.user.id !== identity.userId) {
        // Auth store handles its own initialization via cookies
        // We don't override it, but we can trigger a refresh if needed
        logger.debug('Bootstrap identity differs from auth store', {
          bootstrapUserId: identity.userId?.substring(0, 8),
          authStoreUserId: authStore.user?.id?.substring(0, 8),
        })
      }
    }

    syncStatusRef.current.identity = true
  } catch (error) {
    logger.error('Failed to sync identity', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Sync session state from bootstrap to session store
 *
 * WORLD CLASS: Creates or updates session in store with bootstrap data.
 * This prevents redundant API calls when bootstrap has already resolved the session.
 */
function syncSession(state: SessionBootstrapState): void {
  try {
    const { report, prefillData, identity } = state
    const sessionStore = useSessionStore.getState()

    // Check if session store already has this report
    const storeHasSession = sessionStore.session?.reportId === report.reportId

    if (storeHasSession) {
      logger.debug('Session already in store, checking for prefill updates', {
        reportId: report.reportId.substring(0, 30),
      })
      const currentSession = sessionStore.session
      if (!currentSession) return
      const currentSessionData = currentSession.sessionData || {}
      const hasPrefill = hasMeaningfulPrefill(prefillData)
      const prefillSessionFields = hasPrefill ? buildPrefillSessionFields(prefillData) : {}
      const prefillFormFields = hasPrefill ? buildPrefillFormFields(prefillData) : {}
      const pkg = state.valuationPackage
      const packageRenderableHtml = getFirstRenderableReportHtml(pkg?.htmlReport)
      const packageSurface =
        pkg?.formData && typeof pkg.formData === 'object'
          ? mergeSessionSurfaceForOptionalPrefill(pkg.formData)
          : {}
      const hasPackage = Boolean(
        pkg &&
          (packageRenderableHtml ||
            pkg.pricingRange ||
            (pkg.formData && Object.keys(pkg.formData).length > 0) ||
            pkg.pdf?.url ||
            pkg.buyerReadiness)
      )
      const incomingSession = {
        ...(hasPackage ? packageSurface : {}),
        ...(hasPrefill ? prefillSessionFields : {}),
      } as Record<string, unknown>
      if (hasPackage && pkg?.pricingRange) incomingSession._pricingRange = pkg.pricingRange
      if (hasPackage && packageRenderableHtml) incomingSession._htmlReport = packageRenderableHtml
      if (hasPackage && pkg?.pdf?.url) incomingSession.pdfUrl = pkg.pdf.url
      if (pkg?.buyerReadiness) incomingSession._buyerReadiness = pkg.buyerReadiness
      const incomingForm = {
        ...(hasPackage ? packageSurface : {}),
        ...(hasPrefill ? prefillFormFields : {}),
      } as Record<string, unknown>

      if (Object.keys(incomingSession).length > 0) {
        const formStore = useManualFormStore.getState()
        const sessionGapPatch = buildGapFillPatch(
          currentSessionData as Record<string, unknown>,
          incomingSession,
          [...CORE_PREFILL_GAP_KEYS, ...PREFILL_METADATA_GAP_KEYS] as string[]
        )
        Object.assign(
          sessionGapPatch,
          mergeOptionalSessionPrefillFields(
            incomingSession,
            currentSessionData as Record<string, unknown>
          )
        )
        const mergedSessionBc = mergeBusinessContextGapFill(
          (currentSessionData as Record<string, unknown>).business_context,
          incomingSession.business_context
        )
        if (mergedSessionBc) {
          sessionGapPatch.business_context = mergedSessionBc
        }

        const topLevelPatch: Partial<ValuationSession> = {}
        if (
          hasPackage &&
          packageRenderableHtml &&
          !extractRenderableHtmlFromSessionPayload(currentSession)
        ) {
          topLevelPatch.htmlReport = packageRenderableHtml
        }
        if (pkg?.buyerReadiness) {
          topLevelPatch.buyerReadiness = pkg.buyerReadiness
        }
        if (hasPackage && pkg?.pricingRange && !currentSession.valuationResult) {
          topLevelPatch.valuationResult = pricingRangeToValuationResult(pkg.pricingRange)
        }

        if (Object.keys(sessionGapPatch).length > 0 || Object.keys(topLevelPatch).length > 0) {
          const currentSessionDataRecord = currentSessionData as Record<string, unknown>
          // Atomic hydrate — gap-fill after package hydration must not emit a second
          // bare `hydrateSession` notification before status='loaded' (React #185).
          sessionStore.hydrateSessionAndComplete({
            ...topLevelPatch,
            sessionData: {
              ...currentSessionData,
              ...sessionGapPatch,
              _bootstrapPrefill: hasPrefill || !!currentSessionDataRecord._bootstrapPrefill,
            } as BootstrapSessionData,
          })

          logger.info('Updated existing session with bootstrap/package gap-fill data', {
            reportId: report.reportId.substring(0, 30),
            fieldsAdded: Object.keys(sessionGapPatch).length,
            topLevelAdded: Object.keys(topLevelPatch).length,
            hasPrefill,
            hasPackage,
          })
        }

        const formDataUpdate = buildGapFillPatch(
          formStore.formData as unknown as Record<string, unknown>,
          incomingForm,
          [...CORE_PREFILL_GAP_KEYS, ...PREFILL_METADATA_GAP_KEYS] as string[]
        )
        Object.assign(
          formDataUpdate,
          mergeOptionalSessionPrefillFields(incomingSession, {
            ...formStore.formData,
            ...formDataUpdate,
          })
        )
        const mergedFormBc = mergeBusinessContextGapFill(
          (formStore.formData as unknown as Record<string, unknown>).business_context,
          incomingForm.business_context
        )
        if (mergedFormBc) {
          formDataUpdate.business_context = mergedFormBc
        }
        if (Object.keys(formDataUpdate).length > 0) {
          useManualFormStore.getState().updateFormData(asFormPatch(formDataUpdate))
          logger.info('Hydrated form store with bootstrap/package gap-fill', {
            reportId: report.reportId.substring(0, 30),
            formFieldsCount: Object.keys(formDataUpdate).length,
            hasPrefill,
            hasPackage,
          })
        }
      }
    } else if (report.mode === 'new') {
      // CRITICAL FIX: Create minimal session for new reports so form can render
      // This avoids 404 errors when SessionManager tries to load a non-existent session
      // The session will be created on the backend when the user first saves
      // We mark it with _bootstrapCreated: true to indicate it hasn't been saved yet
      if (!storeHasSession) {
        const now = new Date()
        const meaningfulPrefill = hasMeaningfulPrefill(prefillData)

        const sessionData: BootstrapSessionData = asSessionData({
          _bootstrapCreated: true,
          _bootstrapPrefill: meaningfulPrefill,
          ...buildPrefillSessionFields(prefillData),
        })

        const minimalSession: BootstrapMinimalSession = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData,
        }

        sessionStore.hydrateSessionAndComplete(minimalSession)

        if (meaningfulPrefill) {
          const formDataUpdate = buildPrefillFormFields(prefillData)
          Object.assign(
            formDataUpdate,
            mergeOptionalSessionPrefillFields(sessionData, {
              ...useManualFormStore.getState().formData,
              ...formDataUpdate,
            })
          )
          if (Object.keys(formDataUpdate).length > 0) {
            useManualFormStore.getState().updateFormData(asFormPatch(formDataUpdate))
            logger.info('Hydrated form store from bootstrap prefill (new report)', {
              reportId: report.reportId.substring(0, 30),
              formFieldsCount: Object.keys(formDataUpdate).length,
            })
          }
        }

        // Prefill from "Nieuwe schatting" — the user chose to start over but
        // keep their typed financials. The helper:
        //   • discards storage entirely when the stored fingerprint refers
        //     to a different company (cross-company poisoning guard — the
        //     client-side twin of the Titan orphaned-seller bug);
        //   • strips identity fields defensively even on a legacy entry
        //     written before fingerprinting landed, so the bootstrap
        //     identity is never overwritten by stale local state.
        try {
          const targetIdentity = buildIdentityFingerprint(prefillData.companyInfo)
          const restored = readNewValuationPrefill(targetIdentity)
          if (restored) {
            const sanitized = restored.data
            const filingYearConfirmed = isFilingYearConfirmedValue(
              sanitized.filing_year_confirmed ?? sanitized.filingYearConfirmed
            )
            const currentYearData = sanitized.current_year_data as
              | { year?: number; revenue?: number; ebitda?: number }
              | undefined
            if (currentYearData && typeof currentYearData === 'object') {
              sanitized.current_year_data = {
                ...currentYearData,
                year: normalizeCurrentYearForFiling(currentYearData.year, filingYearConfirmed),
              }
            }
            if (Array.isArray(sanitized.historical_years_data)) {
              sanitized.historical_years_data = normalizeHistoricalYearsForFiling(
                sanitized.historical_years_data as Array<{
                  year: number
                  revenue?: number
                  ebitda?: number
                }>,
                filingYearConfirmed
              )
            }
            if (Object.keys(sanitized).length > 0) {
              const formStore = useManualFormStore.getState()
              formStore.updateFormData(asFormPatch(sanitized))
              logger.info('Hydrated form from previous valuation (new schatting prefill)', {
                reportId: report.reportId.substring(0, 30),
                formFieldsCount: Object.keys(sanitized).length,
                fingerprintMatched: restored.matched,
                legacyEntry: restored.legacy,
              })
            }
          }
        } catch (e) {
          logger.warn('Prefill from new valuation failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        }

        logger.info('Created minimal session for new report from bootstrap', {
          reportId: report.reportId.substring(0, 30),
          prefillConfidence: prefillData.confidence.toFixed(2),
          hasCompanyName: !!prefillData.companyInfo?.companyName,
          prefillFieldsCount: Object.keys(sessionData).length - 2, // Exclude _bootstrapCreated and _bootstrapPrefill flags
          identityType: identity.type,
          // AUTH-FIRST: All users are authenticated
          note: 'Session will be created on backend when user first saves (via saveSession with _bootstrapCreated flag)',
        })
      } else {
        logger.debug('New report - session already exists in store', {
          reportId: report.reportId.substring(0, 30),
        })
      }
    } else if (report.mode === 'existing') {
      // MERCURY FIX: Merge prefill AND valuationPackage into session store IMMEDIATELY before loadSession
      // loadSession is async - without this, form stays blank until it completes.
      // valuationPackage enables instant report display on refresh (htmlReport, versions, pdf).
      const hasPrefill = hasMeaningfulPrefill(prefillData)
      const pkg = state.valuationPackage
      const packageRenderableHtml = getFirstRenderableReportHtml(pkg?.htmlReport)
      const hasPackage = Boolean(
        pkg &&
          (packageRenderableHtml ||
            pkg.pricingRange ||
            (pkg.formData && Object.keys(pkg.formData).length > 0) ||
            pkg.pdf?.url ||
            pkg.buyerReadiness)
      )
      const now = new Date()
      const sessionData: BootstrapSessionData = asSessionData({
        _bootstrapPrefill: hasPrefill,
      })
      if (hasPackage && pkg) {
        if (packageRenderableHtml) sessionData._htmlReport = packageRenderableHtml
        if (pkg.pricingRange) sessionData._pricingRange = pkg.pricingRange
        if (pkg.pdf?.url) sessionData.pdfUrl = pkg.pdf.url
        if (pkg.buyerReadiness) sessionData._buyerReadiness = pkg.buyerReadiness
        // Merge formData for restore() when loadSession is skipped (hasAssetsInSession path)
        if (pkg.formData && Object.keys(pkg.formData).length > 0) {
          Object.assign(sessionData, mergeSessionSurfaceForOptionalPrefill(pkg.formData))
        }
      }
      if (hasPrefill) {
        Object.assign(sessionData, buildPrefillSessionFields(prefillData))
      }

      // Phase 1.3: Always create minimal session for existing reports (even when package empty)
      // Enables ValuationSessionManager to detect session and trigger loadSession when assets missing
      {
        const minimalSession: BootstrapMinimalSession = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData,
        }
        // Merge valuationPackage into session for instant display (htmlReport, pdfUrl, etc.).
        // Only promote HTML that survived the renderability guard; pricing/PDF
        // metadata may still hydrate without a report preview.
        if (hasPackage && pkg) {
          if (packageRenderableHtml) {
            minimalSession.htmlReport = packageRenderableHtml
          }
          if (pkg.pdf?.url) minimalSession.pdfUrl = pkg.pdf.url
          if (pkg.buyerReadiness) minimalSession.buyerReadiness = pkg.buyerReadiness
          if (pkg.pricingRange) {
            minimalSession.valuationResult = pricingRangeToValuationResult(pkg.pricingRange)
          }
        }
        // Atomic hydrate + status='loaded' — see `hydrateSessionAndComplete`
        // on the session store for the React #185 cascade history. The prior
        // pair (`hydrateSession` here + `completeInitialization` below) used
        // to fire two separate Zustand notifications in the same microtask,
        // and downstream Radix/framer subscribers cascaded into the
        // "Maximum update depth exceeded" path on the Mercury accountant
        // existing-report flow.
        sessionStore.hydrateSessionAndComplete(minimalSession)

        if (hasPrefill) {
          const formDataUpdate = buildPrefillFormFields(prefillData)
          Object.assign(
            formDataUpdate,
            mergeOptionalSessionPrefillFields(sessionData, {
              ...useManualFormStore.getState().formData,
              ...formDataUpdate,
            })
          )
          if (Object.keys(formDataUpdate).length > 0) {
            useManualFormStore.getState().updateFormData(asFormPatch(formDataUpdate))
            logger.info('Hydrated form store from bootstrap prefill (existing report)', {
              reportId: report.reportId.substring(0, 30),
              formFieldsCount: Object.keys(formDataUpdate).length,
            })
          }
        }

        logger.info('Merged bootstrap into session for existing report (before loadSession)', {
          reportId: report.reportId.substring(0, 30),
          hasPrefill,
          hasPackage,
          prefillFieldsCount: Object.keys(sessionData).length - 1,
        })
      }

      // `status='loaded'` was already committed atomically by
      // `hydrateSessionAndComplete` above — no separate
      // `completeInitialization` call here (was the second Zustand
      // notification that compounded the cascade).

      // SINGLE-OWNER: Do NOT call loadSession here.
      // ValuationSessionManager is the sole owner of session loading for existing reports.
      // Calling loadSession from both useBootstrapSync AND ValuationSessionManager creates
      // a race condition: both start concurrent loads, and VSM's needsFullLoad path resets
      // session state (session=null) while useBootstrapSync's load is in-flight, causing
      // a visual flash and unpredictable state machine transitions.
      // VSM will detect the minimal session and trigger loadSession on its own next cycle.
      logger.info(
        'Bootstrap sync created minimal session — delegating full load to ValuationSessionManager',
        {
          reportId: report.reportId.substring(0, 30),
          hasExistingData: report.hasExistingData,
          hasValuationResult: report.hasValuationResult,
        }
      )
    }

    applyCountryPrefillIfNewReport(report, prefillData)

    syncStatusRef.current.session = true
  } catch (error) {
    logger.error('Failed to sync session', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Sync client context from bootstrap to client context store
 */
function syncClientContext(state: SessionBootstrapState): void {
  try {
    const { identity } = state

    // Only sync if we have accountant flow
    if (identity.type !== 'accountant_for_client' || !identity.clientContext) {
      syncStatusRef.current.clientContext = true
      return
    }
    const clientContext = identity.clientContext

    const clientContextStore = useClientContext.getState()
    const currentClient = clientContextStore.client

    // Check if context is already set correctly (relationship matters when client user is null)
    if (
      (currentClient?.id ?? null) === (clientContext.clientUserId ?? null) &&
      clientContextStore.accountant?.id === clientContext.accountantUserId &&
      clientContextStore.relationshipId === clientContext.relationshipId
    ) {
      logger.debug('Client context already synced')
      syncStatusRef.current.clientContext = true
      return
    }

    // Set client context (clientUser null when invitation not accepted)
    const clientCompanyName = clientContext.clientCompanyName || 'Client'
    const clientUserId = clientContext.clientUserId

    clientContextStore.setClientContext({
      accountantUser: {
        id: clientContext.accountantUserId,
        email: clientContext.accountantEmail || '',
        full_name: '', // Bootstrap doesn't have this, but field is required
      },
      clientUser: clientUserId
        ? {
            id: clientUserId,
            email: clientContext.clientEmail || '',
            full_name: clientCompanyName,
            avatar_url: null,
          }
        : null,
      relationship: {
        id: clientContext.relationshipId,
        customer_name: clientCompanyName,
      },
    })

    void import('../lib/auth/clientContextGate').then(
      ({ resolveDelegatedContextGateIfBootstrapSynced }) => {
        resolveDelegatedContextGateIfBootstrapSynced(clientContext.relationshipId)
      }
    )

    logger.info('Client context synced from bootstrap', {
      clientUserId: clientUserId?.substring(0, 8) ?? 'null',
      accountantUserId: clientContext.accountantUserId.substring(0, 8),
    })

    syncStatusRef.current.clientContext = true
  } catch (error) {
    logger.error('Failed to sync client context', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export default useBootstrapSync
