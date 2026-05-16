import { useLocale } from 'next-intl'
import React from 'react'
import {
  ACCOUNTANT_PRICING,
  formatEuroAmount,
  getStarterAndProPlansLabel,
} from '../constants/pricing'

/**
 * Paywall audience selects the copy + CTA label.
 *
 * - 'advisor'        — accountant / M&A advisor: shows the Starter/Pro SaaS
 *                      pricing they themselves subscribe to (€1.490/year etc.).
 * - 'business_owner' — seller / SME founder: shows the C2B2B referral copy.
 *                      The advisor's SaaS plan is the wrong upgrade path for
 *                      them (see `.cursor/rules/plg-client-invite-loop.mdc`
 *                      and `.cursor/rules/plg-watermark-branding.mdc`).
 *                      The CTA leads to their dashboard where they can invite
 *                      an advisor.
 */
export type ValuationPaywallAudience = 'advisor' | 'business_owner'

interface ValuationPaywallModalProps {
  isOpen: boolean
  onClose: () => void
  current: number
  limit: number
  message?: string
  onUpgrade: () => void
  /** Defaults to 'advisor' to preserve existing advisor copy on legacy
   *  call-sites that haven't been migrated yet. */
  audience?: ValuationPaywallAudience
}

export const ValuationPaywallModal: React.FC<ValuationPaywallModalProps> = ({
  isOpen,
  onClose,
  current,
  limit,
  message,
  onUpgrade,
  audience = 'advisor',
}) => {
  const locale = useLocale()
  const isNl = locale === 'nl'
  const starterYear = formatEuroAmount(ACCOUNTANT_PRICING.starter.yearly, locale)
  const proYear = formatEuroAmount(ACCOUNTANT_PRICING.pro.yearly, locale)
  const starterMonth = ACCOUNTANT_PRICING.starter.monthly
  const proMonth = ACCOUNTANT_PRICING.pro.monthly

  if (!isOpen) return null

  const used = Math.min(current, limit)

  const isBusinessOwner = audience === 'business_owner'

  const defaultAdvisorCopy = isNl
    ? `Uw gratis rapporten zijn read-only met watermerk (geen PDF-download). Starter (${starterYear}/jaar of €${starterMonth}/maand) geeft u alle 9 methodes, manuele controle over elke aanpassing en rapporten zonder watermerk in uw huisstijl. Pro (${proYear}/jaar of €${proMonth}/maand) voegt live boekhoudsync toe zodat u uw klantenbestand zonder manuele invoer kunt waarderen.`
    : `Your free reports are read-only with a watermark (no PDF download). Starter (${starterYear}/year or €${starterMonth}/month) gives you all 9 methods, manual control over every adjustment, and watermark-free branded reports. Pro (${proYear}/year or €${proMonth}/month) adds live sync with your accounting software so you can value your client base without manual entry.`

  const defaultBusinessOwnerCopy = isNl
    ? `U heeft uw gratis waarderingen voor dit jaar gebruikt. Open uw dashboard om uw rapport te beheren of nodig uw boekhouder of M&A-adviseur uit — zij ontgrendelen onbeperkte waarderingen en een merkversie zonder watermerk via hun abonnement. Voor u blijft het gratis.`
    : `You've used your free valuations for this year. Open your dashboard to manage your report or invite your accountant or M&A advisor — they unlock unlimited valuations and a watermark-free branded report through their subscription. Your access stays free.`

  const upgradeButtonLabel = isBusinessOwner
    ? isNl
      ? 'Open mijn dashboard'
      : 'Open my dashboard'
    : getStarterAndProPlansLabel(locale)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-popover border border-foreground/10 rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-500"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {isNl
              ? `Je hebt ${used} van ${limit} gratis waarderingen gebruikt`
              : `You've used ${used} of ${limit} free valuations`}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {/* For business owners we always prefer the audience-correct default
                copy. Backend-supplied `message` strings (e.g. "Upgrade to
                Starter or higher for unlimited valuations") are written for
                the advisor SaaS plan and would mislead a seller into thinking
                they need to subscribe to the wrong product. */}
            {isBusinessOwner ? defaultBusinessOwnerCopy : message || defaultAdvisorCopy}
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
            {upgradeButtonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ValuationPaywallModal
