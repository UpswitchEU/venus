'use client'

import { ChatAssistantAdvisoryPreviewCards } from './ChatAssistantAdvisoryPreviewCards'
import { ChatAssistantMarketplaceProposalCards } from './ChatAssistantMarketplaceProposalCards'
import { ChatAssistantRunProposalCards } from './ChatAssistantRunProposalCards'
import type { ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantProposalCardsProps {
  message: ChatMessage
  onApproveValuationRun?: (proposalId: string, reportId?: string) => void
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
  onSendFollowUp?: (content: string) => void
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
  onSendFollowUp,
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

      <ChatAssistantAdvisoryPreviewCards message={message} onSendFollowUp={onSendFollowUp} />

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
