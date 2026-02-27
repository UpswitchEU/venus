'use client'

import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React from 'react'
import { AuroraButton, GlassCard } from '@/design-system'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  onBack?: () => void
  className?: string
  variant?: 'light' | 'dark'
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  onRetry,
  onBack,
  className = '',
  variant = 'dark',
}) => {
  const t = useTranslations('errors.errorState')
  const displayTitle = title ?? t('generationFailed')
  const displayMessage = message ?? t('generationFailedDesc')
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 sm:p-8 text-center animate-in fade-in duration-500 ${className}`}
    >
      <GlassCard
        variant="default"
        glow="none"
        hover={false}
        className="max-w-md w-full text-center"
      >
        <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="w-6 h-6 text-destructive/70" aria-hidden />
        </div>

        <h3 className="text-xl font-semibold mb-2 text-foreground">{displayTitle}</h3>

        <p className="text-sm max-w-md leading-relaxed mb-6 text-muted-foreground">
          {displayMessage}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onBack && (
            <AuroraButton
              onClick={onBack}
              variant="ghost"
              size="lg"
              className="flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('goBack')}
            </AuroraButton>
          )}

          {onRetry && (
            <AuroraButton
              onClick={onRetry}
              variant="destructive"
              size="lg"
              className="flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {t('tryAgain')}
            </AuroraButton>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
