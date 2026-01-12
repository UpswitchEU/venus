import { ValuationReport } from '../../../../src/components/ValuationReport'

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

// Force dynamic rendering - this page uses async params which are only available at request time
export const dynamic = 'force-dynamic'

/**
 * Valuation Report Page (Server Component)
 *
 * World-Class URL State Management:
 * - Preserves query parameters (mode, version, flow) in URL
 * - Supports browser back/forward navigation
 * - Updates URL when switching versions/flows
 *
 * Supports M&A workflow with multiple modes:
 * - Edit mode (default): Editable form for adjustments and regeneration
 * - View mode: Static report view
 * - Version selection: Load specific version (v1, v2, v3...)
 *
 * Query params:
 * - ?mode=edit|view (default: edit for always-editable UX)
 * - ?version=N (load specific version, default: latest)
 * - ?flow=manual|conversational (existing flow selection)
 * - ?prefilledQuery=Restaurant (existing prefill)
 * - ?clientToken=... (for accountant client context)
 * - ?return_url=... (for navigation back to Mercury)
 * - ?client_id=... (for client context)
 * - ?source=... (for tracking)
 * - ?embedded=true (for iframe embedding)
 *
 * FIX: Server Component - cannot wrap Client Components (ErrorBoundary) around it
 * Error boundaries are handled at app-level (app/error.tsx and app/[locale]/reports/[id]/error.tsx)
 */
export default async function ValuationReportPage({ params, searchParams }: ValuationReportPageProps) {
  // Server Components can await params directly with error handling
  let resolvedParams: { id: string; locale: string }
  let resolvedSearchParams: Record<string, string | undefined> = {}

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

  try {
    resolvedSearchParams = searchParams ? await searchParams : {}
  } catch (error) {
    console.error('[ValuationReportPage] Failed to resolve searchParams:', error)
    // Non-fatal - continue with empty search params
  }

  // Extract values
  const { id, locale } = resolvedParams
  const mode: 'edit' | 'view' = resolvedSearchParams.mode as 'edit' | 'view' || 'edit'
  const versionNumber: number | undefined = resolvedSearchParams.version
    ? parseInt(resolvedSearchParams.version)
    : undefined

  // Validate - return error UI instead of throwing
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

  // ValuationReport is a Client Component - it can have its own error boundaries internally
  return (
    <ValuationReport 
      reportId={id} 
      initialMode={mode} 
      initialVersion={versionNumber}
      urlParams={resolvedSearchParams}
    />
  )
}
