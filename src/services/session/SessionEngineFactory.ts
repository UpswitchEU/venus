/**
 * Session Engine Factory
 * 
 * AUTH-FIRST ARCHITECTURE: Simplified engine factory for authenticated users only.
 * Guest flow has been removed - all users must authenticate before accessing valuation features.
 * 
 * @module services/session/SessionEngineFactory
 */

import type { ISessionEngine } from './SessionEngine'
import type { IdentityState } from '../../lib/bootstrap/types'
import { AuthenticatedSessionEngine } from './engines/AuthenticatedSessionEngine'
import { generalLogger } from '../../utils/logger'

/**
 * Create session engine based on identity type
 * 
 * AUTH-FIRST: Always creates AuthenticatedSessionEngine.
 * Guest users are redirected to login by BootstrapProvider before reaching this point.
 * 
 * @param identity - Bootstrap identity state
 * @returns AuthenticatedSessionEngine
 */
export function createSessionEngine(identity: IdentityState): ISessionEngine {
  // AUTH-FIRST: All users are authenticated
  generalLogger.debug('[SessionEngineFactory] Creating AuthenticatedSessionEngine', {
    identityType: identity.type,
    userId: identity.userId?.substring(0, 8) + '...',
    hasClientContext: !!identity.clientContext,
  })
  return new AuthenticatedSessionEngine()
}
