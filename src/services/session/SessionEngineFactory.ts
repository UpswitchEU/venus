/**
 * Session Engine Factory
 * 
 * Twin Engine Architecture: Routes to correct engine based on bootstrap identity
 * 
 * Early routing - identity resolved in bootstrap, engine selected immediately.
 * Zero mixing of guest/auth logic.
 * 
 * @module services/session/SessionEngineFactory
 */

import type { ISessionEngine } from './SessionEngine'
import type { IdentityState } from '../../lib/bootstrap/types'
import { GuestSessionEngine } from './engines/GuestSessionEngine'
import { AuthenticatedSessionEngine } from './engines/AuthenticatedSessionEngine'
import { generalLogger } from '../../utils/logger'

/**
 * Create session engine based on identity type
 * 
 * Routes to:
 * - GuestSessionEngine: localStorage-only sandbox for guest users
 * - AuthenticatedSessionEngine: Full backend integration for authenticated users
 * 
 * @param identity - Bootstrap identity state
 * @returns Appropriate session engine
 */
export function createSessionEngine(identity: IdentityState): ISessionEngine {
  if (identity.type === 'guest') {
    generalLogger.debug('[SessionEngineFactory] Creating GuestSessionEngine', {
      guestSessionId: identity.guestSessionId?.substring(0, 20) + '...',
    })
    return new GuestSessionEngine()
  }

  // Authenticated or accountant_for_client - use full backend engine
  generalLogger.debug('[SessionEngineFactory] Creating AuthenticatedSessionEngine', {
    identityType: identity.type,
    userId: identity.userId?.substring(0, 8) + '...',
    hasClientContext: !!identity.clientContext,
  })
  return new AuthenticatedSessionEngine()
}
