import { redirect } from 'next/navigation'
import { generateReportId } from '../../../../src/utils/reportIdGenerator'

interface NewReportPageProps {
  params: Promise<{ locale: string }>
}

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * New Report Page - Creates a new report and redirects to it
 * Works across all locales (en, nl, etc.)
 */
export default async function NewReportPage({ params }: NewReportPageProps) {
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
  
  // Generate new report ID and redirect with locale
  const newReportId = generateReportId()
  redirect(`/${locale}/reports/${newReportId}`)
}
