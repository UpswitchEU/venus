/**
 * Cross-Domain Logout Synchronization
 *
 * Ensures logout state is synchronized across all Upswitch subdomains:
 * - upswitch.app (Mercury)
 * - api.upswitch.app (Titan)
 * - valuation.upswitch.app (Venus)
 *
 * Uses postMessage API to notify all open tabs/windows across subdomains
 * Also watches for cookie changes via visibility/focus events
 */

import { createRandomId } from '../secureRandom'
import { removeAuthRelatedSessionStorageKeys } from './clear-auth-session-storage'

const LOGOUT_EVENT = 'upswitch-logout'
const LOGIN_EVENT = 'upswitch-login'

/** Same hostname on every tab — use a per-document id so cross-tab auth sync actually fires. */
function getBroadcastInstanceId(): string {
  if (typeof window === 'undefined') return ''
  const w = window as Window & { __upswitchBroadcastInstanceId?: string }
  if (!w.__upswitchBroadcastInstanceId) {
    w.__upswitchBroadcastInstanceId = createRandomId('broadcast', 12)
  }
  return w.__upswitchBroadcastInstanceId
}

function shouldIgnoreOwnBroadcast(data: { broadcastInstanceId?: string } | undefined): boolean {
  const id = data?.broadcastInstanceId
  return id != null && id === getBroadcastInstanceId()
}

const AUTH_SYNC_CHANNEL = 'upswitch-auth-sync'
const REPORT_CREATED_EVENT = 'upswitch-report-created'
const REPORT_UPDATED_EVENT = 'upswitch-report-updated'
const REPORT_DELETED_EVENT = 'upswitch-report-deleted'

/**
 * Broadcast logout event to same-origin tabs only (secure)
 *
 * Uses BroadcastChannel for efficiency (same-origin tabs)
 * Falls back to postMessage for compatibility
 *
 * SECURITY: Only broadcasts to same origin - no wildcard origins
 * Cross-origin logout is handled by backend cookie clearing
 */
export function broadcastLogout(): void {
  if (typeof window === 'undefined') return

  try {
    const message = {
      type: LOGOUT_EVENT,
      timestamp: Date.now(),
      source: window.location.hostname,
      broadcastInstanceId: getBroadcastInstanceId(),
    }

    // Use BroadcastChannel if available (more efficient)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL)
        channel.postMessage(message)
        channel.close() // Close after sending
      } catch (_error) {
        // Fallback to postMessage
      }
    }

    // Also use postMessage for compatibility
    window.postMessage(message, window.location.origin)
  } catch (_error) {
    // Broadcast failed — non-critical, tab sync is best-effort
  }
}

/**
 * Listen for logout events from other same-origin tabs
 * This should be called on app initialization
 *
 * SECURITY: Only accepts messages from same origin (strict check)
 */
export function listenForLogout(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined // No-op cleanup function
  }

  let channel: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(AUTH_SYNC_CHANNEL)
      channel.onmessage = (event) => {
        if (event.data?.type !== LOGOUT_EVENT) return
        if (shouldIgnoreOwnBroadcast(event.data)) return
        callback()
      }
    } catch {
      channel = null
    }
  }

  const handleMessage = (event: MessageEvent) => {
    // STRICT: Only accept messages from same origin
    const isSameOrigin = event.origin === window.location.origin

    if (event.data?.type === LOGOUT_EVENT && isSameOrigin) {
      if (shouldIgnoreOwnBroadcast(event.data)) return
      callback()
    }
  }

  window.addEventListener('message', handleMessage)

  // Return cleanup function
  return () => {
    channel?.close()
    window.removeEventListener('message', handleMessage)
  }
}

/**
 * Listen for login events from other tabs/subdomains
 *
 * Uses BroadcastChannel for same-origin tabs (more efficient)
 * Falls back to postMessage for compatibility (same-origin).
 */
export function listenForLogin(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined // No-op cleanup function
  }

  let channel: BroadcastChannel | null = null

  // Use BroadcastChannel if available (more efficient for same-origin)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(AUTH_SYNC_CHANNEL)
      channel.onmessage = (event) => {
        if (event.data?.type !== LOGIN_EVENT) return
        if (shouldIgnoreOwnBroadcast(event.data)) return
        callback()
      }
    } catch (_error) {
      // BroadcastChannel not available, fall through to postMessage
    }
  }

  const handleMessage = (event: MessageEvent) => {
    const isSameOrigin = event.origin === window.location.origin

    if (event.data?.type === LOGIN_EVENT && isSameOrigin) {
      if (shouldIgnoreOwnBroadcast(event.data)) return
      callback()
    }
  }

  window.addEventListener('message', handleMessage)

  // Return cleanup function
  return () => {
    if (channel) {
      channel.close()
    }
    window.removeEventListener('message', handleMessage)
  }
}

