import { notFound } from 'next/navigation'
import { isStartupStudioV2RouteEnabled } from '../../../src/config/features'
import { StartupStudioPage } from './StartupStudioPage'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

/**
 * /[locale]/startup-valuation
 *
 * Full-screen Startup Valuation Studio (Studio v2 wizard).  Replaces
 * the cramped left-rail in `ManualLayout` for founders running the
 * pre-revenue 9th method.
 *
 * Gated behind `isStartupStudioV2RouteEnabled()` — the ROUTE-level
 * check that returns `true` whenever any rollout exists (global hard-
 * flag OR `STARTUP_STUDIO_V2_ROLLOUT_PCT > 0`).  Per-visitor bucketing
 * runs client-side via `isStartupStudioV2Enabled()` and decides who
 * gets *redirected* here from the legacy panel — a deeplink to this
 * URL must always work the moment the rollout starts so partners and
 * QA can preview without flipping their bucket.
 */
export default async function StartupValuationRoute({ params }: Props) {
  if (!isStartupStudioV2RouteEnabled()) notFound()

  let locale: 'en' | 'nl' = 'en'
  try {
    const resolved = await params
    locale = resolved.locale === 'nl' ? 'nl' : 'en'
  } catch {
    // fall back to en
  }

  return <StartupStudioPage locale={locale} />
}
