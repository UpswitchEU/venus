'use client'

import React from 'react'
import { useTranslations } from 'next-intl'

interface OutOfCreditsModalProps {
  isOpen: boolean
  onClose: () => void
  onSignUp: () => void
  onTryManual: () => void
}

export const OutOfCreditsModal: React.FC<OutOfCreditsModalProps> = ({
  isOpen,
  onClose,
  onSignUp,
  onTryManual,
}) => {
  const t = useTranslations('modals.outOfCredits')
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-foreground/10 rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-destructive text-2xl">🔒</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h2>

          <p className="text-muted-foreground mb-6">{t('description')}</p>

          <div className="space-y-3">
            <button
              onClick={onSignUp}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {t('signUp')}
            </button>

            <button
              onClick={onTryManual}
              className="w-full bg-muted hover:bg-muted/80 text-foreground font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {t('tryManual')}
            </button>

            <button
              onClick={onClose}
              className="w-full text-muted-foreground hover:text-foreground font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {t('maybeLater')}
            </button>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">
              <span className="text-success">✓</span> {t('signUpFree')}
              <br />
              <span className="text-success">✓</span> {t('getMoreCredits')}
              <br />
              <span className="text-success">✓</span> {t('saveReportsForever')}
              <br />
              <span className="text-success">✓</span> {t('noCreditCard')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
