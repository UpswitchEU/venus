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
  const { logout } = useAuth()

  const handleLogout = async () => {
    try {
      generalLogger.info('Logging out user')

      // Use unified logout function from auth hook (idempotent, race-condition safe)
      await logout()

      generalLogger.info('Logout successful')
    } catch (error) {
      generalLogger.error('Logout failed', { error })
      // Logout function handles errors gracefully, so we don't need to do anything else
    }
  }

  return {
    handleLogout,
  }
}
