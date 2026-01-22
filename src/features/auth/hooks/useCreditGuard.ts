/**
 * useCreditGuard Hook
 *
 * AUTH-FIRST ARCHITECTURE: Simplified credit guard for authenticated users.
 * Guest flow has been removed - all users must authenticate.
 * Credit enforcement is now handled by the backend via CreditEnforcementGuard.
 *
 * @module features/auth/hooks/useCreditGuard
 */

import { useCallback, useState } from 'react'
// AUTH-FIRST: guestCreditService removed - authentication is required
import { chatLogger } from '../../../utils/logger'

interface UseCreditGuardOptions {
  isAuthenticated: boolean
  onOutOfCredits?: () => void
}

interface UseCreditGuardReturn {
  hasCredits: boolean
  creditsRemaining: number
  isBlocked: boolean
  checkCredits: () => boolean
  showOutOfCreditsModal: boolean
  setShowOutOfCreditsModal: (show: boolean) => void
}

/**
 * Hook for managing credit-based access control
 *
 * AUTH-FIRST: All users are authenticated.
 * Credit enforcement is handled by backend CreditEnforcementGuard.
 * This hook now simply returns that authenticated users have credits.
 *
 * @param options Configuration options
 * @returns Credit state and control functions
 */
export function useCreditGuard({
  isAuthenticated,
  onOutOfCredits,
}: UseCreditGuardOptions): UseCreditGuardReturn {
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false)

  /**
   * Check if user has credits
   * AUTH-FIRST: Always returns true - backend handles enforcement
   */
  const checkCredits = useCallback((): boolean => {
    if (!isAuthenticated) {
      // AUTH-FIRST: This should not happen - user should be redirected to login
      chatLogger.warn('[useCreditGuard] User not authenticated - should be redirected')
      if (onOutOfCredits) {
        onOutOfCredits()
      }
      return false
    }
    // Credit enforcement is handled by backend
    return true
  }, [isAuthenticated, onOutOfCredits])

  // AUTH-FIRST: Authenticated users always have access
  // Backend CreditEnforcementGuard handles actual credit checks
  return {
    hasCredits: isAuthenticated,
    creditsRemaining: isAuthenticated ? Infinity : 0,
    isBlocked: !isAuthenticated,
    checkCredits,
    showOutOfCreditsModal,
    setShowOutOfCreditsModal,
  }
}
