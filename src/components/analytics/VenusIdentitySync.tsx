'use client'

/**
 * Venus identity sync.
 *
 * Subscribes to the auth store and keeps the analytics identity in lock-step
 * with the signed-in user. Without this, `identifyUser` only fired on the
 * `HomePage` mount — every other Venus surface (`/reports/*`, calculator
 * sub-routes, the embedded modal flows) had no `user_id` attached to its
 * events, so cross-device GA4 stitching and `is_internal` filtering broke
 * the moment a user landed somewhere other than the home page.
 *
 * Mirrors Mercury's `GoogleAnalytics.tsx` identity effect: on user → present
 * we identify (with role / plan / email); on user → null we clear. Every
 * sticky tag (`user_role`, `current_plan`, `is_internal`) gets reset on
 * sign-out so the next signed-in user doesn't inherit stale enrichment.
 */

import { useEffect } from 'react'
import { clearUserIdentity, identifyUser } from '@/lib/analytics'
import { useAuthStore } from '@/lib/auth'

interface VenusUserShape {
  id?: string | null
  role?: string | null
  email?: string | null
  plan_type?: string | null
}

export function VenusIdentitySync() {
  const user = useAuthStore((s) => s.user) as VenusUserShape | null
  const userId = user?.id ?? null
  const userRole = user?.role ?? null
  const userEmail = user?.email ?? null
  const userPlan = user?.plan_type ?? null

  useEffect(() => {
    if (!userId) {
      clearUserIdentity()
      return
    }
    identifyUser(userId, {
      role: userRole ?? undefined,
      plan: userPlan ?? undefined,
      email: userEmail ?? undefined,
    })
  }, [userId, userRole, userEmail, userPlan])

  return null
}
