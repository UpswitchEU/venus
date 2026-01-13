'use client'

import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const { checkSession } = useAuthStore()

  useEffect(() => {
    // 1. Listen for logout events from same-origin tabs
    const cleanupLogoutListener = listenForLogout(() => {
      // Clear all auth state
      clearAllAuthState()

      // Clear Zustand store
      useAuthStore.getState().setUser(null)
      useAuthStore.getState().setLoading(false)
      useAuthStore.getState().setError(null)

      // Redirect to home page
      router.push('/')
    })

    // 2. Listen for login events from same-origin tabs
    const cleanupLoginListener = listenForLogin(async () => {
      // Refresh auth state to detect new login
      await checkSession()
    })

    // 3. Setup auth state watcher for cross-subdomain detection
    // This detects when cookies are cleared by Mercury logout
    // CORE SOLUTION: Directly calls checkSession() which has promise caching
    // No race conditions - promise cache handles all concurrency
    const cleanupAuthWatcher = setupAuthStateWatcher(async (isAuthenticated) => {
      const currentUser = useAuthStore.getState().user

      // If we think we're authenticated but backend says we're not
      if (currentUser && !isAuthenticated) {
        // Clear all auth state
        clearAllAuthState()

        // Clear Zustand store
        useAuthStore.getState().setUser(null)
        useAuthStore.getState().setLoading(false)
        useAuthStore.getState().setError(null)

        // Redirect to home page
        router.push('/')
      }

      // If we think we're not authenticated but backend says we are
      if (!currentUser && isAuthenticated) {
        // Direct call to checkSession - promise cache handles concurrency
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
