/**
 * Session Synchronization
 *
 * Keeps sessions synchronized across tabs and subdomains
 * Uses BroadcastChannel API for same-origin communication
 * Uses localStorage events for cross-tab updates
 */

import { authLogger } from '../logger'

export interface SessionSyncMessage {
  type: 'SESSION_UPDATED' | 'SESSION_INVALIDATED' | 'SESSION_REFRESHED'
  domain: string
  timestamp: number
  userId?: string
}

const CHANNEL_NAME = 'upswitch_session_sync'
const STORAGE_KEY = 'upswitch_session_sync'
const STORAGE_SIGNAL_TTL_MS = 100

const SESSION_SYNC_TYPES = new Set<SessionSyncMessage['type']>([
  'SESSION_UPDATED',
  'SESSION_INVALIDATED',
  'SESSION_REFRESHED',
])

function isSessionSyncMessage(value: unknown): value is SessionSyncMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SessionSyncMessage>
  return (
    typeof candidate.type === 'string' &&
    SESSION_SYNC_TYPES.has(candidate.type as SessionSyncMessage['type']) &&
    typeof candidate.domain === 'string' &&
    typeof candidate.timestamp === 'number' &&
    Number.isFinite(candidate.timestamp) &&
    (candidate.userId == null || typeof candidate.userId === 'string')
  )
}

/**
 * Session Synchronization Manager
 */
export class SessionSyncManager {
  private channel: BroadcastChannel | null = null
  private listeners: Set<(message: SessionSyncMessage) => void> = new Set()
  private storageListener: ((e: StorageEvent) => void) | null = null
  private storageCleanupTimers: Set<ReturnType<typeof setTimeout>> = new Set()

  constructor() {
    // Initialize BroadcastChannel if available (same-origin)
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event) => {
        this.handleIncomingPayload(event.data)
      }
    }

    // Initialize localStorage listener for cross-tab updates
    if (typeof window !== 'undefined') {
      this.storageListener = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            this.handleIncomingPayload(JSON.parse(e.newValue))
          } catch (error) {
            authLogger.warn('Failed to parse session sync message', { error })
          }
        }
      }
      window.addEventListener('storage', this.storageListener)
    }
  }

  /**
   * Broadcast session update to other tabs/subdomains
   */
  broadcastSessionUpdate(domain: string, userId?: string): void {
    this.broadcast({
      type: 'SESSION_UPDATED',
      domain,
      timestamp: Date.now(),
      userId,
    })
  }

  /**
   * Broadcast session invalidation (logout)
   */
  broadcastSessionInvalidation(domain: string): void {
    this.broadcast({
      type: 'SESSION_INVALIDATED',
      domain,
      timestamp: Date.now(),
    })
  }

  /**
   * Broadcast session refresh
   */
  broadcastSessionRefresh(domain: string, userId?: string): void {
    this.broadcast({
      type: 'SESSION_REFRESHED',
      domain,
      timestamp: Date.now(),
      userId,
    })
  }

  private broadcast(message: SessionSyncMessage): void {
    this.channel?.postMessage(message)

    if (typeof localStorage === 'undefined') return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
      const cleanupTimer = setTimeout(() => {
        this.storageCleanupTimers.delete(cleanupTimer)
        this.removeStorageSignal()
      }, STORAGE_SIGNAL_TTL_MS)
      this.storageCleanupTimers.add(cleanupTimer)
    } catch (error) {
      authLogger.warn('Failed to broadcast session sync message via localStorage', {
        error,
        type: message.type,
      })
    }
  }

  private removeStorageSignal(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      authLogger.warn('Failed to clear session sync storage signal', { error })
    }
  }

  private handleIncomingPayload(payload: unknown): void {
    if (!isSessionSyncMessage(payload)) {
      authLogger.warn('Ignored malformed session sync message')
      return
    }
    this.handleMessage(payload)
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: SessionSyncMessage): void {
    // Ignore messages from same domain (avoid loops)
    if (typeof window !== 'undefined' && message.domain === window.location.hostname) {
      return
    }

    // Notify all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(message)
      } catch (error) {
        authLogger.warn('Session sync listener failed', { error })
      }
    })
  }

  /**
   * Subscribe to session sync events
   */
  onSessionSync(callback: (message: SessionSyncMessage) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }

    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener)
      this.storageListener = null
    }

    this.storageCleanupTimers.forEach((timer) => clearTimeout(timer))
    this.storageCleanupTimers.clear()
    this.removeStorageSignal()
    this.listeners.clear()
  }
}

// Singleton instance
let sessionSyncManager: SessionSyncManager | null = null

/**
 * Get session sync manager instance
 */
export function getSessionSyncManager(): SessionSyncManager {
  if (!sessionSyncManager) {
    sessionSyncManager = new SessionSyncManager()
  }
  return sessionSyncManager
}

/**
 * Cleanup session sync manager (for testing)
 */
export function destroySessionSyncManager(): void {
  if (sessionSyncManager) {
    sessionSyncManager.destroy()
    sessionSyncManager = null
  }
}
