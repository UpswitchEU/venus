'use client'

import { useTranslations } from 'next-intl'
import React from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '@/hooks/useScrollLock'

interface RegenerationWarningModalProps {
  isOpen: boolean
  completedAt?: Date | string
  onConfirm: () => void
  onCancel: () => void
}

export const RegenerationWarningModal: React.FC<RegenerationWarningModalProps> = ({
  isOpen,
  completedAt,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslations('modals.regeneration')
  if (!isOpen) return null

  // Format the timestamp if available
  const formatTimestamp = (date: Date | string | undefined): string => {
    if (!date) return 'earlier'

    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      return dateObj.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return 'earlier'
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop - touch-none/overscroll-none prevent background scroll on iOS */}
      <div
        className="absolute inset-0 bg-black/70 touch-none overscroll-none"
        onClick={onCancel}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-popover border border-foreground/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-foreground/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-harvest-500/20 rounded-full flex items-center justify-center">
              <span className="text-harvest-400 text-xl">⚠️</span>
            </div>
            <h3 className="text-xl font-bold text-white">{t('overwriteTitle')}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-foreground">{t('overwriteDesc')}</p>

            {completedAt && (
              <p className="text-muted-foreground text-sm">
                {t('overwritePrevious')}{' '}
                <span className="font-medium text-foreground">{formatTimestamp(completedAt)}</span>
              </p>
            )}
          </div>

          {/* Warning Box */}
          <div className="p-4 bg-harvest-tint border border-harvest-500/30 rounded-lg space-y-2">
            <p className="text-sm font-medium text-harvest-700">⚠️ {t('overwriteCannotUndo')}</p>
            <p className="text-xs text-harvest-600/80">{t('overwriteReplace')}</p>
          </div>

          {/* Info Box */}
          <div className="p-3 bg-muted/50 rounded-lg border border-foreground/10">
            <p className="text-xs text-muted-foreground">💡 {t('overwriteTip')}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-foreground/10 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-muted hover:bg-foreground/10 text-foreground rounded-lg font-medium transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-rust-500 hover:bg-rust-600 text-white rounded-lg font-medium transition-colors"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body)
  }

  return modal
}
