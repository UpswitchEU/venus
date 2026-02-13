/**
 * Collected Data Asset Store (Conversational Flow)
 *
 * Manages state for data collected during conversation.
 * - Send/Receive mode: Data flows both ways during conversation
 *
 * @module store/assets/conversational/useCollectedDataAsset
 */

import { createAssetStore } from '../createAssetStore'

export interface CollectedDataInfo {
  data: Record<string, any>
  completionPercentage: number
  lastUpdated: Date
  reportId: string
}

export const useCollectedDataAsset = createAssetStore<CollectedDataInfo>(
  'Conversational:CollectedData',
  null
)

// Convenience selectors
export const useCollectedData = () => useCollectedDataAsset((state) => state.data?.data)
export const useCollectedDataCompletion = () =>
  useCollectedDataAsset((state) => state.data?.completionPercentage || 0)
export const useCollectedDataStatus = () => useCollectedDataAsset((state) => state.status)
export const useCollectedDataError = () => useCollectedDataAsset((state) => state.error)
export const useCollectedDataProgress = () => useCollectedDataAsset((state) => state.progress)
