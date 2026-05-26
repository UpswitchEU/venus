/**
 * Calculator Components
 *
 * Aurora-styled calculator components for Venus.
 * Full-featured normalization, chat, history, and report system.
 * Matches Clarity Agent Suite calculator exactly.
 */

export { isValuationActiveWorkspacePath } from './advisorLifecycleWorkspace'
export type { CalculationBreakdownModalProps } from './CalculationBreakdownModal'
export { CalculationBreakdownModal } from './CalculationBreakdownModal'
export type { CalculationBreakdownPanelProps } from './CalculationBreakdownPanel'
export { CalculationBreakdownPanel } from './CalculationBreakdownPanel'
export type {
  CalculatorNavProps,
  DownloadHistoryItem,
  RecentValuation,
  RightPanelView,
  ValuationVersion,
} from './CalculatorNav'
export { CalculatorNav } from './CalculatorNav'
// ─────────────────────────────────────────
// NAVIGATION & LAYOUT
// ─────────────────────────────────────────
export { CalculatorShellSkeleton } from './CalculatorShellSkeleton'
// Chat-specific NormalisationSuggestion (different from modal's version)
export type {
  AgentChoiceSelection,
  ChatMessage,
  FieldContext,
  FieldUpdate,
  NormalisationSuggestion as ChatNormalisationSuggestion,
  ParsedCommand,
  ParsedValue,
  QualityWarning,
  StartupAssistantIssue,
} from './ChatAssistantDrawer'
// ─────────────────────────────────────────
// CHAT & AI
// ─────────────────────────────────────────
export {
  ChatAssistantDrawer,
  parseFinancialValues,
  parseNormalizationCommands,
} from './ChatAssistantDrawer'
export type {
  ChatInputPanelProps,
  CollectedData,
} from './ChatInputPanel'
export { ChatInputPanel } from './ChatInputPanel'
export type {
  ClientApprovalStatus,
  ContextBarProps,
} from './ContextBar'
export { ContextBar } from './ContextBar'
export type { CurrencyInputProps } from './CurrencyInput'
export { CurrencyInput } from './CurrencyInput'
export type {
  DataCompletenessRingProps,
  DataField,
} from './DataCompletenessRing'
export { DataCompletenessRing } from './DataCompletenessRing'
export type { FieldHelpContext } from './FieldHelpTrigger'
export { FieldHelpTrigger } from './FieldHelpTrigger'
export { FilingYearPrompt } from './FilingYearPrompt'
export type { FullscreenReportModalProps } from './FullscreenReportModal'
export { FullscreenReportModal } from './FullscreenReportModal'
export type {
  HistoryPanelProps,
  HistoryVersion,
  ReportLike,
} from './HistoryPanel'
// ─────────────────────────────────────────
// HISTORY & VERSIONING
// ─────────────────────────────────────────
export { HistoryPanel } from './HistoryPanel'
export type { IntegrationStepPanelProps } from './IntegrationStepPanel'
export { IntegrationStepPanel } from './IntegrationStepPanel'
export type {
  ManualValuationFormData,
  ValuationFormData,
  YearlyFinancials,
} from './ManualInputPanel'
// ─────────────────────────────────────────
// INPUT & FORMS
// ─────────────────────────────────────────
export { ManualInputPanel } from './ManualInputPanel'
export type {
  NormalisationReviewStepProps,
  SuggestedNormalisation,
} from './NormalisationReviewStep'
export { NormalisationReviewStep } from './NormalisationReviewStep'
export type {
  NormalisationSuggestion,
  NormalisationSuggestionModalProps,
} from './NormalisationSuggestionModal'
export { NormalisationSuggestionModal } from './NormalisationSuggestionModal'
export type { NormalizationHubProps } from './NormalizationHub'
// ─────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────
export { NormalizationHub } from './NormalizationHub'
export { NormalizationBentoView, NormalizationTableView } from './NormalizationViews'
export { OmniMethodPanorama } from './omni/OmniMethodPanorama'
export { TaxLatencySection } from './TaxLatencySection'
export type { ReportMetric, ValuationReportData } from './types'
export type {
  LedgerAccount,
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
  NormalizationType,
  UnifiedNormalizationModalProps,
} from './UnifiedNormalizationModal'
export {
  isImportedLedgerNormalizationItem,
  UnifiedNormalizationModal,
} from './UnifiedNormalizationModal'
export type { ValuationEditModalProps } from './ValuationEditModal'
export { ValuationEditModal } from './ValuationEditModal'
export type {
  VersionChange,
  VersionCompareModalProps,
} from './VersionCompareModal'
export { VersionCompareModal } from './VersionCompareModal'
