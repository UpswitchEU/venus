/**
 * Session Engine Factory
 *
 * AUTH-FIRST ARCHITECTURE: Simplified engine factory for authenticated users only.
 * Guest flow has been removed - all users must authenticate before accessing valuation features.
 *
 * BANK-GRADE FIX: Uses singleton pattern to prevent losing session state when
 * setEngine is called multiple times during bootstrap/identity changes.
 *
 * @module services/session/SessionEngineFactory
 */

import type { IdentityState } from '../../lib/bootstrap/types'
import { generalLogger } from '../../utils/logger'
import { AuthenticatedSessionEngine } from './engines/AuthenticatedSessionEngine'
import type { ISessionEngine } from './SessionEngine'

/**
 * Singleton engine instance
 * BANK-GRADE: Preserves loaded session across setEngine calls
 */
let engineInstance: AuthenticatedSessionEngine | null = null

/**
 * Create or get session engine based on identity type
 *
 * AUTH-FIRST: Always returns AuthenticatedSessionEngine.
 * Guest users are redirected to login by BootstrapProvider before reaching this point.
 *
 * BANK-GRADE: Uses singleton pattern to prevent losing loaded session when
 * setEngine is called multiple times during:
 * - Bootstrap completion
 * - Identity changes
 * - updateIdentity callbacks
 *
 * @param identity - Bootstrap identity state
 * @returns AuthenticatedSessionEngine (singleton)
 */
export function createSessionEngine(identity: IdentityState): ISessionEngine {
  // BANK-GRADE: Return existing engine if one exists (preserves loaded session)
  if (engineInstance) {
    generalLogger.debug('[SessionEngineFactory] Returning existing engine (singleton)', {
      identityType: identity.type,
      userId: identity.userId?.substring(0, 8) + '...',
      hasSession: !!engineInstance.getSession(),
      sessionReportId: engineInstance.getReportId()?.substring(0, 20) || 'none',
    })
    return engineInstance
  }

  // First call - create new engine
  generalLogger.debug('[SessionEngineFactory] Creating AuthenticatedSessionEngine (first time)', {
    identityType: identity.type,
    userId: identity.userId?.substring(0, 8) + '...',
    hasClientContext: !!identity.clientContext,
  })

  engineInstance = new AuthenticatedSessionEngine()
  return engineInstance
}

/**
 * Reset the engine singleton (for logout/testing)
 */
export function resetSessionEngine(): void {
  if (engineInstance) {
    engineInstance.clearSession()
    engineInstance = null
    generalLogger.debug('[SessionEngineFactory] Engine reset')
  }
}