/**
 * Broadcast login event to same-origin tabs
 *
 * Uses BroadcastChannel for efficiency (same-origin tabs)
 * Falls back to postMessage for compatibility
 * Also dispatches custom event for Mercury compatibility
 */
export function broadcastLogin(): void {
  if (typeof window === 'undefined') return

  try {
    const message = {
      type: LOGIN_EVENT,
      timestamp: Date.now(),
      source: window.location.hostname,
      broadcastInstanceId: getBroadcastInstanceId(),
    }

    // Use BroadcastChannel if available (more efficient)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL)
        channel.postMessage(message)
        channel.close() // Close after sending
      } catch (_error) {
        // Fallback to postMessage
      }
    }

    // Also use postMessage for compatibility
    window.postMessage(message, window.location.origin)
  } catch (_error) {
    // Broadcast failed — non-critical, tab sync is best-effort
  }
}

/**
 * Clear all auth-related storage (NOT cookies - server handles those)
 * This is called when logout is detected from another tab
 *
 * IMPORTANT: Does NOT clear cookies - those are HttpOnly and cleared by server
 */
export function clearAllAuthState(): void {
  if (typeof window === 'undefined') return

  try {
    // Clear localStorage
    const localStorageKeys = [
      'upswitch_has_session',
      'upswitch_user',
      'UpSwitch_dev_logged_out',
      'upswitch_auth_cache',
    ]
    localStorageKeys.forEach((key) => localStorage.removeItem(key))

    removeAuthRelatedSessionStorageKeys()

    // DO NOT clear cookies here - server clears HttpOnly cookies
    // Client-side document.cookie cannot clear HttpOnly cookies anyway
  } catch (error) {
    // Silent error handling - only log in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[CrossDomainLogout] Error clearing auth state:', error)
    }
  }
}

/**
 * Check auth state by calling checkSession directly
 *
 * CORE SOLUTION: Uses checkSession() which has built-in promise caching
 * No mutex needed - promise cache handles all concurrency automatically
 * Multiple calls = single API request (handled by checkSession's promise cache)
 */
export async function checkAuthState(): Promise<boolean> {
  try {
    // Direct call to checkSession - its promise cache handles all concurrency
    const { useAuthStore } = await import('../../lib/auth')
    const user = await useAuthStore.getState().checkSession()
    return user !== null
  } catch (error) {
    // Silent error handling - only log in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[CrossDomainLogout] Auth state check failed:', error)
    }
    return false
  }
}

/**
 * Setup auth state watcher
 *
 * STRIPE/AIRBNB APPROACH: Minimal, efficient detection
 * - Visibility change for background tabs (primary)
 *
 * KEY INSIGHT: Cookies are shared automatically via .upswitch.app domain.
 * When user switches tabs, the next API call will automatically detect
 * cookie changes. We only need to check when tab becomes visible.
 *
 * Storage events don't work cross-subdomain, so we rely on:
 * 1. PostMessage (same-origin tabs) - handled separately
 * 2. Visibility change (background tabs) - checks on next API call
 */
export function setupAuthStateWatcher(
  onAuthStateChange: (isAuthenticated: boolean) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined // No-op cleanup function
  }

  // Simple check function - promise cache handles concurrency
  const checkAuth = async () => {
    try {
      const isAuthenticated = await checkAuthState()
      onAuthStateChange(isAuthenticated)
    } catch (_error) {
      // Auth check failed — will be retried on next visibility change
    }
  }

  // Visibility change for background tabs
  // When tab becomes visible, check auth state
  // Cookies are shared automatically, so next API call will detect changes
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkAuth()
    }
  }

  window.addEventListener('visibilitychange', handleVisibilityChange)

  // Return cleanup function
  return () => {
    window.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}

/**
 * Broadcast report creation event to same-origin tabs
 * Used for cross-subdomain state sync (Venus → Mercury)
 */
export function broadcastReportCreated(reportData: {
  reportId: string
  reportName?: string
  createdAt: Date
  clientId?: string
}): void {
  if (typeof window === 'undefined') return

  try {
    const message = {
      type: REPORT_CREATED_EVENT,
      timestamp: Date.now(),
      source: window.location.hostname,
      data: reportData,
    }

    // Use BroadcastChannel if available (more efficient)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('upswitch-report-sync')
        channel.postMessage(message)
        channel.close()
      } catch (_error) {
        // Fallback to postMessage
      }
    }

    // Also use postMessage for compatibility
    window.postMessage(message, window.location.origin)
  } catch (_error) {
    // Broadcast failed — non-critical
  }
}

