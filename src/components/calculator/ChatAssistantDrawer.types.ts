import type { AssistantIntent } from '@/services/ai/local-chat-fallback'
import type { ParsedCommand, ParsedValue } from './ChatAssistantParsing'
import type {
  AgentChoiceSelection,
  ChatMessage,
  FieldContext,
  QualityWarning,
  StartupAssistantIssue,
} from './ChatAssistantTypes'

export interface PendingAssistantUpdate {
  field: string
  value: unknown
  label: string
}

export interface ChatAssistantDrawerProps {
  open: boolean
  /** Lock document scroll when drawer is open (mobile full-screen only). */
  lockScroll?: boolean
  /** Show Mercury-style FAB when the dock is closed. */
  showFabWhenClosed?: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatMessage[]
  onSendMessage: (
    content: string,
    attachments?: File[],
    detectedValues?: ParsedValue[],
    parsedCommands?: ParsedCommand[],
    assistantIntent?: AssistantIntent
  ) => void
  isGenerating?: boolean
  companyName?: string
  fieldContext?: FieldContext
  hasReport?: boolean
  hasEbitda?: boolean
  /** True only when the current plan can use live accounting integration actions. */
  integrationsEnabled?: boolean
  /** Selects the Mercury settings surface for integration-connect cards. */
  integrationAudience?: 'advisor' | 'owner'
  pendingNormalizationsCount?: number
  acceptedNormalizationsCount?: number
  hasCapBreach?: boolean
  qualityWarnings?: QualityWarning[]
  startupIssues?: StartupAssistantIssue[]
  onDismissQualityWarning?: (warningType: string) => void
  onResolveQualityWarning?: (warningType: string, prompt: string) => void
  /**
   * Inline fix for a quality warning: the user filled the warning's structured
   * fields (e.g. balance figures) and the values are written to the valuation +
   * recalculated — no chat turn. Resolves when the recalculation settles.
   */
  onInlineFixQualityWarning?: (
    warningType: string,
    values: Record<string, number>
  ) => void | Promise<void>
  /** Jump-to-control: scroll the advisor to the form control that fixes the warning. */
  onJumpToQualityWarning?: (anchor: string) => void
  onDismissStartupIssue?: (issueId: string) => void
  onResolveStartupIssue?: (issueId: string, prompt: string) => void
  onApplyStartupIssueQuickFix?: (issueId: string) => void
  onJumpToStartupIssue?: (issueId: string) => void
  onApplyFieldUpdate?: (field: string, value: unknown) => void
  pendingUpdates?: PendingAssistantUpdate[]
  onAcceptUpdate?: (field: string) => void
  onRejectUpdate?: (field: string) => void
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  onApproveValuationRun?: (proposalId: string, reportId?: string, methods?: string[] | null) => void
  onRejectValuationRun?: (proposalId: string) => void
  onApproveReportGeneration?: (proposalId: string, reportId?: string) => void
  onRejectReportGeneration?: (proposalId: string) => void
  onApproveSellabilityRun?: (proposalId: string) => void
  onRejectSellabilityRun?: (proposalId: string) => void
  onApproveListingCreate?: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null,
    visibility?: 'public' | 'private'
  ) => void
  onRejectListingCreate?: (proposalId: string) => void
  onApplyAgentChoice?: (choice: AgentChoiceSelection) => boolean | Promise<boolean>
  showQuickNormalizations?: boolean
  onCommandPillClick?: (command: string) => void
  toolInProgress?: string | null
  onRetry?: (messageId: string) => void
  onNewConversation?: () => void
}
