import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const META_BY_LOCALE = {
  en: {
    title: 'Startup Valuation — Upswitch · Free pre-revenue valuation',
    description:
      'Get an investor-ready startup valuation. Berkus + Scorecard + VC method, Q1 2026 Benelux benchmarks, no historical financials required.',
    locale: 'en_BE',
  },
  nl: {
    title: 'Startup Waardering — Upswitch · Gratis pre-revenue valuation',
    description:
      'Een investor-ready startup waardering. Berkus + Scorecard + VC-methode, Q1 2026 Benelux benchmarks, geen historische cijfers nodig.',
    locale: 'nl_BE',
  },
} as const

/**
 * SEO metadata for the (now-redirecting) startup entry point.  Kept so
 * partner deep-links and the marketing site at `/nl/waarderen` continue
 * to land here, get a clean canonical, and then bounce into the unified
 * `/reports/{id}` surface where ValuationIQ runs the valuation.
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
    // The Studio is opinionated UX, not a content page.
    robots: { index: false, follow: false },
  }
}

/**
 * /[locale]/startup-valuation
 *
 * Thin redirect to the canonical valuation surface
 * `/[locale]/reports/new?selected_method=startup_valuation`.  ValuationIQ
 * generates the report + PDF on that surface — same pipeline the
 * SME methods (DCF, SaaS, NAV, Adaptive) use — so we keep a single
 * shell, a single submit path, and a single set of right-rail
 * affordances (PDF download, share link, version history).
 *
 * Query parameters that the cross-app contract honours
 * (`?prefilledQuery=…`, `?startup_stage=…`, `?partner=…`,
 * `?clientToken=…`, `?source=…`, etc.) are passed through verbatim and
 * preserved by `/reports/new`'s param allowlist for the downstream
 * report client to read.
 */
export default async function StartupValuationRoute({ params, searchParams }: Props) {
  let locale: 'en' | 'nl' = 'en'
  try {
    const resolved = await params
    locale = resolved.locale === 'nl' ? 'nl' : 'en'
  } catch {
    // fall back to en
  }

  const sp = searchParams ? await searchParams : {}
  const qs = new URLSearchParams()
  qs.set('selected_method', 'startup_valuation')
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue
    const value = Array.isArray(v) ? v[0] : v
    if (typeof value === 'string' && value.length > 0) {
      qs.set(k, value)
    }
  }
  // Always preserve the canonical method routing — even if the inbound
  // URL already carried `selected_method`, the param above wins.
  qs.set('selected_method', 'startup_valuation')

  redirect(`/${locale}/reports/new?${qs.toString()}`)
}