/**
 * Broadcast report update event to same-origin tabs
 * Enhanced for Mercury integration - includes full valuation data
 */
export function broadcastReportUpdated(reportData: {
  reportId: string
  reportName?: string
  updatedAt: Date
  clientId?: string
  // ✅ NEW: Include valuation results for optimistic updates
  valuationResult?: {
    equity_value_low?: number
    equity_value_mid?: number
    equity_value_high?: number
    recommended_asking_price?: number
    confidence_score?: number
    methodology?: string
  }
  // ✅ NEW: Include version info for activity tracking
  versionCount?: number
  latestVersion?: {
    versionNumber: number
    createdAt: Date
    changes?: unknown
  }
}): void {
  if (typeof window === 'undefined') return

  try {
    const message = {
      type: REPORT_UPDATED_EVENT,
      timestamp: Date.now(),
      source: window.location.hostname,
      data: reportData,
    }

    // Use BroadcastChannel if available
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('upswitch-report-sync')
        channel.postMessage(message)
        channel.close()
      } catch (_error) {
        // Fallback to postMessage
      }
    }

    window.postMessage(message, window.location.origin)
  } catch (_error) {
    // Broadcast failed — non-critical
  }
}

/**
 * Broadcast report deletion event to same-origin tabs
 */
export function broadcastReportDeleted(reportData: { reportId: string; clientId?: string }): void {
  if (typeof window === 'undefined') return

  try {
    const message = {
      type: REPORT_DELETED_EVENT,
      timestamp: Date.now(),
      source: window.location.hostname,
      data: reportData,
    }

    // Use BroadcastChannel if available
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('upswitch-report-sync')
        channel.postMessage(message)
        channel.close()
      } catch (_error) {
        // Fallback to postMessage
      }
    }

    window.postMessage(message, window.location.origin)
  } catch (_error) {
    // Broadcast failed — non-critical
  }
}

/**
 * Listen for report events from other tabs/subdomains
 * Used for cross-subdomain state sync (Mercury → Venus)
 * Enhanced for Mercury integration - includes full valuation data
 */
export function listenForReportEvents(callbacks: {
  onReportCreated?: (data: {
    reportId: string
    reportName?: string
    createdAt: Date
    clientId?: string
  }) => void
  onReportUpdated?: (data: {
    reportId: string
    reportName?: string
    updatedAt: Date
    clientId?: string
    valuationResult?: {
      equity_value_low?: number
      equity_value_mid?: number
      equity_value_high?: number
      recommended_asking_price?: number
      confidence_score?: number
      methodology?: string
    }
    versionCount?: number
    latestVersion?: {
      versionNumber: number
      createdAt: Date
      changes?: unknown
    }
  }) => void
  onReportDeleted?: (data: { reportId: string; clientId?: string }) => void
}): () => void {
  if (typeof window === 'undefined') {
    return () => undefined // No-op cleanup function
  }

  let channel: BroadcastChannel | null = null

  // Use BroadcastChannel if available
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel('upswitch-report-sync')
      channel.onmessage = (event) => {
        const { type, data, source } = event.data

        // Don't react to our own messages
        if (source === window.location.hostname) return

        if (type === REPORT_CREATED_EVENT && callbacks.onReportCreated) {
          callbacks.onReportCreated(data)
        } else if (type === REPORT_UPDATED_EVENT && callbacks.onReportUpdated) {
          callbacks.onReportUpdated(data)
        } else if (type === REPORT_DELETED_EVENT && callbacks.onReportDeleted) {
          callbacks.onReportDeleted(data)
        }
      }
    } catch (_error) {
      // BroadcastChannel not available, fall through to postMessage
    }
  }

  // Fallback to postMessage
  const handleMessage = (event: MessageEvent) => {
    // STRICT: Only accept messages from same origin
    const isSameOrigin = event.origin === window.location.origin

    if (!isSameOrigin || event.data.source === window.location.hostname) {
      return
    }

    const { type, data } = event.data

    if (type === REPORT_CREATED_EVENT && callbacks.onReportCreated) {
      callbacks.onReportCreated(data)
    } else if (type === REPORT_UPDATED_EVENT && callbacks.onReportUpdated) {
      callbacks.onReportUpdated(data)
    } else if (type === REPORT_DELETED_EVENT && callbacks.onReportDeleted) {
      callbacks.onReportDeleted(data)
    }
  }

  window.addEventListener('message', handleMessage)

  // Return cleanup function
  return () => {
    if (channel) {
      channel.close()
    }
    window.removeEventListener('message', handleMessage)
  }
}
