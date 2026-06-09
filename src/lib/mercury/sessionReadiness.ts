/**
 * Mercury → Venus session readiness (optimistic shell vs bootstrap-owned hydration).
 *
 * Advisor delegated opens (`clientId`, `mode=accountant`, existing report UUID) must NOT
 * seed the 1.2s optimistic shell while Titan bootstrap runs — that collision caused
 * React #185 / ErrorBoundary on preview (2026-05-27).
 */

import {
  getDelegatedUrlClientId,
  isPersistedContextStaleForUrl,
} from '../auth/persistedClientContext'
import type { BootstrapContext, IdentityState } from '../bootstrap/types'
import type { ValuationSession } from '../../types/valuation'
import { looksLikeExistingReportId } from '../../utils/identifiers'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { isMercuryAdvisorModeParam } from '../../utils/reportMode'

/** Signals for Mercury → Venus advisor-for-client opens (existing report handoff). */
export type DelegatedMercuryHandoffSignals = {
  isFromMercury: boolean
  /** Existing report id in the URL (`val_*` or UUID). */
  urlIndicatesExisting?: boolean
  clientId?: string | null
  clientToken?: string | null
  mode?: string | null
  isActingAsClient?: boolean
}

/**
 * True when Titan bootstrap (not the 1.2s optimistic shell) must own hydration.
 * Covers `?clientId=`, `?clientToken=`, exchanged client context, and
 * `mode=accountant` on existing Mercury report URLs.
 */
export function isDelegatedMercuryAccountantHandoff(
  signals: DelegatedMercuryHandoffSignals
): boolean {
  if (!signals.isFromMercury) return false
  if (signals.clientToken?.trim()) return true
  if (signals.clientId?.trim()) return true
  if (signals.isActingAsClient) return true
  if (signals.urlIndicatesExisting && isMercuryAdvisorModeParam(signals.mode)) {
    return true
  }
  return false
}

function parseMercuryModeFromBootstrapUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    return new URL(url, 'http://localhost').searchParams.get('mode')
  } catch {
    return null
  }
}

/**
 * Whether Titan bootstrap must wait for `useClientContext.isActingAsClient` before POST.
 * Narrower than "any Mercury existing report" — avoids dead-air on owner Mercury opens.
 */
export function shouldWaitForMercuryClientContextBeforeBootstrap(input: {
  sourceApp?: string | null
  reportId?: string | null
  clientId?: string | null
  clientToken?: string | null
  /** Explicit persona mode from bootstrap context (preferred over parsing `url`). */
  mercuryPersonaMode?: string | null
  url?: string | null
  hasClientTokenHint?: boolean
}): boolean {
  if (input.hasClientTokenHint || input.clientToken?.trim()) return true
  if (input.sourceApp !== 'mercury') return false
  if (input.clientId?.trim()) return true
  const reportId = input.reportId?.trim()
  if (!reportId || !looksLikeExistingReportId(reportId)) return false
  const mode =
    input.mercuryPersonaMode?.trim() ||
    parseMercuryModeFromBootstrapUrl(input.url)?.trim() ||
    null
  return isMercuryAdvisorModeParam(mode)
}

export type DelegatedClientContextReadinessInput = {
  /** `?clientId=` from the Mercury handoff URL (accountant_customers.id). */
  clientId?: string | null
  isActingAsClient?: boolean
  accountantId?: string | null
  relationshipId?: string | null
}

/**
 * True when delegated client context in the store is ready for bootstrap.
 * When the URL carries `?clientId=`, require `relationshipId` to match — stale
 * persisted context from a prior client must not satisfy Mercury handoff gates.
 */
export function isDelegatedClientContextReadyForUrl(
  input: DelegatedClientContextReadinessInput
): boolean {
  const urlClientId = input.clientId?.trim() || getDelegatedUrlClientId() || ''
  const relationshipId = input.relationshipId?.trim() || ''
  const accountantId = input.accountantId?.trim() || ''

  const hasDelegatedShape = !!(input.isActingAsClient && accountantId && relationshipId)
  if (!hasDelegatedShape) return false

  if (urlClientId) {
    return relationshipId === urlClientId
  }

  return true
}

/**
 * Full bootstrap gate: URL-matched delegated shape AND initializeAuth has
 * resolved the client-context promise (report restore / get-client-context).
 * Prevents stale persisted shape from racing ahead of async auth.
 */
export function isDelegatedClientContextReadyForBootstrap(input: {
  needsMercuryClientContext: boolean
  contextGateResolved: boolean
  clientId?: string | null
  isActingAsClient?: boolean
  accountantId?: string | null
  relationshipId?: string | null
}): boolean {
  if (!input.needsMercuryClientContext) return true
  if (
    !isDelegatedClientContextReadyForUrl({
      clientId: input.clientId,
      isActingAsClient: input.isActingAsClient,
      accountantId: input.accountantId,
      relationshipId: input.relationshipId,
    })
  ) {
    return false
  }
  return input.contextGateResolved
}

/** Build delegation signals from bootstrap context (Titan path). */
export function buildMercuryDelegatedHandoffSignalsFromBootstrapContext(
  context: Pick<
    BootstrapContext,
    'sourceApp' | 'reportId' | 'clientId' | 'clientToken' | 'mercuryPersonaMode'
  >
): DelegatedMercuryHandoffSignals {
  return buildMercuryDelegatedHandoffSignals({
    isFromMercury: context.sourceApp === 'mercury',
    reportId: context.reportId || '',
    clientId: context.clientId,
    clientToken: context.clientToken,
    mode: context.mercuryPersonaMode,
  })
}

