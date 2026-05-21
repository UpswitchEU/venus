/**
 * useCredits Hook for Valuation Tester
 *
 * Hook for managing credit state and operations
 * Connects to Node.js backend via backendAPI
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveAllowedMethodKeys } from '../constants/accountantPlanMethods'
import { MERCURY_TO_ENGINE_MESSAGE_TYPES } from '../constants/crossAppMessages'
import { useAuthStore } from '../lib/auth'
import { backendAPI } from '../services/backendApi'
import { getCapturedMercuryAuthBootstrap } from '../utils/auth/mercury-auth-bootstrap'
import { getMercuryUrl } from '../utils/getMercuryUrl'
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
  plan_features?: Partial<PlanFeatureFlags>
  bonus_valuations?: number
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
    live_benelux_sector_multiples: ['premium', 'starter', 'pro', 'expert', 'enterprise'].includes(
      pt
    ),
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

/**
 * Synchronously seed `plan` for the very first render so plan-gated UI
 * (method nav lock badges, feature gates) renders the correct tier on
 * paint instead of flashing the Free-tier list while `/credits/plan` is
 * in flight. Two complementary sources, in priority order:
 *
 *   1. Mercury `authBootstrap` postMessage (embedded modal warm path).
 *      Available before any auth fetch resolves because Mercury fires it
 *      on iframe `load`. Carries the only signal we have for the
 *      embedded path before Venus's own `/api/auth/me` returns.
 *   2. `useAuthStore.user.plan_type` (standalone path). Titan's `/me`
 *      response already includes `plan_type` (resolved from
 *      `user_plans[0].plan_type`), but `useCredits` historically waited
 *      for a separate `/credits/plan` round-trip to learn the tier — so
 *      a Pro/Expert advisor opening `https://venus.app/calculator` saw
 *      DCF / fiscal_4x methods rendered as locked for ~200–600 ms until
 *      Titan answered. Reading `user.plan_type` directly turns that
 *      flash into a no-op.
 *
 * Both seeds intentionally leave credit counts at 0 — anything that
 * needs an exact remaining-count must read after `backendAPI.getUserPlan()`
 * resolves. Server-side `/credit*` endpoints are still authoritative.
 */
function seedPlanFromMercuryBootstrap(): UserPlan | null {
  const bootstrap = getCapturedMercuryAuthBootstrap()
  const bootstrapPlanType = bootstrap?.user?.planType
  if (bootstrapPlanType) {
    return {
      id: 'mercury-bootstrap-seed',
      user_id: bootstrap?.user?.id ?? 'mercury-bootstrap',
      plan_type: bootstrapPlanType,
      credits_per_period: 0,
      credits_used: 0,
      credits_remaining: 0,
      created_at: new Date().toISOString(),
      allowed_methods: undefined,
    }
  }
  // Standalone path: read whatever `/api/auth/me` already populated on
  // the auth store. `getState()` is a synchronous Zustand read — safe to
  // call from useState's lazy initializer.
  const storeUser = useAuthStore.getState().user as {
    id?: string
    plan_type?: string | null
  } | null
  const storePlanType = storeUser?.plan_type
  if (typeof storePlanType === 'string' && storePlanType.length > 0) {
    return {
      id: 'auth-store-plan-seed',
      user_id: storeUser?.id ?? 'auth-store',
      plan_type: storePlanType,
      credits_per_period: 0,
      credits_used: 0,
      credits_remaining: 0,
      created_at: new Date().toISOString(),
      allowed_methods: undefined,
    }
  }
  return null
}

export const useCredits = (): CreditContextValue => {
  const [plan, setPlan] = useState<UserPlan | null>(seedPlanFromMercuryBootstrap)
  const [isLoading, setIsLoading] = useState(true)
  /**
   * Late-arriving auth-store seed. When `useCredits` mounts before
   * `BootstrapProvider`'s `/api/auth/me` has populated `user.plan_type`,
   * the lazy `useState` initializer above sees `user = null` and falls
   * through to the null branch — the user then experiences a brief
   * Free-tier render flash on the method nav. Subscribing to the
   * primitive `plan_type` slice lets us patch the seed the instant
   * Titan's `/me` lands, even if `loadCredits` is still in flight. We
   * never overwrite an authoritative `/credits/plan` response: the seed
   * id ends in `-seed`, real Titan plans carry their UUID.
   */
  const userPlanTypeFromAuth = useAuthStore(
    (s) => (s.user as { plan_type?: string | null } | null)?.plan_type ?? null
  )
  const userIdFromAuth = useAuthStore((s) => s.user?.id ?? null)

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
          bonus_valuations: planData.bonus_valuations ?? 0,
        })
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

  // Late-arriving auth-store seed (see comment on userPlanTypeFromAuth).
  useEffect(() => {
    if (!userPlanTypeFromAuth) return
    setPlan((prev) => {
      // Don't clobber an authoritative response: real Titan plans carry
      // a UUID, our seeds end in `-seed`.
      if (prev && !prev.id.endsWith('-seed')) return prev
      if (prev?.plan_type === userPlanTypeFromAuth) return prev
      return {
        id: 'auth-store-plan-seed',
        user_id: userIdFromAuth ?? 'auth-store',
        plan_type: userPlanTypeFromAuth,
        credits_per_period: prev?.credits_per_period ?? 0,
        credits_used: prev?.credits_used ?? 0,
        credits_remaining: prev?.credits_remaining ?? 0,
        created_at: prev?.created_at ?? new Date().toISOString(),
        allowed_methods: prev?.allowed_methods,
      }
    })
  }, [userPlanTypeFromAuth, userIdFromAuth])

  // Live plan propagation. Mercury fires `upswitch-plan-refresh` whenever
  // the user's `plan_type` changes mid-session (Stripe webhook, trial
  // flip, manual admin change). Without this listener, Venus would keep
  // showing the old tier's gates until the iframe was unmounted/remounted
  // — `loadCredits` only ran once on mount. The listener is intentionally
  // strict about origin and source so a hostile parent page can't fake a
  // plan upgrade and unlock paid methods in the UI; the actual save call
  // is still server-checked.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let allowedOrigin: string
    try {
      allowedOrigin = new URL(getMercuryUrl()).origin
    } catch {
      return
    }
    const handler = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin) {
        if (process.env.NODE_ENV === 'production') return
        // Dev: tolerate localhost variants (Mercury :3000, Venus :3001).
        if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(event.origin)) return
      }
      const data = event.data as { type?: string; source?: string } | null
      if (!data || data.type !== MERCURY_TO_ENGINE_MESSAGE_TYPES.planRefresh) return
      if (data.source && data.source !== 'mercury') return
      generalLogger.debug('Plan refresh requested by Mercury — refetching plan')
      void loadCredits()
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
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
    return plan?.bonus_valuations ?? 0
  }, [plan?.bonus_valuations])

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
