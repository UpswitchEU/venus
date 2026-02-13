/**
 * useConversationalToolbar Hook
 *
 * Single Responsibility: Consolidate all toolbar handlers for conversational flow.
 * Provides unified interface for toolbar actions (refresh, download, tabs, fullscreen).
 *
 * @module hooks/useConversationalToolbar
 */

import { useCallback } from 'react'
import { RefreshService } from '../services/toolbar/refreshService'
import UrlGeneratorService from '../services/urlGenerator'
import { useConversationalResultsStore } from '../store/conversational'
import { generateReportId } from '../utils/reportIdGenerator'
import {
  useValuationToolbarDownload,
  useValuationToolbarFullscreen,
  useValuationToolbarRefresh,
  useValuationToolbarTabs,
} from './valuationToolbar'

export interface UseConversationalToolbarOptions {
  /** Current report ID */
  reportId: string
  /** Restoration hook for resetting conversation */
  restoration: {
    reset: () => void
  }
  /** Conversation actions */
  actions: {
    setMessages: (messages: any[]) => void
    setValuationResult: (result: any) => void
    setGenerating: (generating: boolean) => void
    setError: (error: string | null) => void
    setRestored: (restored: boolean) => void
    setInitialized: (initialized: boolean) => void
  }
  /** Conversation state */
  state: {
    businessProfile?: {
      company_name?: string
    } | null
  }
  /** Current valuation result */
  result: any
}

export interface UseConversationalToolbarReturn {
  // Toolbar state
  activeTab: 'preview' | 'info'
  isFullScreen: boolean
  isDownloading: boolean

  // Toolbar actions
  handleRefresh: () => void
  handleDownload: () => Promise<void>
  handleTabChange: (tab: 'preview' | 'info' | 'history') => void
  handleOpenFullscreen: () => void
  handleCloseFullscreen: () => void
}

/**
 * Consolidated toolbar handlers for conversational flow
 *
 * Provides:
 * - Refresh: Resets conversation and navigates to new report
 * - Download: Generates PDF from current valuation
 * - Tabs: Switches between preview/info views
 * - Fullscreen: Opens/closes fullscreen mode
 *
 * @param options - Configuration options
 * @returns Toolbar state and handlers
 *
 * @example
 * ```typescript
 * const toolbar = useConversationalToolbar({
 *   reportId: 'val_123',
 *   restoration,
 *   actions,
 *   state,
 *   result
 * })
 *
 * return (
 *   <ValuationToolbar
 *     onRefresh={toolbar.handleRefresh}
 *     onDownload={toolbar.handleDownload}
 *     activeTab={toolbar.activeTab}
 *     onTabChange={toolbar.handleTabChange}
 *   />
 * )
 * ```
 */
export function useConversationalToolbar({
  reportId,
  restoration,
  actions,
  state,
  result,
}: UseConversationalToolbarOptions): UseConversationalToolbarReturn {
  // Base toolbar hooks
  const { handleRefresh: handleHookRefresh } = useValuationToolbarRefresh()
  const { handleDownload: handleHookDownload, isDownloading } = useValuationToolbarDownload()
  const {
    isFullScreen,
    handleOpenFullscreen: handleHookOpenFullscreen,
    handleCloseFullscreen: handleHookCloseFullscreen,
  } = useValuationToolbarFullscreen()
  const { activeTab, handleTabChange: handleHookTabChange } = useValuationToolbarTabs({
    initialTab: 'preview',
  })

  /**
   * Refresh handler - resets conversation and navigates to new report
   *
   * Actions:
   * 1. Reset restoration state
   * 2. Clear all conversation data
   * 3. Generate new report ID
   * 4. Navigate to new report
   */
  const handleRefresh = useCallback(() => {
    // Reset conversation state
    restoration.reset()
    actions.setMessages([])
    actions.setValuationResult(null)
    actions.setGenerating(false)
    actions.setError(null)
    actions.setRestored(false)
    actions.setInitialized(false)

    // Generate new report ID and navigate
    const newReportId = generateReportId()
    RefreshService.navigateTo(UrlGeneratorService.reportById(newReportId))
    handleHookRefresh()
  }, [restoration, actions, handleHookRefresh])

  /**
   * Download handler - generates PDF from current valuation
   *
   * Requires:
   * - Valid valuation result with html_report
   *
   * Extracts:
   * - Company name from business profile or result
   * - Valuation amount (mid-point equity value)
   * - Methodology and confidence score
   */
  const handleDownload = useCallback(async () => {
    const currentResult = result || useConversationalResultsStore.getState().result
    if (currentResult?.html_report) {
      await handleHookDownload({
        companyName: state.businessProfile?.company_name || currentResult.company_name || 'Company',
        valuationAmount: currentResult.equity_value_mid,
        valuationDate: new Date(),
        method: currentResult.methodology || 'DCF Analysis',
        confidenceScore: currentResult.confidence_score,
        htmlContent: currentResult.html_report,
      })
    }
  }, [result, state.businessProfile, handleHookDownload])

  return {
    // Toolbar state
    activeTab: activeTab as 'preview' | 'info',
    isFullScreen,
    isDownloading,

    // Toolbar actions
    handleRefresh,
    handleDownload,
    handleTabChange: (tab: 'preview' | 'info' | 'history') => handleHookTabChange(tab),
    handleOpenFullscreen: handleHookOpenFullscreen,
    handleCloseFullscreen: handleHookCloseFullscreen,
  }
}
