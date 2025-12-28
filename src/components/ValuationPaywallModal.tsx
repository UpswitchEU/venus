/**
 * Valuation Paywall Modal
 * 
 * Shown when free users hit their annual valuation limit
 * Prompts upgrade to Premium for unlimited valuations
 */

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
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🚀</span>
          </div>

          <h2 className="text-3xl font-bold text-white mb-3">
            Upgrade to Premium
          </h2>

          <p className="text-zinc-400 text-lg">
            {message || `You've used your ${limit} free valuation${limit === 1 ? '' : 's'} this year.`}
          </p>
        </div>

        {/* Features Comparison */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {/* Free Tier */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Free</h3>
              <span className="text-2xl font-bold text-zinc-400">€0</span>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-zinc-400">{limit} valuation{limit === 1 ? '' : 's'}/year</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-zinc-400">Basic report</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-zinc-400">Community support</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-600 mt-0.5">✗</span>
                <span className="text-zinc-600">Full normalization</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-600 mt-0.5">✗</span>
                <span className="text-zinc-600">Advanced analytics</span>
              </li>
            </ul>
          </div>

          {/* Premium Tier */}
          <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-2 border-purple-500/50 rounded-lg p-6 relative overflow-hidden">
            {/* Recommended Badge */}
            <div className="absolute top-4 right-4 bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              RECOMMENDED
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Premium</h3>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">€99</span>
                <span className="text-sm text-zinc-400">/month</span>
              </div>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-white font-medium">Unlimited valuations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-white font-medium">Full normalization & adjustments</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-white font-medium">Advanced analytics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-white font-medium">Export to Excel/CSV</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-white font-medium">24/7 priority support</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">★</span>
                <span className="text-purple-300 font-medium">2.0% success fee (vs 2.5%)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Success Fee Note */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-200 text-center">
            💡 <strong>Success Fee Discount:</strong> Premium subscribers save 0.5% on deal closures.
            <br />
            On a €500k deal, that's <strong>€2,500 savings</strong>!
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors"
          >
            Maybe Later
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            Upgrade to Premium →
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-6 pt-6 border-t border-zinc-700">
          <p className="text-xs text-zinc-500 text-center">
            ✓ Cancel anytime • ✓ Immediate access • ✓ No long-term contracts
          </p>
        </div>
      </div>
    </div>
  )
}

export default ValuationPaywallModal

