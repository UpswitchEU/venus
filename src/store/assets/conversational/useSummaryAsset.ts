/**
 * Summary Asset Store (Conversational Flow)
 *
 * Manages state for data summary in conversational flow.
 * Shows collected data and completion percentage.
 * - Receive mode only: Backend provides summary
 *
 * @module store/assets/conversational/useSummaryAsset
 */

import { createAssetStore } from '../createAssetStore'

export interface SummaryData {
  collectedData: Record<string, any>
  completionPercentage: number
  generatedAt: Date
}

export const useSummaryAsset = createAssetStore<SummaryData>('Conversational:Summary', null)

// Convenience selectors
export const useSummaryCollectedData = () => useSummaryAsset((state) => state.data?.collectedData)
export const useSummaryCompletion = () =>
  useSummaryAsset((state) => state.data?.completionPercentage || 0)
export const useSummaryStatus = () => useSummaryAsset((state) => state.status)
export const useSummaryError = () => useSummaryAsset((state) => state.error)
export const useSummaryProgress = () => useSummaryAsset((state) => state.progress)
