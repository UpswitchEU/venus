'use client'

/**
 * OwnerUpgradeCta — the Venus-side owner paywall surface (BET-340/341).
 *
 * The valuation stays FREE (the "Know your worth" tier). This is the proactive
 * upgrade moment shown beneath the result: a business owner sees their number for
 * free, then a value-ladder CTA — free/Know your worth → Grow your business
 * ("make your number go up", €29/mo or €299/yr) → Sell ("get exit-ready",
 * €299/yr). Venus hosts no paid owner features (those
 * live in Mercury), so the CTA routes cross-app to Mercury's owner pricing the
 * same way the Starter paywall does. Renders nothing for advisors, the top (Sell)
 * tier, or signed-out users.
 */

import { useLocale } from 'next-intl'
import { normalizeAccountantPlanTypeKey } from '@/constants/accountantPlanMethods'
import { buildManualMercuryPricingUrl } from '@/features/manual/utils/manualMercuryNavigation'
import { useAuth } from '@/lib/auth/useAuth'
import { getMercuryUrl } from '@/utils/getMercuryUrl'

export type OwnerUpgradeTier = 'grow' | 'sell'

/** Business owners are the `seller` role in Titan; advisors are accountant-side. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'seller'
}

/**
 * The next paid tier to upsell, by owner `plan_type`. Owner free ("Know your worth") is
 * `free` (or unset); `owner_grow` upsells Sell; `owner_sell`/`premium` (top) and
 * any non-owner plan upsell nothing.
 */
export function ownerNextTier(planType: string | null | undefined): OwnerUpgradeTier | null {
  const plan = normalizeAccountantPlanTypeKey(planType ?? undefined)
  if (plan === '' || plan === 'free') return 'grow'
  if (plan === 'owner_grow') return 'sell'
  return null
}

interface UpgradeCopy {
  eyebrow: string
  headline: string
  body: string
  cta: string
}

export function ownerUpgradeCopy(tier: OwnerUpgradeTier, locale: string): UpgradeCopy {
  const isNl = locale === 'nl'
  const isFr = locale === 'fr'

  if (tier === 'grow') {
    if (isNl) {
      return {
        eyebrow: 'U ziet uw waarde — gratis',
        headline: 'Laat uw waarde stijgen',
        body: 'Ontgrendel AI-acties om waarde te verhogen, de scenariosimulator en uw stappenplan naar een hogere waardering.',
        cta: 'Bekijk Grow your business — €299/jaar',
      }
    }
    if (isFr) {
      return {
        eyebrow: 'Vous voyez votre valeur — gratuitement',
        headline: 'Faites grimper votre valeur',
        body: "Débloquez les actions IA d'augmentation de valeur, le simulateur de scénarios et votre feuille de route vers une valorisation plus élevée.",
        cta: 'Découvrir Grow your business — 299 €/an',
      }
    }
    return {
      eyebrow: 'You see your number — free',
      headline: 'Make your number go up',
      body: 'Unlock AI value-up actions, the scenario simulator, and your readiness roadmap to a higher valuation.',
      cta: 'See Grow your business — €299/yr',
    }
  }

  if (isNl) {
    return {
      eyebrow: 'Klaar om over te dragen?',
      headline: 'Word verkoopklaar',
      body: 'Voeg een beveiligde dataroom, matching met gekwalificeerde kopers en dealbegeleiding tot de closing toe.',
      cta: 'Bekijk Sell — €299/jaar',
    }
  }
  if (isFr) {
    return {
      eyebrow: 'Prêt à transmettre ?',
      headline: 'Préparez votre cession',
      body: "Ajoutez une data room sécurisée, la mise en relation avec des acquéreurs qualifiés et un accompagnement jusqu'à la signature.",
      cta: 'Découvrir Sell — 299 €/an',
    }
  }
  return {
    eyebrow: 'Ready to hand it over?',
    headline: 'Get exit-ready',
    body: 'Add a secure data room, matching with qualified buyers, and deal support all the way to close.',
    cta: 'See Sell — €299/yr',
  }
}

export function OwnerUpgradeCta({ className }: { className?: string }) {
  const locale = useLocale()
  const { user } = useAuth()

  if (!user || !isOwnerRole(user.role)) return null
  const tier = ownerNextTier(user.plan_type)
  if (!tier) return null

  const copy = ownerUpgradeCopy(tier, locale)
  const ctaHref = buildManualMercuryPricingUrl({ mercuryUrl: getMercuryUrl(), locale })

  return (
    <div
      className={`mx-auto w-full max-w-3xl px-4 ${className ?? ''}`}
      data-testid="owner-upgrade-cta"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{copy.eyebrow}</p>
          <h3 className="text-lg font-semibold text-foreground">{copy.headline}</h3>
          <p className="text-sm text-foreground/70">{copy.body}</p>
        </div>
        <a
          href={ctaHref}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          data-testid="owner-upgrade-cta-link"
        >
          {copy.cta}
        </a>
      </div>
    </div>
  )
}
