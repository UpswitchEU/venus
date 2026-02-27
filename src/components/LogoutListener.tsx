'use client'

import { useTransitionRouter } from 'next-view-transitions'
import { useEffect } from 'react'
import { useAuthStore } from '../lib/auth'
import {
  clearAllAuthState,
  listenForLogin,
  listenForLogout,
  setupAuthStateWatcher,
} from '../utils/auth/cross-domain-logout'

/**
 * Logout Listener Component
 *
 * STRIPE/AIRBNB APPROACH: Minimal, efficient sync
 * - BroadcastChannel/postMessage for same-origin tabs (immediate, efficient)
 * - Visibility change for background tabs (detects on next API call)
 *
 * KEY INSIGHT: Cookies are shared automatically via .upswitch.app domain.
 * When user switches tabs, the next API call will automatically detect
 * cookie changes. We only need to check when tab becomes visible.
 *
 * Storage events don't work cross-subdomain, so we rely on:
 * 1. BroadcastChannel/postMessage (same-origin tabs) - immediate sync
 * 2. Visibility change (background tabs) - checks on next API call
 */
export function LogoutListener() {
  const router = useTransitionRouter()
  const { checkSession } = useAuthStore()

  useEffect(() => {
    // 1. Listen for logout events from same-origin tabs
    const cleanupLogoutListener = listenForLogout(() => {
      clearAllAuthState()

      useAuthStore.getState().setUser(null)
      useAuthStore.getState().setLoading(false)
      useAuthStore.getState().setError(null)

      router.push('/')
    })

    // 2. Listen for login events from same-origin tabs
    // Defer during initialization to avoid store mutations that cascade
    // to AuthGate/BootstrapProvider while they're still starting up.
    const cleanupLoginListener = listenForLogin(async () => {
      const { isInitializing, loading } = useAuthStore.getState()
      if (isInitializing || loading) return
      await checkSession()
    })

    // 3. Setup auth state watcher for cross-subdomain detection.
    // Skip entirely while auth is initializing — initializeAuth() is the
    // single source of truth during startup. Mutating the store from a
    // visibility-change listener during init causes AuthGate's useEffect
    // to re-run and can trigger remount loops.
    const cleanupAuthWatcher = setupAuthStateWatcher(async (isAuthenticated) => {
      const { user: currentUser, isInitializing, loading } = useAuthStore.getState()
      if (isInitializing || loading) return

      if (currentUser && !isAuthenticated) {
        clearAllAuthState()

        useAuthStore.getState().setUser(null)
        useAuthStore.getState().setLoading(false)
        useAuthStore.getState().setError(null)

        router.push('/')
      }

      if (!currentUser && isAuthenticated) {
        await checkSession()
      }
    })

    return () => {
      cleanupLogoutListener()
      cleanupLoginListener()
      cleanupAuthWatcher()
    }
  }, [router, checkSession])

  // Note: Navigation checks removed - overkill
  // Cookies are shared automatically, so we don't need to check on every route change
  // Storage events and visibility changes are sufficient (like Stripe/Airbnb)

  return null // This component doesn't render anything
}
