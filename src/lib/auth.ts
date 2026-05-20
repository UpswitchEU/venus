/**
 * Simplified Authentication Module
 *
 * World-class authentication following Stripe/Auth0 patterns:
 * - Simple, deterministic flow
 * - Minimal logging (errors only)
 * - Fast initialization (<100ms)
 * - Race condition prevention via promise caching
 *
 * @module lib/auth
 */

export { clearAuthCache } from './auth/authCache'
export { isClientContextReady, waitForClientContext } from './auth/clientContextGate'
export { clearInitThrottle, clearReloadCounter } from './auth/initGuards'
export { getInitTraceId } from './auth/initRuntime'
export { useAuthStore } from './auth/store'
export { useAuth } from './auth/useAuth'

import { initializeAuth } from './auth/initializeAuth'

// Initialize on module load (browser only). Auth watcher is handled by LogoutListener.
if (typeof window !== 'undefined') {
  initializeAuth()
}
