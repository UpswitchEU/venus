/**
 * Anonymous startup landing — full-form wizard before signup.
 *
 * The classical flow asked founders to sign up first, then fill the
 * Venus startup wizard authenticated.  This route flips it: anyone can
 * land on ``/[locale]/landing/startup``, fill out every section
 * (Berkus / Scorecard / Founder pedigree / Traction / Exit story /
 * Round simulator), and only on the final "Generate my report" CTA do
 * we route them to Mercury signup.  After signup they bounce back to
 * Venus's authenticated ``/reports/new`` with the entire wizard state
 * pre-loaded — they see the report on the right rail without typing
 * anything twice.
 *
 * Architecture note:
 *   - Mercury (Next 16 / React 19 / Zustand 5) and Venus (Next 14 /
 *     React 18 / Zustand 4) cannot share component code at the import
 *     boundary — the version drift breaks runtime.  Hosting the
 *     landing inside Venus is therefore the only "no-duplication"
 *     answer that's actually viable: the same files Venus uses
 *     authenticated render here too.
 *   - Mercury's marketing site links/redirects users here.  Wintercircus
 *     keeps its lite KBO+email capture for paid-traffic conversion
 *     experiments; this surface is the long-form conversion path.
 *
 * Auth boundary:
 *   - Venus middleware only auth-gates ``/reports/[id]`` (excluding
 *     ``new``).  Every other path is anonymous, so this route falls
 *     through with no middleware change required.
 *   - The right-rail report is intentionally NOT rendered here — the
 *     teaser tells the founder "sign up to view your full report"
 *     because the Python engine + PDF rendering is auth-gated by
 *     business choice, not just by build constraints.
 */

import type { Metadata } from 'next'
import type { Locale } from '../../../../i18n'
import { loadLocaleMessages } from '@/lib/i18n/loadLocaleMessages'
import { LandingStartupContent } from './LandingStartupContent'

interface PageProps {
  params: Promise<{ locale: string }>
}

function pickLocale(raw: string): Locale {
  return raw === 'nl' ? 'nl' : 'en'
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = pickLocale(raw)
  const messages = await loadLocaleMessages(locale)
  const landing = (messages as { startupStudio?: { landing?: { meta?: { title: string; description: string } } } })
    .startupStudio?.landing
  const meta = landing?.meta ?? {
    title: 'Startup Valuation | Upswitch',
    description: 'Startup valuation wizard.',
  }

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `/${locale}/landing/startup`,
      languages: {
        en: '/en/landing/startup',
        nl: '/nl/landing/startup',
      },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: 'website',
      url: `/${locale}/landing/startup`,
    },
    // Surface is meant for the conversion funnel — keep duplicate-content
    // away from the indexable content surface at /[locale]/startup-valuation.
    robots: { index: false, follow: false },
  }
}

export const dynamic = 'force-dynamic'

export default async function LandingStartupPage({ params }: PageProps) {
  await params
  return <LandingStartupContent />
}
