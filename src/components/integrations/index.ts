/**
 * Integrations Components Index
 *
 * Exports calculator-adjacent helpers (CSV preview/upload UI, legacy Yuki card exports).
 *
 * **Product position (ICP):** Native accounting integrations (Yuki/Exact via Titan→Hermes) are
 * first-class; Mercury owns connect/sync. CSV UI here is **assistant / normalization hints only**
 * — not Hermes MAR ingestion. See `apps/venus/docs/CSV_IMPORT_POSITIONING.md` and
 * `docs/financial-ingestion/CSV_UNIFIED_PIPELINE.md` for the future unified path if CSV-as-ingestion
 * is ever approved.
 */

export {
  CSVMappingPreview,
  type CSVMappingPreviewProps,
  type MappedAccount,
} from './CSVMappingPreview'

// CSV UI — calculator bootstrap / assistant (not Hermes ingestion)
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
