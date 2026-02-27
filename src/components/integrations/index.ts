/**
 * Integrations Components Index
 *
 * Exports all integration-related components for accounting software imports.
 * Bootstrap-optimized: CSV upload flow instead of full API integration.
 * Direct API integrations planned for 2025.
 */

export {
  CSVMappingPreview,
  type CSVMappingPreviewProps,
  type MappedAccount,
} from './CSVMappingPreview'

// CSV Upload Components (Bootstrap-optimized)
export {
  CSVUploadCard,
  type CSVUploadCardProps,
  type ParsedCSVData,
} from './CSVUploadCard'
// Primary CSV Import Components
export {
  CSVImportCard,
  type CSVImportCardProps,
  type ImportStatus,
  ImportStatusBadge,
  ManualInputFallback,
  type MappingRow,
  MappingTable,
  NormalisationReviewPanel,
  type NormalisationReviewProps,
  type SuggestedNormalisation,
  SyncStatusBadge,
  // Legacy exports for backward compatibility
  YukiConnectCard,
  type YukiConnectCardProps,
  type YukiConnectionStatus,
} from './YukiIntegration'
