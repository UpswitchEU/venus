'use client'

import { useTranslations } from 'next-intl'
import { ErrorFallback } from '@/components/ErrorFallback'

interface EnhancedErrorFallbackContentProps {
  error: Error
  onReset: () => void
  message: string
  recoverable: boolean
}

/**
 * Wrapper that provides translated titles for ErrorFallback.
 * Used by EnhancedErrorBoundary (class component) which cannot use hooks.
 */
export function EnhancedErrorFallbackContent({
  error,
  onReset,
  message,
  recoverable,
}: EnhancedErrorFallbackContentProps) {
  const t = useTranslations('errors.boundary')
  const title = recoverable ? t('somethingWentWrong') : t('criticalError')

  return (
    <ErrorFallback
      error={error}
      reset={onReset}
      homeHref="/"
      title={title}
      message={message}
      variant="modal"
    />
  )
}
