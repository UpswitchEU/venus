import React, { useEffect } from 'react'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationResponse } from '../types/valuation'
import { HTMLProcessor } from '../utils/htmlProcessor'
import { componentLogger } from '../utils/logger'
import { InfoTabSkeleton } from './skeletons/InfoTabSkeleton'

interface ValuationInfoPanelProps {
  result?: ValuationResponse | null
}

/**
 * ValuationInfoPanel - Info Tab Content
 *
 * This component renders the Info Tab using server-generated HTML.
 *
 * The server-generated HTML contains all calculation breakdowns, waterfalls, and
 * analysis in a single optimized HTML string, reducing payload size by 50-70%.
 *
 * Architecture:
 * - Server-side: Python generates complete info_tab_html with all calculation details
 * - Frontend: Renders HTML directly via dangerouslySetInnerHTML
 * - Benefits: 50-70% payload reduction, consistent rendering, single source of truth
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders when result hasn't changed
 *
 * NOTE: This component is now prop-driven (no direct store access) for flow isolation
 */
export const ValuationInfoPanel: React.FC<ValuationInfoPanelProps> = React.memo(
  ({ result: resultProp }) => {
    // ROOT CAUSE FIX: Only subscribe to primitive values, not entire session object
    const isLoading = useSessionStore((state) => state.isLoading)
    const error = useSessionStore((state) => state.error)

    // Use prop only (prop-driven component for flow isolation)
    const result = resultProp

    // ROOT CAUSE FIX: Read session data via useMemo to avoid subscription
    const infoTabHtml = React.useMemo(() => {
      const currentSession = useSessionStore.getState().session
      return currentSession?.infoTabHtml || result?.info_tab_html
    }, [result?.info_tab_html])

    // Show loading skeleton while loading
    if (isLoading && !infoTabHtml) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 font-medium">Loading info tab...</p>
          <InfoTabSkeleton />
        </div>
      )
    }

    // Show error state
    if (error) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8">
          <div className="text-center max-w-md">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-red-900 mb-2">Failed to Load Info Tab</h3>
            <p className="text-sm text-red-600 mb-4">{error}</p>
          </div>
        </div>
      )
    }

    // Early return if no result available
    if (!infoTabHtml) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Valuation Result Available
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Generate a valuation report first to see the detailed calculation breakdown.
            </p>
          </div>
        </div>
      )
    }

    // Log rendering mode for monitoring
    useEffect(() => {
      const hasServerHtml = !!(infoTabHtml && infoTabHtml.length > 0)

      if (hasServerHtml) {
        componentLogger.info('ValuationInfoPanel: Using server-generated HTML', {
          component: 'ValuationInfoPanel',
          valuationId: result?.valuation_id || 'unknown',
          htmlLength: infoTabHtml?.length || 0,
          renderingMode: 'server-html',
        })
      } else {
        componentLogger.error('ValuationInfoPanel: info_tab_html not available', {
          component: 'ValuationInfoPanel',
          valuationId: result?.valuation_id || 'unknown',
          hasInfoTabHtml: !!infoTabHtml,
          infoTabHtmlLength: infoTabHtml?.length || 0,
          resultKeys: result ? Object.keys(result) : [],
          renderingMode: 'error',
          reason: infoTabHtml ? 'HTML too short' : 'HTML not present',
        })
      }
    }, [infoTabHtml, result])

    // Server-generated HTML (required)
    if (infoTabHtml && infoTabHtml.length > 0) {
      return (
        <div
          className="h-full overflow-y-auto info-tab-html px-4 sm:px-6 lg:px-8"
          dangerouslySetInnerHTML={{ __html: HTMLProcessor.sanitize(infoTabHtml) }}
        />
      )
    }

    // Error state: info_tab_html should always be present
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Info Tab Not Available</h3>
          <p className="text-sm text-gray-600 mb-4">
            The calculation breakdown is not available. This may indicate an issue with the
            valuation response.
          </p>
          {result && (
            <div className="text-xs text-gray-500">
              <p>Valuation ID: {result.valuation_id || 'N/A'}</p>
              <p>Info Tab HTML: {result.info_tab_html ? 'Present but empty' : 'Not present'}</p>
            </div>
          )}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if result actually changed
    // Handle optional result prop
    if (!prevProps.result && !nextProps.result) return true
    if (!prevProps.result || !nextProps.result) return false
    return (
      prevProps.result.valuation_id === nextProps.result.valuation_id &&
      prevProps.result.info_tab_html === nextProps.result.info_tab_html
    )
  }
)

ValuationInfoPanel.displayName = 'ValuationInfoPanel'
