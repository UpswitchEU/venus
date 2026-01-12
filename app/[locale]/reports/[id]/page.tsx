import nextDynamic from 'next/dynamic'
import { Suspense } from 'react'

// Dynamically import the client component with no SSR
const ValuationReportClient = nextDynamic(
  () => import('./ValuationReportClient').then(mod => mod.ValuationReportClient),
  { ssr: false }
)

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

  // Return loading UI during CSR hydration
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <ValuationReportClient
        reportId={id}
        locale={locale}
        initialMode={mode}
        initialVersion={version}
        urlParams={urlParams}
      />
    </Suspense>
  )
}
