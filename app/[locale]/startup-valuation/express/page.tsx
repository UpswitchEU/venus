import type { Metadata } from 'next'
import { ExpressStudioPage } from './ExpressStudioPage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

const META_BY_LOCALE = {
  en: {
    title: 'Express valuation — Upswitch · Pre-seed PDF in 90 seconds',
    description:
      'One-screen pre-seed valuation. Pick a preset, confirm a few inputs, generate ' +
      'an investor-ready PDF report.  Powered by ValuationIQ — Berkus + Scorecard + ' +
      'VC + SaaS Forward + founder pedigree multiplier, Q1 2026 Benelux benchmarks.',
  },
  nl: {
    title: 'Express waardering — Upswitch · Pre-seed PDF in 90 seconden',
    description:
      'Een-scherm pre-seed waardering. Kies een template, bevestig enkele inputs, ' +
      'genereer een investor-ready PDF.  Aangedreven door ValuationIQ — Berkus + ' +
      'Scorecard + VC + SaaS Forward + founder-pedigree multiplier, Q1 2026 benchmarks.',
  },
} as const

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  let locale: 'en' | 'nl' = 'en'
  try {
    const resolved = await params
    locale = resolved.locale === 'nl' ? 'nl' : 'en'
  } catch {
    /* default en */
  }
  const meta = META_BY_LOCALE[locale]
  return {
    title: meta.title,
    description: meta.description,
    // The Express path is opinionated UX, not a content page — keep it
    // out of search and rely on direct partner / dashboard links.
    robots: { index: false, follow: false },
  }
}

/**
 * /[locale]/startup-valuation/express
 *
 * Single-screen pre-seed valuation: left-rail form + right-rail live
 * receipt + one-click "Generate PDF report".  Time-to-PDF target: 90s.
 *
 * Always live — the rollout flag was removed once Express + the
 * AmbitionPicker + the TeamPicker landed.  Both `/startup-valuation`
 * and `/startup-valuation/express` are now part of the canonical
 * production surface.
 */
export default async function ExpressRoute({ params }: Props) {
  let locale: 'en' | 'nl' = 'en'
  try {
    const resolved = await params
    locale = resolved.locale === 'nl' ? 'nl' : 'en'
  } catch {
    /* default en */
  }

  return <ExpressStudioPage locale={locale} />
}
