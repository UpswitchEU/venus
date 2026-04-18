'use client'

import { useTransitionRouter } from 'next-view-transitions'
import { useEffect, useRef } from 'react'
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
 * Syncs auth state across tabs via BroadcastChannel and visibility events.
 * Runs once on mount — no reactive deps that could cause effect churn.
 */
export function LogoutListener() {
  const router = useTransitionRouter()
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])

  useEffect(() => {
    const cleanupLogoutListener = listenForLogout(() => {
      clearAllAuthState()
      useAuthStore.getState().setUser(null)
      useAuthStore.getState().setLoading(false)
      useAuthStore.getState().setError(null)
      routerRef.current.push('/')
    })

    const cleanupLoginListener = listenForLogin(async () => {
      if (typeof window !== 'undefined' && window.__isLoggingOut) return
      const { isInitializing, loading } = useAuthStore.getState()
      if (isInitializing || loading) return
      await useAuthStore.getState().checkSession()
    })

    const cleanupAuthWatcher = setupAuthStateWatcher(async (isAuthenticated) => {
      if (typeof window !== 'undefined' && window.__isLoggingOut) return
      const { user, isInitializing, loading } = useAuthStore.getState()
      if (isInitializing || loading) return

      if (user && !isAuthenticated) {
        clearAllAuthState()
        useAuthStore.getState().setUser(null)
        useAuthStore.getState().setLoading(false)
        useAuthStore.getState().setError(null)
        routerRef.current.push('/')
      }

      if (!user && isAuthenticated) {
        if (typeof window !== 'undefined' && window.__isLoggingOut) return
        await useAuthStore.getState().checkSession()
      }
    })

    return () => {
      cleanupLogoutListener()
      cleanupLoginListener()
      cleanupAuthWatcher()
    }
  }, [])

  return null
}
