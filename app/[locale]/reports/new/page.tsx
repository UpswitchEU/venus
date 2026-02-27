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

    // Preserve important parameters for bootstrap
    const paramsToPreserve = [
      'prefilledQuery',
      'clientToken',
      'flow',
      'mode',
      'source',
      'return_url',
      'guestSessionId',
      'embedded',
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
