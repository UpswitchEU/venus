import { ValuationReportClient } from './ValuationReportClient'

interface ValuationReportPageProps {
  params: Promise<{
    id: string
    locale: string
  }>
  searchParams?: Promise<{
    mode?: 'edit' | 'view'
    version?: string
    flow?: 'manual' | 'conversational'
    prefilledQuery?: string
    autoSend?: string
    clientToken?: string
    return_url?: string
    client_id?: string
    source?: string
    embedded?: string
  }>
}

// Force dynamic rendering - this page uses async params
export const dynamic = 'force-dynamic'

/**
 * Valuation Report Page (Server Component)
 *
 * This Server Component handles:
 * - Async params resolution
 * - Locale validation
 * - Props serialization for Client Component
 *
 * Delegates rendering to ValuationReportClient (Client Component)
 * to avoid Server Component → Client Component boundary issues.
 */
export default async function ValuationReportPage({ params, searchParams }: ValuationReportPageProps) {
  // Safely resolve params with error handling
  let resolvedParams: { id: string; locale: string }
  try {
    resolvedParams = await params
  } catch (error) {
    console.error('[ValuationReportPage] Failed to resolve params:', error)
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Report URL</h1>
          <p className="text-gray-400">Failed to load route parameters</p>
        </div>
      </div>
    )
  }

  // Safely resolve searchParams with error handling
  let resolvedSearchParams: Record<string, string> = {}
  try {
    const rawSearchParams = searchParams ? await searchParams : {}
    // Filter out undefined values to ensure proper serialization
    resolvedSearchParams = Object.entries(rawSearchParams)
      .filter(([_, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value as string }), {})
  } catch (error) {
    console.error('[ValuationReportPage] Failed to resolve searchParams:', error)
    // Non-fatal - continue with empty search params
  }

  const { id, locale } = resolvedParams

  // Validate report ID
  if (!id) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Report URL</h1>
          <p className="text-gray-400">Missing report ID</p>
        </div>
      </div>
    )
  }

  // Extract mode and version with proper defaults
  const mode: 'edit' | 'view' = resolvedSearchParams.mode as 'edit' | 'view' || 'edit'
  const versionNumber: number | undefined = resolvedSearchParams.version
    ? parseInt(resolvedSearchParams.version)
    : undefined

  // Pass serialized props to Client Component
  return (
    <ValuationReportClient
      reportId={id}
      locale={locale}
      initialMode={mode}
      initialVersion={versionNumber}
      urlParams={resolvedSearchParams}
    />
  )
}
