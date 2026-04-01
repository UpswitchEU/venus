import { useLocale } from 'next-intl'
import React from 'react'
import {
  ACCOUNTANT_PRICING,
  getStarterAndProPlansLabel,
} from '../constants/pricing'

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
  const locale = useLocale()
  const isNl = locale === 'nl'
  if (!isOpen) return null

  const used = Math.min(current, limit)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-popover border border-foreground/10 rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {isNl
              ? `Je hebt ${used} van ${limit} gratis waarderingen gebruikt`
              : `You've used ${used} of ${limit} free valuations`}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {message || (isNl
              ? `Upgrade naar Starter (€${ACCOUNTANT_PRICING.starter.monthly}/maand of €${ACCOUNTANT_PRICING.starter.yearly}/jaar) voor onbeperkte waarderingen, alle 9 methodes en professionele rapporten in je huisstijl. Pro (€${ACCOUNTANT_PRICING.pro.monthly}/maand of €${ACCOUNTANT_PRICING.pro.yearly}/jaar) voegt live boekhoudintegraties toe.`
              : `Upgrade to Starter (€${ACCOUNTANT_PRICING.starter.monthly}/month or €${ACCOUNTANT_PRICING.starter.yearly}/year) for unlimited valuations, all 9 methods, and branded reports. Pro (€${ACCOUNTANT_PRICING.pro.monthly}/month or €${ACCOUNTANT_PRICING.pro.yearly}/year) adds live accounting integrations.`)}
          </p>
        </div>

        {/* Usage indicator */}
        <div className="mb-6 px-3">
          <div className="w-full h-2 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.min((used / limit) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            {isNl ? `${used}/${limit} gebruikt dit jaar` : `${used}/${limit} used this year`}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-muted hover:bg-foreground/10 text-foreground text-sm font-medium rounded-lg transition-colors"
          >
            {isNl ? 'Sluiten' : 'Close'}
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors"
          >
            {getStarterAndProPlansLabel(locale)}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ValuationPaywallModal
