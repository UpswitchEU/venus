/**
 * Calculator Components
 *
 * Aurora-styled calculator components for Venus.
 * Full-featured normalization, chat, history, and report system.
 * Matches Clarity Agent Suite calculator exactly.
 */

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
  ChatMessage,
  FieldContext,
  FieldUpdate,
  NormalisationSuggestion as ChatNormalisationSuggestion,
  ParsedCommand,
  ParsedValue,
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
export { FieldHelpTrigger } from './FieldHelpTrigger'
export { FilingYearPrompt } from './FilingYearPrompt'
export type { FullscreenReportModalProps } from './FullscreenReportModal'
export { FullscreenReportModal } from './FullscreenReportModal'
export type { InviteClientModalProps } from './InviteClientModal'
export { InviteClientModal } from './InviteClientModal'
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
  FieldHelpContext,
  QuickNormalizationAction,
  ValuationFormData,
  YearlyFinancials,
} from './ManualInputPanel'
// ─────────────────────────────────────────
// INPUT & FORMS
// ─────────────────────────────────────────
export { ManualInputPanel } from './ManualInputPanel'
export { ProvenanceDot } from './ProvenanceDot'
export { GuidedResolutionOrphanFields } from './GuidedResolutionOrphanFields'
export { SourceDataPanel } from './SourceDataPanel'
export { SpotlightBanner } from './SpotlightBanner'
export { SpotlightFieldWrapper } from './SpotlightFieldWrapper'
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
export type {
  Normalization,
  NormalizationEditorProps,
} from './NormalizationEditor'
export { NormalizationEditor } from './NormalizationEditor'
export type { NormalizationHubProps } from './NormalizationHub'
// ─────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────
export { NormalizationHub } from './NormalizationHub'
export { NormalizationBentoView, NormalizationTableView } from './NormalizationViews'
export { TaxLatencySection } from './TaxLatencySection'
export type {
  QuickAction,
  QuickActionsPanelProps,
} from './QuickActionsPanel'
export { QuickActionsPanel } from './QuickActionsPanel'
export type {
  LedgerAccount,
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
  NormalizationType,
  UnifiedNormalizationModalProps,
} from './UnifiedNormalizationModal'
export { UnifiedNormalizationModal } from './UnifiedNormalizationModal'
export type { ReportMetric, ValuationReportData } from './types'
export type { ValuationEditModalProps } from './ValuationEditModal'
export { ValuationEditModal } from './ValuationEditModal'
export { OmniMethodPanorama } from './omni/OmniMethodPanorama'
export type {
  VersionChange,
  VersionCompareModalProps,
} from './VersionCompareModal'
export { VersionCompareModal } from './VersionCompareModal'
