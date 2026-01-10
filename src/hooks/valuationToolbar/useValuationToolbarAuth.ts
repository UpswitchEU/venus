/**
 * Valuation Toolbar Auth Hook
 *
 * Single Responsibility: Handle authentication/logout logic for ValuationToolbar
 * SOLID Principles: SRP - Only handles auth operations
 *
 * @module hooks/valuationToolbar/useValuationToolbarAuth
 */

import { generalLogger } from '../../utils/logger'
import { useAuth } from '../useAuth'

export interface UseValuationToolbarAuthReturn {
  handleLogout: () => Promise<void>
}

/**
 * Hook for managing authentication/logout in ValuationToolbar
 */
export const useValuationToolbarAuth = (): UseValuationToolbarAuthReturn => {
  const { refreshAuth } = useAuth()

  const handleLogout = async () => {
    try {
      generalLogger.info('Logging out user')

      // Call local API proxy route which forwards to Titan with cookies
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Send authentication cookie
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        generalLogger.info('Logout successful')
        // Refresh auth state to clear user data
        await refreshAuth()
      } else {
        generalLogger.warn('Logout request failed', { status: response.status })
        // Still refresh auth state in case session is already invalid
        await refreshAuth()
      }
    } catch (error) {
      generalLogger.error('Logout failed', { error })
      // Still refresh auth state to clear local state
      await refreshAuth()
    }
  }

  return {
    handleLogout,
  }
}
