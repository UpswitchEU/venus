/**
 * ReportPanel Component
 *
 * Single Responsibility: Display valuation reports in tabbed interface (Preview/Source/Info)
 * SOLID Principles: SRP - Only handles report display and tab management
 *
 * Architecture: Pure presentational component (prop-driven)
 * - No direct store access (flow-agnostic)
 * - All state passed via props from parent
 * - Shared by Manual and Conversational flows
 *
 * @module features/conversational/components/ReportPanel
 */

import React, { Suspense } from 'react'
import { AuditTrailPanel } from '../../../components/AuditTrailPanel'
import { Results } from '../../../components/results/Results'
import { ValuationInfoPanel } from '../../../components/ValuationInfoPanel'
import type { ValuationResponse } from '../../../types/valuation'

export interface ReportPanelProps {
  className?: string
  activeTab?: 'preview' | 'info' | 'history'
  onTabChange?: (tab: 'preview' | 'info' | 'history') => void
  isCalculating?: boolean
  error?: string | null
  result?: ValuationResponse | null
  reportId: string
  onClearError?: () => void // Callback to clear errors (optional)
}

/**
 * Empty State Component for Preview Tab
 */
const PreviewEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-canvas">
    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-200 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
      <svg
        className="w-6 h-6 sm:w-8 sm:h-8 text-primary-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
    <h3 className="mt-4 text-lg font-semibold text-slate-ink">Your valuation report</h3>
    <p className="mt-2 text-sm text-gray-600 max-w-sm leading-relaxed">
      Complete the conversation to generate your personalized valuation report with detailed
      insights and analysis
    </p>
  </div>
)

/**
 * Loading State Component for Preview Tab
 * Matches empty state structure exactly - same layout, spinner instead of icon
 */
const PreviewLoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-canvas">
    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-200 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
      <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
    <h3 className="mt-4 text-lg font-semibold text-slate-ink">Your valuation report</h3>
    <p className="mt-2 text-sm text-gray-600 max-w-sm leading-relaxed">
      Complete the conversation to generate your personalized valuation report with detailed
      insights and analysis
    </p>
  </div>
)

/**
 * Error State Component for Preview Tab
 * Matches empty state structure exactly - same layout, document icon (same as empty state)
 */
const PreviewErrorState: React.FC<{ error: string; onRetry?: () => void }> = ({
  error,
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-canvas">
    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-200 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
      <svg
        className="w-6 h-6 sm:w-8 sm:h-8 text-primary-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
    <h3 className="mt-4 text-lg font-semibold text-slate-ink">Your valuation report</h3>
    <p className="mt-2 text-sm text-gray-600 max-w-sm leading-relaxed">
      {error || 'An error occurred while generating your valuation report. Please try again.'}
    </p>
  </div>
)

/**
 * Empty State Component for Info Tab
 */
const InfoEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-canvas">
    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-200 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
      <svg
        className="w-6 h-6 sm:w-8 sm:h-8 text-primary-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
    <h3 className="mt-4 text-lg font-semibold text-slate-ink">Calculation breakdown</h3>
    <p className="mt-2 text-sm text-gray-600 max-w-sm leading-relaxed">
      View detailed methodology, assumptions, and step-by-step calculations used in your valuation
    </p>
  </div>
)

/**
 * Empty State Component for History Tab
 */
const HistoryEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-canvas">
    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-200 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
      <svg
        className="w-6 h-6 sm:w-8 sm:h-8 text-primary-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
    <h3 className="mt-4 text-lg font-semibold text-slate-ink">Version History</h3>
    <p className="mt-2 text-sm text-gray-600 max-w-sm leading-relaxed">
      Track changes and view previous versions of your valuation report with detailed audit trail
    </p>
  </div>
)

/**
 * ReportPanel Component
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders when props haven't changed
 */
export const ReportPanel: React.FC<ReportPanelProps> = React.memo(
  ({
    className = '',
    activeTab = 'preview',
    onTabChange,
    isCalculating = false,
    error = null,
    result = null,
    reportId,
    onClearError,
  }) => {
    const handleRetry = () => {
      // Clear the error via callback (parent handles store updates)
      if (onClearError) {
        onClearError()
      }
      // Ensure we're on the preview tab
      if (onTabChange) {
        onTabChange('preview')
      }
    }

    return (
      <div
        className={`h-full min-h-[400px] lg:min-h-0 flex flex-col bg-white overflow-hidden w-full lg:w-auto border-t lg:border-t-0 border-zinc-800 ${className}`}
      >
        <div className="flex-1 overflow-y-auto">
          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="h-full">
              {isCalculating ? (
                <PreviewLoadingState />
              ) : result?.html_report ? (
                <Suspense fallback={<PreviewLoadingState />}>
                  <Results result={result} />
                </Suspense>
              ) : error ? (
                <PreviewErrorState error={error} onRetry={handleRetry} />
              ) : (
                <PreviewEmptyState />
              )}
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="h-full">
              {isCalculating ? (
                <PreviewLoadingState />
              ) : result?.info_tab_html ? (
                <ValuationInfoPanel result={result} />
              ) : error ? (
                <PreviewErrorState error={error} onRetry={handleRetry} />
              ) : (
                <InfoEmptyState />
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="h-full">
              {isCalculating ? (
                <PreviewLoadingState />
              ) : error ? (
                <PreviewErrorState error={error} onRetry={handleRetry} />
              ) : result ? (
                <Suspense fallback={<PreviewLoadingState />}>
                  <AuditTrailPanel reportId={reportId} />
                </Suspense>
              ) : (
                <HistoryEmptyState />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
)

ReportPanel.displayName = 'ReportPanel'
