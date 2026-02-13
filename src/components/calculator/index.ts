/**
 * Calculator Components
 * 
 * Aurora-styled calculator components for Venus.
 * Full-featured normalization, chat, history, and report system.
 * Matches Clarity Agent Suite calculator exactly.
 */

// ─────────────────────────────────────────
// NAVIGATION & LAYOUT
// ─────────────────────────────────────────
export { CalculatorNav } from './CalculatorNav';
export type { 
  CalculatorNavProps, 
  RightPanelView, 
  RecentValuation, 
  ValuationVersion,
  DownloadHistoryItem,
} from './CalculatorNav';

export { ContextBar } from './ContextBar';
export type { 
  ContextBarProps, 
  ClientApprovalStatus,
} from './ContextBar';

// ─────────────────────────────────────────
// INPUT & FORMS
// ─────────────────────────────────────────
export { ManualInputPanel } from './ManualInputPanel';
export type { 
  ValuationFormData,
  YearlyFinancials,
  FieldHelpContext,
  QuickNormalizationAction,
} from './ManualInputPanel';

export { CurrencyInput } from './CurrencyInput';
export type { CurrencyInputProps } from './CurrencyInput';

export { FieldHelpTrigger } from './FieldHelpTrigger';

export { IntegrationStepPanel } from './IntegrationStepPanel';
export type { 
  IntegrationStepPanelProps, 
} from './IntegrationStepPanel';

export { DataCompletenessRing } from './DataCompletenessRing';
export type { 
  DataCompletenessRingProps, 
  DataField,
} from './DataCompletenessRing';

// ─────────────────────────────────────────
// REPORT & VALUATION
// ─────────────────────────────────────────
export { ValuationReportPanel } from './ValuationReportPanel';
export type { 
  ValuationReportPanelProps, 
  ValuationReportData,
  ReportMetric,
  ReportStatus,
} from './ValuationReportPanel';

export { ReportPreviewPanel } from './ReportPreviewPanel';
export type { ReportPreviewPanelProps } from './ReportPreviewPanel';

export { CalculationBreakdownPanel } from './CalculationBreakdownPanel';
export type { CalculationBreakdownPanelProps } from './CalculationBreakdownPanel';

export { CalculationBreakdownModal } from './CalculationBreakdownModal';
export type { CalculationBreakdownModalProps } from './CalculationBreakdownModal';

export { FullscreenReportModal } from './FullscreenReportModal';
export type { FullscreenReportModalProps } from './FullscreenReportModal';

// ─────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────
export { NormalizationHub } from './NormalizationHub';
export type { NormalizationHubProps } from './NormalizationHub';

export { UnifiedNormalizationModal } from './UnifiedNormalizationModal';
export type { 
  UnifiedNormalizationModalProps,
  LedgerAccount,
  NormalizationType,
  NormalizationStatus,
  NormalizationItem,
  NormalizationSource,
} from './UnifiedNormalizationModal';

export { NormalizationTableView, NormalizationBentoView } from './NormalizationViews';

export { NormalizationEditor } from './NormalizationEditor';
export type { 
  NormalizationEditorProps,
  Normalization,
} from './NormalizationEditor';

export { NormalisationReviewStep } from './NormalisationReviewStep';
export type { 
  NormalisationReviewStepProps, 
  SuggestedNormalisation,
} from './NormalisationReviewStep';

export { NormalisationSuggestionModal } from './NormalisationSuggestionModal';
export type { 
  NormalisationSuggestionModalProps,
  NormalisationSuggestion,
} from './NormalisationSuggestionModal';

export { QuickActionsPanel } from './QuickActionsPanel';
export type { 
  QuickActionsPanelProps, 
  QuickAction,
} from './QuickActionsPanel';

// ─────────────────────────────────────────
// HISTORY & VERSIONING
// ─────────────────────────────────────────
export { HistoryPanel } from './HistoryPanel';
export type { 
  HistoryPanelProps, 
  HistoryVersion,
  ReportLike,
} from './HistoryPanel';

export { VersionCompareModal } from './VersionCompareModal';
export type { 
  VersionCompareModalProps,
  VersionChange,
} from './VersionCompareModal';

// ─────────────────────────────────────────
// CHAT & AI
// ─────────────────────────────────────────
export { ChatAssistantDrawer } from './ChatAssistantDrawer';
export type { 
  ChatMessage,
  FieldContext,
  FieldUpdate,
  ParsedValue,
  ParsedCommand,
} from './ChatAssistantDrawer';
// Chat-specific NormalisationSuggestion (different from modal's version)
export type { NormalisationSuggestion as ChatNormalisationSuggestion } from './ChatAssistantDrawer';
export { parseNormalizationCommands, parseFinancialValues } from './ChatAssistantDrawer';

export { ChatInputPanel } from './ChatInputPanel';
export type { 
  ChatInputPanelProps, 
  CollectedData,
} from './ChatInputPanel';
