import type { Metadata } from 'next'
import { StartupStudioPage } from './StartupStudioPage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

const META_BY_LOCALE = {
  en: {
    title: 'Startup Valuation Studio — Upswitch · Free pre-revenue valuation',
    description:
      'Get an investor-ready startup valuation in 7 minutes. Berkus + Scorecard + VC method, Q1 2026 Benelux benchmarks, no historical financials required.',
    locale: 'en_BE',
  },
  nl: {
    title: 'Startup Waarderingsmotor — Upswitch · Gratis pre-revenue valuation',
    description:
      'Een investor-ready startup waardering in 7 minuten. Berkus + Scorecard + VC-methode, Q1 2026 Benelux benchmarks, geen historische cijfers nodig.',
    locale: 'nl_BE',
  },
} as const

/**
 * SEO metadata for the Studio surface.  This route is bookmark-/share-
 * friendly (founders deep-link in from accelerator portals, the
 * `/nl/waarderen` marketing page and the `?partner=<slug>` Mercury
 * cross-link), so a clean canonical + locale-specific title/description
 * is worth the extra ten lines.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  let locale: 'en' | 'nl' = 'en'
  try {
    const resolved = await params
    locale = resolved.locale === 'nl' ? 'nl' : 'en'
  } catch {
    // ignore — default to en
  }
  const meta = META_BY_LOCALE[locale]
  const path = `/${locale}/startup-valuation`
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: path,
      languages: {
        en: '/en/startup-valuation',
        nl: '/nl/startup-valuation',
      },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: 'website',
      url: path,
      locale: meta.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
    },
    // The Studio is opinionated UX, not a content page — discourage
    // search engines from competing with the marketing page at
    // `/nl/waarderen` for "startup waardering" queries.
    robots: { index: false, follow: false },
  }
}

/**
 * /[locale]/startup-valuation
 *
 * Full-screen Startup Valuation Studio (Studio v2 wizard).  Replaces
 * the cramped left-rail in `ManualLayout` for founders running the
 * pre-revenue 9th method.
 *
 * Always live — the rollout flag (`STARTUP_STUDIO_V2_ROLLOUT_PCT`) was
 * removed once Express + the AmbitionPicker + the TeamPicker landed.
 * The legacy slider panel still auto-redirects here via
 * `StartupAwareInputPanel` for any cross-app deeplink that lands on
 * `?method=startup_valuation` so the engine path is uniform across
 * Mercury / Venus / partner integrations.
 */
export default async function StartupValuationRoute({ params }: Props) {
  let locale: 'en' | 'nl' = 'en'
  try {
    const resolved = await params
    locale = resolved.locale === 'nl' ? 'nl' : 'en'
  } catch {
    // fall back to en
  }

  return <StartupStudioPage locale={locale} />
}
