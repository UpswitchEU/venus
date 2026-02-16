/**
 * ValidationMessage Component
 *
 * Displays real-time validation feedback (errors, warnings, suggestions).
 * Supports different severity levels with appropriate styling.
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import React from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationMessageData {
  field?: string
  rule?: string
  message: string
  severity: ValidationSeverity
}

interface ValidationMessageProps {
  validation: ValidationMessageData
  className?: string
  onDismiss?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ValidationMessage: React.FC<ValidationMessageProps> = ({
  validation,
  className = '',
  onDismiss,
}) => {
  const { message, severity } = validation

  // Severity-based styling (Aurora design system)
  const severityStyles = {
    error: {
      container: 'bg-destructive/10 border-l-4 border-l-destructive text-foreground',
      icon: '❌',
      iconBg: 'bg-destructive/20',
    },
    warning: {
      container: 'bg-warning/10 border-l-4 border-l-warning text-foreground',
      icon: '⚠️',
      iconBg: 'bg-warning/20',
    },
    info: {
      container: 'bg-primary/10 border-l-4 border-l-primary text-foreground',
      icon: 'ℹ️',
      iconBg: 'bg-primary/20',
    },
  }

  const styles = severityStyles[severity]

  return (
    <div
      className={`
        flex items-start p-3 border-l-4 rounded-r-md
        ${styles.container}
        ${className}
      `}
      role="alert"
    >
      {/* Icon */}
      <div
        className={`
          flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full
          ${styles.iconBg}
        `}
      >
        <span className="text-lg">{styles.icon}</span>
      </div>

      {/* Message */}
      <div className="ml-3 flex-1">
        <p className="text-sm font-medium">{message}</p>
      </div>

      {/* Dismiss Button */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-3 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

// ============================================================================
// VALIDATION MESSAGE LIST
// ============================================================================

interface ValidationMessageListProps {
  validations: ValidationMessageData[]
  className?: string
  onDismissAll?: () => void
}

export const ValidationMessageList: React.FC<ValidationMessageListProps> = ({
  validations,
  className = '',
  onDismissAll,
}) => {
  if (validations.length === 0) return null

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header with dismiss all button */}
      {onDismissAll && validations.length > 1 && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-foreground">
            {validations.length} validation message{validations.length > 1 ? 's' : ''}
          </span>
          <button
            onClick={onDismissAll}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Dismiss all
          </button>
        </div>
      )}

      {/* Messages */}
      {validations.map((validation, index) => (
        <ValidationMessage
          key={`${validation.field}-${validation.rule}-${index}`}
          validation={validation}
        />
      ))}
    </div>
  )
}

export default ValidationMessage
