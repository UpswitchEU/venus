/**
 * Session Engine Factory
 *
 * AUTH-FIRST ARCHITECTURE: Simplified engine factory for authenticated users only.
 * Guest flow has been removed - all users must authenticate before accessing valuation features.
 *
 * Reuses engines within one authenticated user, client, and report so bootstrap
 * refreshes preserve drafts without carrying data between dossiers.
 *
 * @module services/session/SessionEngineFactory
 */

import type { IdentityState } from '../../lib/bootstrap/types'
import { generalLogger } from '../../utils/logger'
import { isSameReportIdentity } from '../../utils/reportIdentityPromotion'
import { AuthenticatedSessionEngine } from './engines/AuthenticatedSessionEngine'
import type { ISessionEngine } from './SessionEngine'

// Keep pending drafts in their own authenticated context when an advisor
// switches dossiers. Never hydrate a different client from a global singleton.
const engines = new Map<string, AuthenticatedSessionEngine>()

/**
 * Create or get session engine based on identity type
 *
 * AUTH-FIRST: Always returns AuthenticatedSessionEngine.
 * Guest users are redirected to login by BootstrapProvider before reaching this point.
 *
 * @param identity - Bootstrap identity state
 * @param reportId - Report being opened, including confirmed identity promotion
 * @returns The engine for this authenticated report scope
 */
export function createSessionEngine(identity: IdentityState, reportId?: string): ISessionEngine {
  const scope = JSON.stringify([
    identity.type,
    identity.userId ?? null,
    identity.clientContext?.accountantUserId ?? null,
    identity.clientContext?.relationshipId ?? null,
  ])
  const key = `${scope}:${reportId ?? ''}`
  let engineInstance = engines.get(key)
  if (!engineInstance && reportId) {
    // Promotion can change the URL without changing the active report or draft.
    for (const [existingKey, candidate] of engines) {
      if (
        existingKey.startsWith(`${scope}:`) &&
        isSameReportIdentity(candidate.getReportId() ?? undefined, reportId)
      ) {
        engineInstance = candidate
        engines.delete(existingKey)
        engines.set(key, candidate)
        break
      }
    }
  }
  if (engineInstance) {
    generalLogger.debug('[SessionEngineFactory] Reusing scoped engine', {
      identityType: identity.type,
      userId: identity.userId?.substring(0, 8) + '...',
      hasSession: !!engineInstance.getSession(),
      sessionReportId: engineInstance.getReportId()?.substring(0, 30) || 'none',
    })
    return engineInstance
  }

  generalLogger.debug('[SessionEngineFactory] Creating scoped engine', {
    identityType: identity.type,
    userId: identity.userId?.substring(0, 8) + '...',
    hasClientContext: !!identity.clientContext,
  })

  const engine = new AuthenticatedSessionEngine()
  engines.set(key, engine)
  return engine
}

/** Release clean inactive reports; dirty or pending drafts remain owned by the store. */
export function releaseSessionEngine(engine: ISessionEngine): void {
  for (const [key, candidate] of engines) {
    if (candidate === engine) engines.delete(key)
  }
  engine.clearSession()
}

/**
 * Clear all authenticated report engines (for logout/testing)
 */
export function resetSessionEngine(): void {
  for (const engine of engines.values()) engine.clearSession()
  engines.clear()
  generalLogger.debug('[SessionEngineFactory] Engines reset')
}
