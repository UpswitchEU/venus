/**
 * Session Recovery (Bank-Grade Error Handling)
 *
 * Handles stale/corrupted sessions gracefully:
 * - 404 errors → create new session
 * - Network errors → retry with exponential backoff
 * - Permission errors → clear session and redirect
 *
 * Key Principles:
 * - Never block user (always recover)
 * - Preserve user data when possible
 * - Clear error messages
 * - Automatic recovery (no manual intervention)
 */

import { unifiedSessionAPI } from '../services/api/session/UnifiedSessionAPI'
import { useUnifiedSessionStore } from '../store/useUnifiedSessionStore'
import logger from '../utils/logger'

export interface SessionError {
  code: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'ACCESS_DENIED' | 'NETWORK_ERROR' | 'UNKNOWN'
  message: string
  originalError: unknown
}

type SessionTransportError = {
  message?: string
  response?: {
    data?: {
      message?: string
    }
    status?: number
  }
}

function asSessionTransportError(error: unknown): SessionTransportError {
  return error && typeof error === 'object' ? (error as SessionTransportError) : {}
}

/**
 * Classify session error
 */
export function classifySessionError(error: unknown): SessionError {
  const transportError = asSessionTransportError(error)
  const status = transportError.response?.status
  const message =
    transportError.response?.data?.message || transportError.message || 'Unknown error'

  if (status === 404) {
    return {
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found or expired',
      originalError: error,
    }
  }

  if (status === 403) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Access denied to this session',
      originalError: error,
    }
  }

  if (status === 410) {
    return {
      code: 'SESSION_EXPIRED',
      message: 'Session has expired',
      originalError: error,
    }
  }

  if (!status || status >= 500) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network error or server unavailable',
      originalError: error,
    }
  }

  return {
    code: 'UNKNOWN',
    message,
    originalError: error,
  }
}

/**
 * Handle session error with automatic recovery
 *
 * Returns new session key if recovery successful, null otherwise
 */
export async function handleSessionError(
  error: unknown,
  sessionKey: string,
  preserveData?: Record<string, unknown>
): Promise<string | null> {
  const sessionError = classifySessionError(error)

  logger.error(
    {
      code: sessionError.code,
      message: sessionError.message,
      session_key: sessionKey.substring(0, 30) + '...',
    },
    '[SessionRecovery] Session error detected'
  )

  switch (sessionError.code) {
    case 'SESSION_NOT_FOUND':
    case 'SESSION_EXPIRED':
      return await recoverFromNotFound(sessionKey, preserveData)

    case 'ACCESS_DENIED':
      return await recoverFromAccessDenied(sessionKey)

    case 'NETWORK_ERROR':
      // Don't auto-recover from network errors (let retry logic handle it)
      logger.warn(
        {
          session_key: sessionKey.substring(0, 30) + '...',
        },
        '[SessionRecovery] Network error, will retry'
      )
      return null

    case 'UNKNOWN':
    default:
      logger.error(
        {
          session_key: sessionKey.substring(0, 30) + '...',
          error: sessionError.message,
        },
        '[SessionRecovery] Unknown error, cannot recover'
      )
      return null
  }
}

/**
 * Recover from 404/410 (session not found/expired)
 *
 * Strategy:
 * 1. Create new session
 * 2. Preserve user data if provided
 * 3. Update URL with new session key
 * 4. Update store
 */
async function recoverFromNotFound(
  oldSessionKey: string,
  preserveData?: Record<string, unknown>
): Promise<string | null> {
  logger.info(
    {
      old_session_key: oldSessionKey.substring(0, 30) + '...',
      hasDataToPreserve: !!preserveData,
    },
    '[SessionRecovery] Recovering from not found/expired'
  )

  try {
    // Create new session
    const newSession = await unifiedSessionAPI.create({
      type: 'valuation',
      data: preserveData || {},
    })

    logger.info(
      {
        new_session_key: newSession.session_key.substring(0, 30) + '...',
      },
      '[SessionRecovery] New session created'
    )

    // Update URL (preserve query params)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.pathname = url.pathname.replace(oldSessionKey, newSession.session_key)
      window.history.replaceState({}, '', url.toString())

      logger.debug(
        {
          old_key: oldSessionKey.substring(0, 30) + '...',
          new_key: newSession.session_key.substring(0, 30) + '...',
        },
        '[SessionRecovery] URL updated'
      )
    }

    // Update store
    useUnifiedSessionStore.getState().setSession(newSession)

    return newSession.session_key
  } catch (error) {
    logger.error(
      {
        error,
      },
      '[SessionRecovery] Failed to recover from not found'
    )
    return null
  }
}

/**
 * Recover from 403 (access denied)
 *
 * Strategy:
 * 1. Clear session from store
 * 2. Redirect to home or login
 * 3. Show error message
 */
async function recoverFromAccessDenied(sessionKey: string): Promise<string | null> {
  logger.warn(
    {
      session_key: sessionKey.substring(0, 30) + '...',
    },
    '[SessionRecovery] Access denied, clearing session'
  )

  // Clear session
  useUnifiedSessionStore.getState().clearSession()

  // Redirect to home (or login if not authenticated)
  if (typeof window !== 'undefined') {
    // Check if user is authenticated
    const { useAuthStore } = await import('./auth')
    const user = useAuthStore.getState().user

    if (user) {
      // Authenticated user - redirect to dashboard
      window.location.href = '/dashboard'
    } else {
      // Guest user - redirect to home
      window.location.href = '/'
    }
  }

  return null
}

/**
 * Attempt to recover session on page load
 *
 * Called during app initialization to handle stale sessions
 */
export async function attemptSessionRecovery(sessionKey: string): Promise<boolean> {
  logger.debug(
    {
      session_key: sessionKey.substring(0, 30) + '...',
    },
    '[SessionRecovery] Attempting session recovery'
  )

  try {
    // Try to load session
    await useUnifiedSessionStore.getState().loadSession(sessionKey)
    logger.debug('[SessionRecovery] Session loaded successfully, no recovery needed')
    return true
  } catch (error) {
    // Session load failed - attempt recovery
    const recoveredKey = await handleSessionError(error, sessionKey)

    if (recoveredKey) {
      logger.info(
        {
          new_session_key: recoveredKey.substring(0, 30) + '...',
        },
        '[SessionRecovery] Session recovered successfully'
      )
      return true
    } else {
      logger.error('[SessionRecovery] Session recovery failed')
      return false
    }
  }
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlySessionError(error: SessionError): string {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return "This session has expired. We've created a new one for you."
    case 'SESSION_EXPIRED':
      return "Your session has expired. We've created a new one for you."
    case 'ACCESS_DENIED':
      return "You don't have permission to access this session."
    case 'NETWORK_ERROR':
      return 'Network error. Please check your connection and try again.'
    case 'UNKNOWN':
    default:
      return 'Something went wrong. Please try again.'
  }
}
