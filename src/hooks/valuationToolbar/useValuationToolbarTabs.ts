/**
 * Valuation Toolbar Tabs Hook
 *
 * Single Responsibility: Handle tab switching logic for ValuationToolbar
 * SOLID Principles: SRP - Only handles tab state management
 *
 * @module hooks/valuationToolbar/useValuationToolbarTabs
 */

import { useCallback, useState } from 'react'

export type ValuationTab = 'preview' | 'history'

export interface UseValuationToolbarTabsReturn {
  activeTab: ValuationTab
  handleTabChange: (tab: ValuationTab) => void
}

export interface UseValuationToolbarTabsOptions {
  initialTab?: ValuationTab
  onTabChange?: (tab: ValuationTab) => void
}

/**
 * Hook for managing tab switching in ValuationToolbar
 *
 * @param options - Configuration options for tab management
 * @returns Tab state and change handler
 */
export const useValuationToolbarTabs = (
  options: UseValuationToolbarTabsOptions = {}
): UseValuationToolbarTabsReturn => {
  const { initialTab = 'preview', onTabChange } = options

  const [activeTab, setActiveTab] = useState<ValuationTab>(initialTab)

  const handleTabChange = useCallback(
    (tab: ValuationTab) => {
      setActiveTab(tab)
      onTabChange?.(tab)
    },
    [onTabChange]
  )

  return {
    activeTab,
    handleTabChange,
  }
}
