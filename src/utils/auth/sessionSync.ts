/**
 * Session Synchronization
 *
 * Keeps sessions synchronized across tabs and subdomains
 * Uses BroadcastChannel API for same-origin communication
 * Uses localStorage events for cross-tab updates
 */

export interface SessionSyncMessage {
  type: 'SESSION_UPDATED' | 'SESSION_INVALIDATED' | 'SESSION_REFRESHED'
  domain: string
  timestamp: number
  userId?: string
}

const CHANNEL_NAME = 'upswitch_session_sync'
const STORAGE_KEY = 'upswitch_session_sync'

/**
 * Session Synchronization Manager
 */
export class SessionSyncManager {
  private channel: BroadcastChannel | null = null
  private listeners: Set<(message: SessionSyncMessage) => void> = new Set()
  private storageListener: ((e: StorageEvent) => void) | null = null

  constructor() {
    // Initialize BroadcastChannel if available (same-origin)
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event) => {
        this.handleMessage(event.data)
      }
    }

    // Initialize localStorage listener for cross-tab updates
    if (typeof window !== 'undefined') {
      this.storageListener = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            const message: SessionSyncMessage = JSON.parse(e.newValue)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse session sync message:', error)
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
    const message: SessionSyncMessage = {
      type: 'SESSION_UPDATED',
      domain,
      timestamp: Date.now(),
      userId,
    }

    // Broadcast via BroadcastChannel (same-origin)
    if (this.channel) {
      this.channel.postMessage(message)
    }

    // Broadcast via localStorage (cross-tab)
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
        // Remove immediately to trigger storage event in other tabs
        setTimeout(() => {
          localStorage.removeItem(STORAGE_KEY)
        }, 100)
      } catch (error) {
        console.warn('Failed to broadcast via localStorage:', error)
      }
    }
  }

  /**
   * Broadcast session invalidation (logout)
   */
  broadcastSessionInvalidation(domain: string): void {
    const message: SessionSyncMessage = {
      type: 'SESSION_INVALIDATED',
      domain,
      timestamp: Date.now(),
    }

    if (this.channel) {
      this.channel.postMessage(message)
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
        setTimeout(() => {
          localStorage.removeItem(STORAGE_KEY)
        }, 100)
      } catch (error) {
        console.warn('Failed to broadcast invalidation:', error)
      }
    }
  }

  /**
   * Broadcast session refresh
   */
  broadcastSessionRefresh(domain: string, userId?: string): void {
    const message: SessionSyncMessage = {
      type: 'SESSION_REFRESHED',
      domain,
      timestamp: Date.now(),
      userId,
    }

    if (this.channel) {
      this.channel.postMessage(message)
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
        setTimeout(() => {
          localStorage.removeItem(STORAGE_KEY)
        }, 100)
      } catch (error) {
        console.warn('Failed to broadcast refresh:', error)
      }
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: SessionSyncMessage): void {
    // Ignore messages from same domain (avoid loops)
    if (message.domain === window.location.hostname) {
      return
    }

    // Notify all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(message)
      } catch (error) {
        console.error('Error in session sync listener:', error)
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
