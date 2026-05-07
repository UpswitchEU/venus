import { redirect } from 'next/navigation'
import { buildPreservedReportBootstrapQueryString } from '@/lib/cross-app/preservedReportBootstrapParams'
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
 * WORLD-CLASS: Preserves allowlisted URL parameters for bootstrap (see
 * `buildPreservedReportBootstrapQueryString` + `page.test.ts`).
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

  // Resolve search params (allowlist: `buildPreservedReportBootstrapQueryString`)
  let queryString = ''
  try {
    const sp = searchParams ? await searchParams : {}
    queryString = buildPreservedReportBootstrapQueryString(sp)
  } catch (error) {
    console.error('[NewReportPage] Failed to resolve searchParams:', error)
  }

  // Generate new report ID and redirect with locale and preserved params
  const newReportId = generateReportId()
  redirect(`/${locale}/reports/${newReportId}${queryString}`)
}
