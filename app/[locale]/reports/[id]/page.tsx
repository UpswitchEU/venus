'use client'

import { use } from 'react'
import { ErrorBoundary } from '../../../../src/components/ErrorBoundary'
import { ValuationReport } from '../../../../src/components/ValuationReport'

interface ValuationReportPageProps {
  params:
    | Promise<{
        id: string
        locale: string
      }>
    | {
        id: string
        locale: string
      }
  searchParams?:
    | Promise<{
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
    | {
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
      }
}

// Note: generateMetadata removed - cannot be used in client components
// Metadata is handled via document head in ValuationReport component

/**
 * Valuation Report Page
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
 */
export default function ValuationReportPage({ params, searchParams }: ValuationReportPageProps) {
  // FIX: Call ALL hooks BEFORE any conditional throws/returns to comply with React rules of hooks
  // This ensures the same number of hooks are called on every render
  
  // Handle both Promise and plain object params (Next.js 14+ compatibility)
  const paramsPromise = params instanceof Promise ? params : Promise.resolve(params)
  const resolvedParams = use(paramsPromise)

  // Handle searchParams (optional)
  // FIX: Always call use() hook unconditionally to comply with React rules of hooks
  const searchParamsPromise = searchParams
    ? searchParams instanceof Promise
      ? searchParams
      : Promise.resolve(searchParams)
    : Promise.resolve({})
  const resolvedSearchParams = use(searchParamsPromise) as {
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
  }

  // Extract values AFTER all hooks have been called
  const { id, locale } = resolvedParams || { id: '', locale: 'en' }
  const mode: 'edit' | 'view' = resolvedSearchParams.mode || 'edit' // Default to edit mode (M&A workflow)
  const versionNumber: number | undefined = resolvedSearchParams.version
    ? parseInt(resolvedSearchParams.version)
    : undefined

  // Validate AFTER all hooks have been called
  if (!params) {
    throw new Error('Params are required')
  }

  if (!id) {
    throw new Error('Report ID is required')
  }

  return (
    <ErrorBoundary>
      <ValuationReport 
        reportId={id} 
        initialMode={mode} 
        initialVersion={versionNumber}
        // Pass through URL params for context
        urlParams={resolvedSearchParams}
      />
    </ErrorBoundary>
  )
}
