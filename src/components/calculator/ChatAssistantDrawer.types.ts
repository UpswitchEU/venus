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
  onOpenChange: (open: boolean) => void
  messages: ChatMessage[]
  onSendMessage: (
    content: string,
    attachments?: File[],
    detectedValues?: ParsedValue[],
    parsedCommands?: ParsedCommand[]
  ) => void
  isGenerating?: boolean
  companyName?: string
  fieldContext?: FieldContext
  hasReport?: boolean
  hasEbitda?: boolean
  pendingNormalizationsCount?: number
  qualityWarnings?: QualityWarning[]
  startupIssues?: StartupAssistantIssue[]
  onDismissQualityWarning?: (warningType: string) => void
  onResolveQualityWarning?: (warningType: string, prompt: string) => void
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
