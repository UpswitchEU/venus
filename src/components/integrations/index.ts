/**
 * Integrations Components Index
 * 
 * Exports all integration-related components for accounting software imports.
 * Bootstrap-optimized: CSV upload flow instead of full API integration.
 * Direct API integrations planned for 2025.
 */

// Primary CSV Import Components
export {
  CSVImportCard,
  ImportStatusBadge,
  NormalisationReviewPanel,
  MappingTable,
  ManualInputFallback,
  // Legacy exports for backward compatibility
  YukiConnectCard,
  SyncStatusBadge,
  type ImportStatus,
  type CSVImportCardProps,
  type YukiConnectionStatus,
  type SuggestedNormalisation,
  type YukiConnectCardProps,
  type NormalisationReviewProps,
  type MappingRow,
} from './YukiIntegration';

// CSV Upload Components (Bootstrap-optimized)
export {
  CSVUploadCard,
  type ParsedCSVData,
  type CSVUploadCardProps,
} from './CSVUploadCard';

export {
  CSVMappingPreview,
  type MappedAccount,
  type CSVMappingPreviewProps,
} from './CSVMappingPreview';
