/**
 * useCredits Hook for Valuation Tester
 *
 * Hook for managing credit state and operations
 * Connects to Node.js backend via backendAPI
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveAllowedMethodKeys } from '../constants/accountantPlanMethods'
import { backendAPI } from '../services/backendApi'
import { generalLogger } from '../utils/logger'

interface UserPlan {
  id: string
  user_id: string
  plan_type: string
  credits_per_period: number
  credits_used: number
  credits_remaining: number
  created_at: string
  allowed_methods?: string[] | null
  yearly_discount_percent?: number
  plan_features?: PlanFeatureFlags
}

const PAID_PLAN_TYPES = new Set(['premium', 'starter', 'pro', 'expert', 'enterprise'])

/** Mirrors Titan `GET /api/v2/credits/plan` `plan_features` (fallback when field omitted). */
export interface PlanFeatureFlags {
  ebitda_normalization: boolean
  tax_latencies: boolean
  version_control: boolean
  audit_trail: boolean
  integrations_enabled: boolean
  valuation_synthesis: boolean
  valuation_download: boolean
  live_benelux_sector_multiples: boolean
  team_seat_addons: boolean
}

function defaultPlanFeatures(planType: string | undefined): PlanFeatureFlags {
  const pt = planType || 'free'
  if (pt === 'free') {
    return {
      ebitda_normalization: false,
      tax_latencies: false,
      version_control: false,
      audit_trail: false,
      integrations_enabled: false,
      valuation_synthesis: false,
      valuation_download: false,
      live_benelux_sector_multiples: false,
      team_seat_addons: false,
    }
  }
  if (pt === 'starter') {
    return {
      ebitda_normalization: true,
      tax_latencies: true,
      version_control: true,
      audit_trail: true,
      integrations_enabled: false,
      valuation_synthesis: true,
      valuation_download: true,
      live_benelux_sector_multiples: true,
      team_seat_addons: true,
    }
  }
  return {
    ebitda_normalization: true,
    tax_latencies: true,
    version_control: true,
    audit_trail: true,
    integrations_enabled: ['pro', 'expert', 'enterprise'].includes(pt),
    valuation_synthesis: ['starter', 'pro', 'expert', 'enterprise'].includes(pt),
    valuation_download: true,
    live_benelux_sector_multiples: ['premium', 'starter', 'pro', 'expert', 'enterprise'].includes(pt),
    team_seat_addons: ['starter', 'pro', 'expert', 'enterprise'].includes(pt),
  }
}

interface CreditContextValue {
  plan: UserPlan | null
  creditsRemaining: number
  isPremium: boolean
  /** Null = all methods; string[] = only these keys (Free tier) */
  allowedMethodKeys: string[] | null
  /** Null while loading; then Titan flags (or heuristic fallback if API omits `plan_features`) */
  planFeatures: PlanFeatureFlags | null
  /** Titan `yearly_discount_percent` for current plan; null if unknown */
  yearlyDiscountPercent: number | null
  /** Bonus valuations earned via client invite acceptance */
  bonusValuations: number
  isLoading: boolean
  refreshCredits: () => Promise<void>
}

// SOFT DISABLE: Feature flag for unlimited credits mode
import { env } from '../utils/env'

const UNLIMITED_CREDITS_MODE = env.NEXT_PUBLIC_UNLIMITED_CREDITS_MODE === 'true'

export const useCredits = (): CreditContextValue => {
  const [plan, setPlan] = useState<UserPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadCredits = useCallback(async () => {
    try {
      setIsLoading(true)

      if (UNLIMITED_CREDITS_MODE) {
        // SOFT DISABLE: Return unlimited credits for all users (all valuation methods unlocked in UI)
        setPlan({
          id: 'unlimited-mode',
          user_id: 'current-user',
          plan_type: 'free',
          credits_per_period: 999999,
          credits_used: 0,
          credits_remaining: 999999,
          created_at: new Date().toISOString(),
          allowed_methods: null,
        })
        return
      }

      // Call backend API to get user plan
      try {
        const planData = await backendAPI.getUserPlan()
        setPlan({
          ...planData,
          allowed_methods: planData.allowed_methods,
          plan_features: planData.plan_features,
          yearly_discount_percent: planData.yearly_discount_percent,
          bonus_valuations: (planData as any).bonus_valuations ?? 0,
        } as any)
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
          allowed_methods: undefined,
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

  const allowedMethodKeys = useMemo(() => {
    if (UNLIMITED_CREDITS_MODE) return null
    return resolveAllowedMethodKeys(plan?.allowed_methods, plan?.plan_type)
  }, [plan?.allowed_methods, plan?.plan_type])

  const planFeatures = useMemo((): PlanFeatureFlags | null => {
    if (UNLIMITED_CREDITS_MODE) {
      return {
        ebitda_normalization: true,
        tax_latencies: true,
        version_control: true,
        audit_trail: true,
        integrations_enabled: true,
        valuation_synthesis: true,
        valuation_download: true,
        live_benelux_sector_multiples: true,
        team_seat_addons: true,
      }
    }
    if (!plan) return null
    const base = defaultPlanFeatures(plan.plan_type)
    if (plan.plan_features) {
      return { ...base, ...plan.plan_features }
    }
    return base
  }, [plan])

  const yearlyDiscountPercent = useMemo((): number | null => {
    if (UNLIMITED_CREDITS_MODE) return null
    if (plan?.yearly_discount_percent != null && Number.isFinite(plan.yearly_discount_percent)) {
      return plan.yearly_discount_percent
    }
    return null
  }, [plan?.yearly_discount_percent])

  const bonusValuations = useMemo(() => {
    if (UNLIMITED_CREDITS_MODE) return 0
    return (plan as any)?.bonus_valuations ?? 0
  }, [(plan as any)?.bonus_valuations])

  return {
    plan,
    creditsRemaining: plan?.credits_remaining || 0,
    isPremium: PAID_PLAN_TYPES.has(plan?.plan_type ?? ''),
    allowedMethodKeys,
    planFeatures,
    yearlyDiscountPercent,
    bonusValuations,
    isLoading,
    refreshCredits,
  }
}
