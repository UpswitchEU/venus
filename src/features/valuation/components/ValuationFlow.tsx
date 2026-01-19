/**
 * ValuationFlow Component
 *
 * Unified flow component that handles both manual and conversational flows.
 * Single Responsibility: Flow routing and orchestration.
 */

'use client'

import React, { lazy, Suspense } from 'react'
import { LoadingState } from '../../../components/LoadingState'
import { GENERATION_STEPS } from '../../../components/LoadingState.constants'
import type { ValuationResponse } from '../../../types/valuation'

export type ValuationFlowType = 'manual' | 'conversational'

interface ValuationFlowProps {
  /** Unique report identifier */
  reportId: string
  /** Flow type to render */
  flowType: ValuationFlowType
  /** Callback when valuation completes */
  onComplete: (result: ValuationResponse) => void
  /** Optional initial query for conversational flow */
  initialQuery?: string | null
  /** Whether to automatically send initial query */
  autoSend?: boolean
  /** Initial mode for M&A workflow (edit/view) */
  initialMode?: 'edit' | 'view'
  /** Initial version number to load */
  initialVersion?: number
  /** Initial tab to display (for Mercury integration) */
  initialTab?: 'preview' | 'info' | 'history'
  /** URL action parameter (e.g., 'download' to trigger PDF download) */
  urlAction?: string
}

// Lazy load flow components
const ConversationalLayout = lazy(() =>
  import('../../conversational/components/ConversationalLayout').then((module) => ({
    default: module.ConversationalLayout,
  }))
)

// Manual flow component - 2-panel layout with form and report preview
const ManualLayout = lazy(() =>
  import('../../manual/components/ManualLayout').then((module) => ({
    default: module.ManualLayout,
  }))
)

/**
 * ValuationFlow Component
 *
 * Routes to appropriate flow component based on flowType prop.
 */
export const ValuationFlow: React.FC<ValuationFlowProps> = ({
  reportId,
  flowType,
  onComplete,
  initialQuery,
  autoSend = false,
  initialMode,
  initialVersion,
  initialTab = 'preview',
  urlAction,
}) => {
  if (flowType === 'conversational') {
    return (
      <Suspense fallback={<LoadingState steps={GENERATION_STEPS} variant="dark" />}>
        <ConversationalLayout
          reportId={reportId}
          onComplete={onComplete}
          initialQuery={initialQuery}
          autoSend={autoSend}
          initialVersion={initialVersion}
          initialMode={initialMode}
        />
      </Suspense>
    )
  }

  // Manual flow - render 2-panel layout with form and report preview
  // Pass initialTab and urlAction for Mercury integration (View Breakdown, Download PDF)
  return (
    <Suspense fallback={<LoadingState steps={GENERATION_STEPS} variant="dark" />}>
      <ManualLayout
        reportId={reportId}
        onComplete={onComplete}
        initialVersion={initialVersion}
        initialMode={initialMode}
        initialTab={initialTab}
        urlAction={urlAction}
      />
    </Suspense>
  )
}
