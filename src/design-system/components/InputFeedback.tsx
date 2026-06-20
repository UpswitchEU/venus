import * as React from 'react'

export interface InputFeedbackProps {
  error?: string
  errorId?: string
  hasError: boolean
  helpText?: string
  helpTextPlacement?: 'tooltip' | 'below'
}

export function InputFeedback({
  error,
  errorId,
  hasError,
  helpText,
  helpTextPlacement = 'below',
}: InputFeedbackProps) {
  return (
    <>
      {helpText && helpTextPlacement === 'below' && !hasError && (
        <p className="text-xs text-foreground/50 mt-2 leading-relaxed">{helpText}</p>
      )}

      {hasError && (
        <p
          className="mt-1 text-sm text-destructive flex items-start gap-1.5"
          id={errorId}
          role="alert"
          aria-live="polite"
        >
          <span className="w-1 h-1 rounded-full bg-destructive inline-block mt-1.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </>
  )
}
