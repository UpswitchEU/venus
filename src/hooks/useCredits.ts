/**
 * useCredits Hook for Valuation Tester
 *
 * Hook for managing credit state and operations
 * Connects to Node.js backend via backendAPI
 */

import { useCallback, useEffect, useState } from 'react'
import { backendAPI } from '../services/backendApi'
import { generalLogger } from '../utils/logger'

interface UserPlan {
  id: string
  user_id: string
  plan_type: 'free' | 'premium'
  credits_per_period: number
  credits_used: number
  credits_remaining: number
  created_at: string
}

interface CreditContextValue {
  plan: UserPlan | null
  creditsRemaining: number
  isPremium: boolean
  isLoading: boolean
  refreshCredits: () => Promise<void>
}

// SOFT DISABLE: Feature flag for unlimited credits mode
import { env } from '../utils/env'

const UNLIMITED_CREDITS_MODE = env.NEXT_PUBLIC_UNLIMITED_CREDITS_MODE !== 'false'

export const useCredits = (): CreditContextValue => {
  const [plan, setPlan] = useState<UserPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadCredits = useCallback(async () => {
    try {
      setIsLoading(true)

      if (UNLIMITED_CREDITS_MODE) {
        // SOFT DISABLE: Return unlimited credits for all users
        setPlan({
          id: 'unlimited-mode',
          user_id: 'current-user',
          plan_type: 'free',
          credits_per_period: 999999,
          credits_used: 0,
          credits_remaining: 999999,
          created_at: new Date().toISOString(),
        })
        return
      }

      // Call backend API to get user plan
      try {
        const planData = await backendAPI.getUserPlan()
        setPlan(planData)
        generalLogger.debug('User plan loaded', {
          planType: planData.plan_type,
          creditsRemaining: planData.credits_remaining,
        })
      } catch (error) {
        generalLogger.error('Failed to load user plan', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        // Fallback to free plan if API call fails
        setPlan({
          id: 'fallback-plan',
          user_id: 'current-user',
          plan_type: 'free',
          credits_per_period: 3,
          credits_used: 0,
          credits_remaining: 3,
          created_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('Failed to load credits:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshCredits = useCallback(async () => {
    await loadCredits()
  }, [loadCredits])

  useEffect(() => {
    loadCredits()
  }, [loadCredits])

  return {
    plan,
    creditsRemaining: plan?.credits_remaining || 0,
    isPremium: plan?.plan_type === 'premium',
    isLoading,
    refreshCredits,
  }
}