/** Build delegation signals from URL + client-context state (single call site shape). */
export function buildMercuryDelegatedHandoffSignals(input: {
  isFromMercury: boolean
  reportId: string
  clientId?: string | null
  clientToken?: string | null
  mode?: string | null
  isActingAsClient?: boolean
}): DelegatedMercuryHandoffSignals {
  return {
    isFromMercury: input.isFromMercury,
    urlIndicatesExisting: looksLikeExistingReportId(input.reportId),
    clientId: input.clientId,
    clientToken: input.clientToken,
    mode: input.mode,
    isActingAsClient: input.isActingAsClient,
  }
}

type SessionLike = {
  reportId: ValuationSession['reportId']
  sessionData?: ValuationSession['sessionData'] | Record<string, unknown> | null
  valuationResult?: ValuationSession['valuationResult']
  htmlReport?: ValuationSession['htmlReport'] | null
  reportReady?: boolean
  status?: string
}

export function hasAssetsInSession(session: SessionLike | null | undefined): boolean {
  if (!session) return false

  const sd = (session.sessionData || {}) as Record<string, unknown>
  const htmlReport = getFirstRenderableReportHtml(
    session.htmlReport,
    typeof sd._htmlReport === 'string' ? sd._htmlReport : null,
    typeof sd.htmlReport === 'string' ? sd.htmlReport : null,
    typeof sd.html_report === 'string' ? sd.html_report : null
  )
  return !!(htmlReport || session.valuationResult || sd.valuation_result || sd.valuationResult)
}

export function shouldAllowOptimisticMercuryRender(params: {
  isFromMercury: boolean
  isBootstrapping: boolean
  isLoading: boolean
  bootstrapMode?: 'new' | 'existing' | null
  urlIndicatesExisting?: boolean
  delegatedHandoffSignals?: DelegatedMercuryHandoffSignals
  isDelegatedAccountantHandoff?: boolean
}): boolean {
  const isDelegated =
    params.isDelegatedAccountantHandoff ??
    (params.delegatedHandoffSignals
      ? isDelegatedMercuryAccountantHandoff(params.delegatedHandoffSignals)
      : false)
  if (isDelegated) return false
  // Existing report UUID in URL but bootstrap returned `new` (access/mismatch) —
  // never mount an empty optimistic draft over a broken handoff.
  if (params.urlIndicatesExisting && params.bootstrapMode === 'new') return false
  return (
    params.isFromMercury &&
    params.isBootstrapping &&
    !params.isLoading &&
    params.bootstrapMode === 'new'
  )
}

export function shouldSeedOptimisticMercuryShell(params: {
  isFromMercury: boolean
  isBootstrapping: boolean
  reportId: string | null | undefined
  urlIndicatesExisting: boolean
  currentSessionReportId?: string | null
  status: string
  seededReportId?: string | null
  delegatedHandoffSignals?: DelegatedMercuryHandoffSignals
  /** Prefer `delegatedHandoffSignals` — kept for tests and direct callers */
  isDelegatedAccountantHandoff?: boolean
}): boolean {
  const isDelegated =
    params.isDelegatedAccountantHandoff ??
    (params.delegatedHandoffSignals
      ? isDelegatedMercuryAccountantHandoff(params.delegatedHandoffSignals)
      : false)

  if (!params.isFromMercury || !params.isBootstrapping) return false
  if (isDelegated) return false
  if (!params.reportId || params.reportId === 'new') return false
  if (!params.urlIndicatesExisting) return false
  if (params.currentSessionReportId === params.reportId) return false
  if (params.seededReportId === params.reportId) return false

  // `loaded` covers SPA handoffs where the previous report is still in the
  // store. Mercury should still get the fast shell for the new report.
  return params.status === 'idle' || params.status === 'loaded'
}

/**
 * Build the IdentityState used to bootstrap the session engine during the
 * Mercury optimistic-shell seed. Returns null when auth hasn't yet exposed a
 * userId — the seed must bail in that case rather than mount ManualLayout
 * against a null engine.
 */
export function buildSeedIdentity(params: {
  authUser: { id?: string; email?: string; name?: string } | null | undefined
  clientContext: {
    isActingAsClient: boolean
    accountant: { id: string; email: string } | null
    client: { id: string; email: string } | null
    relationshipId: string | null
  }
}): IdentityState | null {
  const { authUser, clientContext } = params
  if (!authUser?.id) return null

  const firstName = authUser.name?.split(' ')[0]
  const lastName = authUser.name?.split(' ').slice(1).join(' ') || undefined

  if (
    clientContext.isActingAsClient &&
    clientContext.relationshipId &&
    !isPersistedContextStaleForUrl(clientContext.relationshipId)
  ) {
    return {
      type: 'accountant_for_client',
      userId: authUser.id,
      email: authUser.email,
      firstName,
      lastName,
      clientContext: {
        accountantUserId: clientContext.accountant?.id || authUser.id,
        accountantEmail: clientContext.accountant?.email,
        clientUserId: clientContext.client?.id ?? null,
        clientEmail: clientContext.client?.email,
        relationshipId: clientContext.relationshipId,
        permissions: {
          canCreateValuations: true,
          canViewReports: true,
          canEditReports: true,
        },
      },
    }
  }

  return {
    type: 'authenticated',
    userId: authUser.id,
    email: authUser.email,
    firstName,
    lastName,
  }
}

export function canRenderReportSession(params: {
  session: SessionLike | null | undefined
  reportId: string
  requiresRenderableAssets: boolean
}): boolean {
  const { session, reportId, requiresRenderableAssets } = params
  if (!session || session.reportId !== reportId) return false
  if (!requiresRenderableAssets) return true
  if (session.reportReady === true) return true
  return hasAssetsInSession(session)
}
