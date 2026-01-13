import { redirect } from 'next/navigation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * Locale Root Page - Redirects to new report
 * This is the landing page for each locale (e.g., /en, /nl)
 */
export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
  // Safely resolve params with error handling
  let locale: string
  try {
    const resolvedParams = await params
    locale = resolvedParams.locale
  } catch (error) {
    console.error('[LocaleRootPage] Failed to resolve params:', error)
    // Fallback to English
    locale = 'en'
  }

  // Redirect to new report creation
  redirect(`/${locale}/reports/new`)
}
