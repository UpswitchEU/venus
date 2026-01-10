/**
 * Guest Session Service (Simplified Version)
 *
 * Manages guest user session tracking in the frontend
 * Simplified for subdomain integration - removed circuit breaker complexity
 */

import { generalLogger } from '../utils/logger'
import { retry } from '../utils/retry'

const GUEST_SESSION_KEY = 'upswitch_guest_session_id'
const GUEST_SESSION_EXPIRES_KEY = 'upswitch_guest_session_expires_at'
const ACTIVITY_UPDATE_THROTTLE = 10000 // 10 seconds minimum between updates (increased to prevent 429 errors)

class GuestSessionService {
  private apiUrl: string
  private lastActivityUpdate: number = 0
  private sessionCreationPromise: Promise<string> | null = null

  constructor() {
    this.apiUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'https://api.upswitch.app'
  }

  /**
   * Generate a unique guest session ID (client-side)
   */
  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    return `guest_${timestamp}_${random}`
  }

  /**
   * Get or create guest session (with promise cache to prevent race conditions)
   * Optimized to trust localStorage when session is far from expiration
   */
  async getOrCreateSession(): Promise<string> {
    // Return existing promise if session creation is in progress (prevents race conditions)
    if (this.sessionCreationPromise) {
      return this.sessionCreationPromise
    }

    // Check localStorage first (synchronous check)
    const storedSessionId = localStorage.getItem(GUEST_SESSION_KEY)
    const storedExpiresAt = localStorage.getItem(GUEST_SESSION_EXPIRES_KEY)

    // If we have a stored session that expires in more than 1 hour, trust it without verification
    // This reduces backend calls significantly
    if (storedSessionId && storedExpiresAt) {
      const expiresAt = new Date(storedExpiresAt)
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)

      if (expiresAt > oneHourFromNow) {
        // Session is valid for more than 1 hour - trust localStorage without verification
        generalLogger.debug('Using cached session (expires in more than 1 hour)', {
          sessionId: storedSessionId.substring(0, 15) + '...',
          expiresAt,
        })
        return storedSessionId
      }

      // Session expires soon or is expired - verify on backend
      if (expiresAt > new Date()) {
        // Session not expired yet, but close to expiration - verify it exists
        try {
          const response = await retry(
            () =>
              fetch(`${this.apiUrl}/api/guest/session/${storedSessionId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              }),
            1, // Reduced from 3 to 1 retry
            1000
          )

          if (response.ok) {
            const data = await response.json()
            if (data.success) {
              localStorage.setItem(GUEST_SESSION_EXPIRES_KEY, data.data.expires_at)
              return storedSessionId
            }
          }
        } catch (error) {
          generalLogger.warn('Failed to verify existing session, creating new one', { error })
        }
      }
    }

    // Create new session (with promise cache to prevent multiple simultaneous creations)
    this.sessionCreationPromise = this._createSession()
    try {
      const sessionId = await this.sessionCreationPromise
      return sessionId
    } finally {
      this.sessionCreationPromise = null
    }
  }

  /**
   * Internal method to create a new guest session
   */
  private async _createSession(): Promise<string> {
    try {
      const sessionId = this.generateSessionId()
      const response = await retry(
        () =>
          fetch(`${this.apiUrl}/api/guest/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
          }),
        1, // Reduced from 3 to 1 retry
        1000
      )

      if (!response.ok) {
        throw new Error(`Failed to create guest session: ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.success || !data.data?.session_id) {
        throw new Error('Invalid response from session creation')
      }

      // Store session ID and expiration
      localStorage.setItem(GUEST_SESSION_KEY, data.data.session_id)
      localStorage.setItem(GUEST_SESSION_EXPIRES_KEY, data.data.expires_at)

      generalLogger.info('Guest session created', {
        sessionId: data.data.session_id,
        expiresAt: data.data.expires_at,
      })

      return data.data.session_id
    } catch (error) {
      generalLogger.error('Failed to create guest session', { error })
      // Fallback: use client-generated session ID
      const fallbackSessionId = this.generateSessionId()
      localStorage.setItem(GUEST_SESSION_KEY, fallbackSessionId)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)
      localStorage.setItem(GUEST_SESSION_EXPIRES_KEY, expiresAt.toISOString())
      return fallbackSessionId
    }
  }

  /**
   * Get current session ID (doesn't create if doesn't exist)
   */
  getCurrentSessionId(): string | null {
    return localStorage.getItem(GUEST_SESSION_KEY)
  }

  /**
   * Get cached guest session ID synchronously
   */
  getGuestSessionId(): string | null {
    return this.getCurrentSessionId()
  }

  /**
   * Check if user is currently a guest (has guest session but no auth)
   */
  isGuest(): boolean {
    return !!this.getCurrentSessionId()
  }

  /**
   * Update session activity (simplified with throttling and silent failure)
   */
  async updateActivity(): Promise<void> {
    const sessionId = this.getCurrentSessionId()
    if (!sessionId) return

    // Simple throttling
    const now = Date.now()
    if (now - this.lastActivityUpdate < ACTIVITY_UPDATE_THROTTLE) {
      return
    }
    this.lastActivityUpdate = now

    // Fire and forget with simple retry
    // FIX: Handle 429 rate limiting gracefully - don't retry on rate limit
    try {
      const response = await fetch(`${this.apiUrl}/api/guest/session/${sessionId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // FIX: Send empty object to satisfy Fastify/NestJS validation
      })

      // If rate limited (429), just skip - don't retry
      if (response.status === 429) {
        generalLogger.debug('Activity update rate limited, skipping', { sessionId })
        return
      }

      if (!response.ok) {
        throw new Error(`Activity update failed: ${response.status}`)
      }
    } catch (error) {
      // Silent failure - activity tracking is non-critical
      // Don't log 429 errors as warnings - they're expected under load
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (!errorMessage.includes('429')) {
        generalLogger.warn('Activity update failed (will retry next time)', {
          error: errorMessage,
        })
      }
    }
  }

  /**
   * Clear guest session
   */
  clearSession(): void {
    try {
      localStorage.removeItem(GUEST_SESSION_KEY)
      localStorage.removeItem(GUEST_SESSION_EXPIRES_KEY)
      generalLogger.info('Guest session cleared')
    } catch (error) {
      generalLogger.warn('Failed to clear guest session', { error })
    }
  }
}

export const guestSessionService = new GuestSessionService()
