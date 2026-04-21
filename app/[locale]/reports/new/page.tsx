import { redirect } from 'next/navigation'
import { generateReportId } from '../../../../src/utils/reportIdGenerator'

interface NewReportPageProps {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * New Report Page - Creates a new report and redirects to it
 * Works across all locales (en, nl, etc.)
 *
 * WORLD-CLASS: Preserves URL parameters for bootstrap prefill:
 * - prefilledQuery: Company name for KBO lookup
 * - clientToken: Accountant flow token
 * - flow: Preferred flow type (manual/conversational)
 * - source: Source app for return navigation
 */
export default async function NewReportPage({ params, searchParams }: NewReportPageProps) {
  // Safely resolve params with error handling
  let locale: string
  try {
    const resolvedParams = await params
    locale = resolvedParams.locale
  } catch (error) {
    console.error('[NewReportPage] Failed to resolve params:', error)
    // Fallback to English
    locale = 'en'
  }

  // Resolve search params
  let queryString = ''
  try {
    const sp = searchParams ? await searchParams : {}
    const preservedParams: string[] = []

    // Preserve important parameters for bootstrap. ANY param read by the
    // report client (`/reports/{id}`) MUST appear in this list — otherwise it
    // is silently stripped by the redirect below and the prefill is lost.
    // When adding a new query param to the cross-app contract, add it here
    // and add a regression test under
    // `apps/venus/app/[locale]/reports/new/page.test.ts`.
    const paramsToPreserve = [
      'prefilledQuery',
      'clientToken',
      'clientId', // Accountant flow: relationship ID for client context
      'flow',
      'mode',
      'source',
      'return_url',
      'guestSessionId',
      'embedded',
      // Guided resolution (Mercury → Venus)
      'drawer',
      'spotlight',
      'focusField',
      'flagYear',
      // Upfront method preference (Mercury calculator → new session)
      'selected_method',
      // Founder dashboard CTA: pre-selects the segmented control on the
      // startup wizard so the founder lands on the correct stage.
      'startup_stage',
      // Anonymized benchmark opt-out: `0` disables the post-completion
      // multiples submission. Read on the report page itself, so it must
      // survive the redirect.
      'benchmark_contribution',
      // Optional surface controls — `?action=download` triggers PDF download
      // after report load, `?tab=...` selects an initial tab. Mercury rarely
      // sends these on `/reports/new` but preserving them is forward-safe.
      'action',
      'tab',
      // Studio v2 attribution — `?partner=<slug>` tags the run with a
      // co-branded partner (imec.istart, Start it @KBC, …) so analytics
      // and the partner dashboard at /partners/<slug> can attribute it.
      'partner',
    ]

    for (const param of paramsToPreserve) {
      const value = sp[param]
      if (value) {
        const strValue = Array.isArray(value) ? value[0] : value
        if (strValue) {
          preservedParams.push(`${param}=${encodeURIComponent(strValue)}`)
        }
      }
    }

    if (preservedParams.length > 0) {
      queryString = '?' + preservedParams.join('&')
    }
  } catch (error) {
    console.error('[NewReportPage] Failed to resolve searchParams:', error)
  }

  // Generate new report ID and redirect with locale and preserved params
  const newReportId = generateReportId()
  redirect(`/${locale}/reports/${newReportId}${queryString}`)
}
