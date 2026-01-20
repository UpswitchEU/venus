/**
 * Valuation Paywall Modal
 *
 * Simple, minimal notification shown when users need to upgrade to Premium
 * Similar to Cursor/Lovable style - just a message and upgrade link
 */

import { useTranslations } from 'next-intl'
import React from 'react'

interface ValuationPaywallModalProps {
  isOpen: boolean
  onClose: () => void
  current: number
  limit: number
  message?: string
  onUpgrade: () => void
}

export const ValuationPaywallModal: React.FC<ValuationPaywallModalProps> = ({
  isOpen,
  onClose,
  current,
  limit,
  message,
  onUpgrade,
}) => {
  const t = useTranslations()
  if (!isOpen) return null

  const defaultMessage = t('modals.paywall.message', {
    limit,
    plural: limit === 1 ? '' : 's',
    defaultValue: 'Upgrade to Premium for unlimited valuations',
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full shadow-xl">
        {/* Simple Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">{t('modals.paywall.title')}</h2>
          <p className="text-zinc-400 text-sm">{message || defaultMessage}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
          >
            {t('modals.paywall.cancel')}
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {t('modals.paywall.upgrade')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ValuationPaywallModal
