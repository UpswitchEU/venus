'use client'

/**
 * ValuationFlow Component
 *
 * Renders the manual valuation flow (only flow type).
 * Conversational flow has been removed.
 */

import React, { lazy } from 'react'
import type { ValuationResponse } from '../../../types/valuation'

export type ValuationFlowType = 'manual'

interface ValuationFlowProps {
  reportId: string
  flowType?: ValuationFlowType
  onComplete: (result: ValuationResponse) => void
  accountantCustomerId?: string | null
  initialQuery?: string | null
  autoSend?: boolean
  initialMode?: 'edit' | 'view'
  initialVersion?: number
  initialTab?: 'preview' | 'history'
  urlAction?: string
  initialDrawerOpen?: boolean
  initialAgentNext?: string
  initialValuationIntent?: 'start_valuation'
  guidedResolution?: {
    spotlight?: string
    focusField?: string
    flagYear?: string
  }
  /** Query param `selected_method` — seed top-bar method when no session preference yet */
  initialSelectedMethodFromUrl?: string
  /** Query param `selected_methods` — seed blended top-bar methods when no session preference yet */
  initialSelectedMethodsFromUrl?: string
}

const ManualValuationWorkspace = lazy(() =>
  import('../../manual/components/ManualValuationWorkspace').then((module) => ({
    default: module.ManualValuationWorkspace,
  }))
)

export const ValuationFlow: React.FC<ValuationFlowProps> = ({
  reportId,
  onComplete,
  accountantCustomerId,
  initialMode,
  initialVersion,
  initialTab = 'preview',
  urlAction,
  initialDrawerOpen = false,
  initialAgentNext,
  initialValuationIntent,
  guidedResolution,
  initialSelectedMethodFromUrl,
  initialSelectedMethodsFromUrl,
}) => {
  return (
    <ManualValuationWorkspace
      reportId={reportId}
      onComplete={onComplete}
      accountantCustomerId={accountantCustomerId}
      initialVersion={initialVersion}
      initialMode={initialMode}
      initialTab={initialTab}
      urlAction={urlAction}
      initialDrawerOpen={initialDrawerOpen}
      initialAgentNext={initialAgentNext}
      initialValuationIntent={initialValuationIntent}
      guidedResolutionUrl={guidedResolution}
      initialSelectedMethodFromUrl={initialSelectedMethodFromUrl}
      initialSelectedMethodsFromUrl={initialSelectedMethodsFromUrl}
    />
  )
}
