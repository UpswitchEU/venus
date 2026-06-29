'use client'

import { ChatAssistantAdvisoryPreviewCards } from './ChatAssistantAdvisoryPreviewCards'
import { ChatAssistantAgentActionCards } from './ChatAssistantAgentActionCards'
import { ChatAssistantBuyerReadyCards } from './ChatAssistantBuyerReadyCards'
import { ChatAssistantMarketplaceProposalCards } from './ChatAssistantMarketplaceProposalCards'
import { ChatAssistantRunProposalCards } from './ChatAssistantRunProposalCards'
import type { AgentChoiceSelection, ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantProposalCardsProps {
  message: ChatMessage
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
  onSendFollowUp?: (content: string) => void
  integrationsEnabled?: boolean
}

export function ChatAssistantProposalCards({
  message,
  onApproveValuationRun,
  onRejectValuationRun,
  onApproveReportGeneration,
  onRejectReportGeneration,
  onApproveSellabilityRun,
  onRejectSellabilityRun,
  onApproveListingCreate,
  onRejectListingCreate,
  onApplyAgentChoice,
  onSendFollowUp,
  integrationsEnabled = false,
}: ChatAssistantProposalCardsProps) {
  return (
    <>
      <ChatAssistantRunProposalCards
        message={message}
        onApproveValuationRun={onApproveValuationRun}
        onRejectValuationRun={onRejectValuationRun}
        onApproveReportGeneration={onApproveReportGeneration}
        onRejectReportGeneration={onRejectReportGeneration}
      />

      <ChatAssistantAgentActionCards
        message={message}
        onApplyAgentChoice={onApplyAgentChoice}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled={integrationsEnabled}
      />

      <ChatAssistantAdvisoryPreviewCards
        message={message}
        onSendFollowUp={onSendFollowUp}
        integrationsEnabled={integrationsEnabled}
      />

      <ChatAssistantBuyerReadyCards message={message} onSendFollowUp={onSendFollowUp} />

      <ChatAssistantMarketplaceProposalCards
        message={message}
        onApproveSellabilityRun={onApproveSellabilityRun}
        onRejectSellabilityRun={onRejectSellabilityRun}
        onApproveListingCreate={onApproveListingCreate}
        onRejectListingCreate={onRejectListingCreate}
      />
    </>
  )
}
