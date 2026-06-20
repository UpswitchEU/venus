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
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import { createContextLogger } from '../utils/logger'
import {
  mergeSessionSurfaceForOptionalPrefill,
  stableOptionalPrefillSourceSignature,
} from '../utils/mergeOptionalSessionPrefillFields'
import { buildPrefillSessionFields } from './bootstrapSyncPrefillMapping'
import { syncBootstrapSession } from './bootstrapSyncSession'

const logger = createContextLogger('BootstrapSync')

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
    // syncBootstrapSession mutates two stores synchronously (session via
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
      syncBootstrapSession(state)
      syncStatusRef.current.session = true
      syncClientContext(state)

      // New + existing report hydrates use `hydrateSessionAndComplete` inside
      // syncBootstrapSession (status='loaded' in the same notification).

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
