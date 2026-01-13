/**
 * Auth Status Component
 *
 * Displays authentication status with loading states, success indicators,
 * and user-friendly error messages
 */

import React from 'react'
import { useAuth } from '../lib/auth'

export const AuthStatus: React.FC = () => {
  const { user, isAuthenticated, loading, error, refreshAuth } = useAuth()

  if (loading) {
    return (
      <div className="auth-status auth-status-loading" role="status" aria-live="polite">
        <div className="auth-status-skeleton">
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
        <span className="sr-only">Checking authentication...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="auth-status auth-status-error" role="alert">
        <div className="auth-status-icon error">⚠️</div>
        <div className="auth-status-content">
          <p className="auth-status-message">Unable to verify authentication</p>
          <button
            onClick={() => (window.location.href = 'https://upswitch.app')}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            Log in at upswitch.app
          </button>
        </div>
      </div>
    )
  }

  if (isAuthenticated && user) {
    return (
      <div className="auth-status auth-status-success" role="status">
        <div className="auth-status-icon success">✅</div>
        <div className="auth-status-content">
          <p className="auth-status-message">
            Authenticated as {user.email || user.name || 'User'}
          </p>
        </div>
      </div>
    )
  }

  // Guest mode - simplified
  return (
    <div className="auth-status auth-status-guest" role="status">
      <div className="auth-status-content">
        <p className="auth-status-message">Continuing as guest</p>
        <p
          className="auth-status-hint"
          style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}
        >
          💡{' '}
          <a
            href="https://upswitch.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'underline' }}
          >
            Log in at upswitch.app
          </a>{' '}
          for full access
        </p>
      </div>
    </div>
  )
}

/**
 * Auth Loading Indicator
 * Simple loading spinner for auth operations
 */
export const AuthLoadingIndicator: React.FC<{ message?: string }> = ({
  message = 'Authenticating...',
}) => {
  return (
    <div className="auth-loading-indicator" role="status" aria-live="polite">
      <div className="auth-spinner" aria-hidden="true" />
      <span className="auth-loading-message">{message}</span>
      <span className="sr-only">{message}</span>
    </div>
  )
}

/**
 * Auth Error Message
 * User-friendly error display with retry option
 */
export const AuthErrorMessage: React.FC<{ error: string; onRetry?: () => void }> = ({
  error,
  onRetry,
}) => {
  return (
    <div className="auth-error-message" role="alert">
      <div className="auth-error-icon">⚠️</div>
      <div className="auth-error-content">
        <p className="auth-error-text">{error}</p>
        {onRetry && (
          <button className="auth-error-retry" onClick={onRetry} aria-label="Retry authentication">
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}
