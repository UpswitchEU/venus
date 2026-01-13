import nextDynamic from 'next/dynamic'

// Dynamically import the client component with no SSR
// ssr: false means it only renders on the client, so no Suspense needed
// Use default import to avoid "Cannot access .then on server" error
const ValuationReportClient = nextDynamic(() => import('./ValuationReportClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  ),
})

interface PageProps {
  params: Promise<{
    id: string
    locale: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Disable static generation
export const dynamicParams = true

/**
 * Valuation Report Page - Ultra-minimal Server Component
 *
 * This uses dynamic imports with ssr: false to completely bypass
 * Server Component rendering of the ValuationReport component.
 */
export default async function Page({ params, searchParams }: PageProps) {
  let id = ''
  let locale = 'en'
  let mode: 'edit' | 'view' = 'edit'
  let version: number | undefined
  let urlParams: Record<string, string> = {}

  // Resolve params safely
  try {
    const p = await params
    id = p.id
    locale = p.locale
  } catch (e) {
    console.error('[Page] params error:', e)
  }

  // Resolve searchParams safely
  try {
    const sp = searchParams ? await searchParams : {}
    // Convert to plain object with string values only
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === 'string') {
        urlParams[key] = value
      } else if (Array.isArray(value) && value.length > 0) {
        urlParams[key] = value[0]
      }
    }

    mode = (urlParams.mode as 'edit' | 'view') || 'edit'
    version = urlParams.version ? parseInt(urlParams.version) : undefined
  } catch (e) {
    console.error('[Page] searchParams error:', e)
  }

  // Return error UI if no ID
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

  // Return component - loading handled by dynamic import
  // CRITICAL: Only pass defined props to avoid serialization issues
  const clientProps: {
    reportId: string
    locale: string
    initialMode: 'edit' | 'view'
    initialVersion?: number
    urlParams: Record<string, string>
  } = {
    reportId: id,
    locale: locale,
    initialMode: mode,
    urlParams: urlParams,
  }

  // Only include initialVersion if it's defined (not undefined)
  if (version !== undefined && !isNaN(version)) {
    clientProps.initialVersion = version
  }

  return <ValuationReportClient {...clientProps} />
}
