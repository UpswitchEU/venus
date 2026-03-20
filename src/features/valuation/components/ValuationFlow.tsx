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
  initialQuery?: string | null
  autoSend?: boolean
  initialMode?: 'edit' | 'view'
  initialVersion?: number
  initialTab?: 'preview' | 'history'
  urlAction?: string
  initialDrawerOpen?: boolean
  guidedResolution?: {
    spotlight?: string
    focusField?: string
    flagYear?: string
  }
}

const ManualLayout = lazy(() =>
  import('../../manual/components/ManualLayout').then((module) => ({
    default: module.ManualLayout,
  }))
)

export const ValuationFlow: React.FC<ValuationFlowProps> = ({
  reportId,
  onComplete,
  initialMode,
  initialVersion,
  initialTab = 'preview',
  urlAction,
  initialDrawerOpen = false,
  guidedResolution,
}) => {
  return (
    <ManualLayout
      reportId={reportId}
      onComplete={onComplete}
      initialVersion={initialVersion}
      initialMode={initialMode}
      initialTab={initialTab}
      urlAction={urlAction}
      initialDrawerOpen={initialDrawerOpen}
      guidedResolutionUrl={guidedResolution}
    />
  )
}
