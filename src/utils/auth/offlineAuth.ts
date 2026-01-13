/**
 * Offline Auth Support
 *
 * Caches auth state for offline use
 * Provides offline-first auth checks
 * Syncs when connection is restored
 */

import { User } from '../../contexts/AuthContextTypes'

const AUTH_CACHE_KEY = 'upswitch_auth_cache'
const AUTH_CACHE_VERSION = 1

interface CachedAuthState {
  user: User | null
  isAuthenticated: boolean
  timestamp: number
  version: number
}

/**
 * Cache auth state for offline use
 */
export function cacheAuthState(user: User | null, isAuthenticated: boolean): void {
  if (typeof localStorage === 'undefined') return

  try {
    const state: CachedAuthState = {
      user,
      isAuthenticated,
      timestamp: Date.now(),
      version: AUTH_CACHE_VERSION,
    }

    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to cache auth state:', error)
  }
}

/**
 * Get cached auth state
 */
export function getCachedAuthState(): CachedAuthState | null {
  if (typeof localStorage === 'undefined') return null

  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY)
    if (!cached) return null

    const state: CachedAuthState = JSON.parse(cached)

    // Check version compatibility
    if (state.version !== AUTH_CACHE_VERSION) {
      localStorage.removeItem(AUTH_CACHE_KEY)
      return null
    }

    // Check if cache is stale (older than 24 hours)
    const maxAge = 24 * 60 * 60 * 1000
    if (Date.now() - state.timestamp > maxAge) {
      localStorage.removeItem(AUTH_CACHE_KEY)
      return null
    }

    return state
  } catch (error) {
    console.warn('Failed to get cached auth state:', error)
    return null
  }
}

/**
 * Clear cached auth state
 */
export function clearCachedAuthState(): void {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.removeItem(AUTH_CACHE_KEY)
  } catch (error) {
    console.warn('Failed to clear cached auth state:', error)
  }
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/**
 * Listen for online/offline events
 */
export function onOnlineStatusChange(callback: (isOnline: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
