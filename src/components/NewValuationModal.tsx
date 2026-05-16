/**
 * New Valuation Modal
 *
 * Confirms starting a fresh valuation when user clicks "Nieuwe Schatting".
 * Explains that the current draft will be cleared and the UI will unlock.
 * Requires explicit checkbox confirmation for destructive action.
 */

import { useTranslations } from 'next-intl'
import React, { useEffect, useState } from 'react'

interface NewValuationModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  isConfirming?: boolean
}

export const NewValuationModal: React.FC<NewValuationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  isConfirming = false,
}) => {
  const t = useTranslations('report.newValuationModal')
  const [checkboxChecked, setCheckboxChecked] = useState(false)

  // Reset checkbox when modal opens/closes
  useEffect(() => {
    if (isOpen) setCheckboxChecked(false)
  }, [isOpen])

  // Close on Escape (accountant UX parity with ExitReportConfirmationModal)
  useEffect(() => {
    if (!isOpen || isConfirming) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, isConfirming, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity touch-none overscroll-none"
        onClick={isConfirming ? undefined : onCancel}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-card rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/20 p-3">
              <svg
                className="h-8 w-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
          </div>

          {/* Content */}
          <h3 className="text-xl font-semibold text-foreground mb-2 text-center">{t('title')}</h3>

          <p className="text-muted-foreground mb-4 text-center">{t('description')}</p>

          {/* Warning Box */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
            <p className="text-sm font-semibold text-foreground mb-2">{t('warningTitle')}</p>
            <p className="text-sm text-muted-foreground mb-2">{t('warning')}</p>
            <p className="text-xs text-muted-foreground/90 italic">{t('version2Note')}</p>
          </div>

          {/* Confirmation checkbox - required for destructive action */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer group">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(e) => setCheckboxChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              {t('checkboxLabel')}
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={onCancel}
              disabled={isConfirming}
              className="flex-1 px-4 py-2 text-muted-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConfirming || !checkboxChecked}
              className="flex-1 px-4 py-2 text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:bg-primary/50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
            >
              {isConfirming ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {t('confirming')}
                </span>
              ) : (
                t('confirm')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
