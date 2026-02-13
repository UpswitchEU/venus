/**
 * ConversationalValuationFlow Component
 *
 * Main orchestrator for conversational AI-assisted valuation workflow.
 * Single Responsibility: Feature orchestration and state management setup.
 *
 * @module features/conversational/components/ConversationalValuationFlow
 */

import React from 'react'
import { FeatureErrorBoundary } from '../../../features/shared/components/ErrorBoundary'
import type { ValuationResponse } from '../../../types/valuation'
import { ConversationProvider } from '../context/ConversationContext'
import { ConversationalLayout } from './ConversationalLayout'

interface ConversationalValuationFlowProps {
  reportId: string
  onComplete: (result: ValuationResponse) => void
  initialQuery?: string | null
  autoSend?: boolean
}

/**
 * Conversational Valuation Flow - Main Orchestrator
 *
 * Single Responsibility: Feature orchestration and context setup.
 * Delegates all UI logic to ConversationalLayout component.
 *
 * Frontend is minimal: only collects data and displays final results from backend.
 */
export const ConversationalValuationFlow: React.FC<ConversationalValuationFlowProps> = ({
  reportId,
  onComplete,
  initialQuery = null,
  autoSend = false,
}) => {
  return (
    <FeatureErrorBoundary feature="conversational">
      <ConversationProvider initialSessionId={reportId}>
        <ConversationalLayout
          reportId={reportId}
          onComplete={onComplete}
          initialQuery={initialQuery}
          autoSend={autoSend}
        />
      </ConversationProvider>
    </FeatureErrorBoundary>
  )
}
