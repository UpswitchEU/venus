/**
 * Asset Stores - Central Export
 *
 * Component-level asset management stores for:
 * - Manual flow assets (input fields)
 * - Conversational flow assets (chat, summary, collected data)
 * - Shared assets (reports, versions, final price)
 *
 * @module store/assets
 */

export type {
  AssetActions,
  AssetMode,
  AssetState,
  AssetStatus,
  AssetStore,
} from './createAssetStore'
// Factory
export { createAssetStore } from './createAssetStore'

// Manual Flow Assets
// NOTE: Asset stores removed - use session store directly

// Conversational Flow Assets
export {
  useChatMessages,
  useChatMessagesAsset,
  useChatMessagesError,
  useChatMessagesProgress,
  useChatMessagesStatus,
  useChatSessionId,
} from './conversational/useChatMessagesAsset'
export {
  useCollectedData,
  useCollectedDataAsset,
  useCollectedDataCompletion,
  useCollectedDataError,
  useCollectedDataProgress,
  useCollectedDataStatus,
} from './conversational/useCollectedDataAsset'
export {
  useSummaryAsset,
  useSummaryCollectedData,
  useSummaryCompletion,
  useSummaryError,
  useSummaryProgress,
  useSummaryStatus,
} from './conversational/useSummaryAsset'

// Shared Assets
// NOTE: Shared asset stores removed - use session store directly

// Type exports (conversational only)
export type { ChatMessagesData } from './conversational/useChatMessagesAsset'
export type { CollectedDataInfo } from './conversational/useCollectedDataAsset'
export type { SummaryData } from './conversational/useSummaryAsset'
