import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import React from 'react'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  onBack?: () => void
  className?: string
  variant?: 'light' | 'dark'
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Valuation Generation Failed',
  message = 'We encountered an unexpected issue while generating your report. Please check your inputs and try again.',
  onRetry,
  onBack,
  className = '',
  variant = 'dark',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 sm:p-8 text-center animate-in fade-in duration-500 ${className}`}
    >
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-3 sm:mb-4 transition-colors bg-destructive/10">
        <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-destructive" />
      </div>

      <h3 className="text-base sm:text-lg font-semibold mb-2 text-foreground">
        {title}
      </h3>

      <p className="text-xs sm:text-sm max-w-md leading-relaxed mb-6 text-muted-foreground">
        {message}
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all text-foreground bg-card border border-foreground/10 hover:bg-muted hover:text-foreground hover:border-primary/30"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        )}

        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-destructive-foreground rounded-lg shadow-sm hover:shadow-md transition-all bg-destructive hover:bg-destructive/90"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}
