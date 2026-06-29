'use client'

import { useMemo } from 'react'
import {
  ClientCreateCard,
  ImportReviewCard,
  ValuationSessionCard,
} from './agent-action-cards/client-review-cards'
import {
  CsvUploadCard,
  MultiSelectCard,
  SecureCredentialCard,
  SingleSelectCard,
} from './agent-action-cards/form-choice-cards'
import {
  ListingFieldUpdateCard,
  ListingVisibilityCard,
  NormalizationDismissCard,
  ShareTokenCard,
  ShareTokenRevokeCard,
  ValuationMethodPreferenceCard,
} from './agent-action-cards/listing-action-cards'
import {
  IntegrationCard,
  IntegrationSyncCard,
  OwnerInviteAccountantCard,
  OwnerProfileCard,
  OwnerReminderCard,
  SyncStatusPreviewCard,
} from './agent-action-cards/owner-integration-cards'
import { AgentActionCardProvider } from './agent-action-cards/shared'
import {
  AcknowledgeWarningCard,
  BulkValuationRunCard,
  ValuationDefaultsCard,
  ValuationDefaultsPreviewCard,
  WorkspaceClientsPreviewCard,
} from './agent-action-cards/workflow-preview-cards'
import type { AgentChoiceSelection, ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantAgentActionCardsProps {
  message: ChatMessage
  onApplyAgentChoice?: (choice: AgentChoiceSelection) => boolean | Promise<boolean>
  onSendFollowUp?: (content: string) => void
  integrationsEnabled?: boolean
}

export function ChatAssistantAgentActionCards({
  message,
  onApplyAgentChoice,
  onSendFollowUp,
  integrationsEnabled = false,
}: ChatAssistantAgentActionCardsProps) {
  const hasCards = useMemo(
    () =>
      Boolean(
        (message.ownerProfileAnswerRequests?.length ?? 0) > 0 ||
          (message.integrationConnectRequests?.length ?? 0) > 0 ||
          (message.integrationSyncRequests?.length ?? 0) > 0 ||
          (message.syncStatusPreviews?.length ?? 0) > 0 ||
          (message.ownerInviteAccountantRequests?.length ?? 0) > 0 ||
          (message.ownerReminderRequests?.length ?? 0) > 0 ||
          (message.listingVisibilityRequests?.length ?? 0) > 0 ||
          (message.shareTokenRequests?.length ?? 0) > 0 ||
          (message.shareTokenRevokeRequests?.length ?? 0) > 0 ||
          (message.valuationMethodPreferenceRequests?.length ?? 0) > 0 ||
          (message.bulkValuationRunRequests?.length ?? 0) > 0 ||
          (message.listingFieldUpdateRequests?.length ?? 0) > 0 ||
          (message.normalizationDismissRequests?.length ?? 0) > 0 ||
          (message.valuationDefaultsRequests?.length ?? 0) > 0 ||
          (message.valuationDefaultsPreviews?.length ?? 0) > 0 ||
          (message.workspaceClientsPreviews?.length ?? 0) > 0 ||
          (message.acknowledgeWarningRequests?.length ?? 0) > 0 ||
          (message.secureCredentialRequests?.length ?? 0) > 0 ||
          (message.csvUploadRequests?.length ?? 0) > 0 ||
          (message.multiSelectRequests?.length ?? 0) > 0 ||
          (message.singleSelectRequests?.length ?? 0) > 0 ||
          (message.clientCreateRequests?.length ?? 0) > 0 ||
          (message.valuationSessionRequests?.length ?? 0) > 0 ||
          (message.importReviewRequests?.length ?? 0) > 0
      ),
    [message]
  )

  if (!hasCards) return null

  return (
    <AgentActionCardProvider onSendFollowUp={onSendFollowUp}>
      <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-2">
        {message.ownerProfileAnswerRequests?.map((request) => (
          <OwnerProfileCard key={request.id} request={request} />
        ))}
        {message.integrationConnectRequests?.map((request) => (
          <IntegrationCard
            key={request.id}
            request={request}
            integrationsEnabled={integrationsEnabled}
          />
        ))}
        {message.integrationSyncRequests?.map((request) => (
          <IntegrationSyncCard
            key={request.id}
            request={request}
            integrationsEnabled={integrationsEnabled}
          />
        ))}
        {message.syncStatusPreviews?.map((preview) => (
          <SyncStatusPreviewCard key={preview.id} preview={preview} />
        ))}
        {message.ownerInviteAccountantRequests?.map((request) => (
          <OwnerInviteAccountantCard key={request.id} request={request} />
        ))}
        {message.ownerReminderRequests?.map((request) => (
          <OwnerReminderCard key={request.id} request={request} />
        ))}
        {message.listingVisibilityRequests?.map((request) => (
          <ListingVisibilityCard key={request.id} request={request} />
        ))}
        {message.shareTokenRequests?.map((request) => (
          <ShareTokenCard key={request.id} request={request} />
        ))}
        {message.shareTokenRevokeRequests?.map((request) => (
          <ShareTokenRevokeCard key={request.id} request={request} />
        ))}
        {message.valuationMethodPreferenceRequests?.map((request) => (
          <ValuationMethodPreferenceCard key={request.id} request={request} />
        ))}
        {message.bulkValuationRunRequests?.map((request) => (
          <BulkValuationRunCard key={request.id} request={request} />
        ))}
        {message.listingFieldUpdateRequests?.map((request) => (
          <ListingFieldUpdateCard key={request.id} request={request} />
        ))}
        {message.normalizationDismissRequests?.map((request) => (
          <NormalizationDismissCard key={request.id} request={request} />
        ))}
        {message.workspaceClientsPreviews?.map((preview) => (
          <WorkspaceClientsPreviewCard key={preview.id} preview={preview} />
        ))}
        {message.valuationDefaultsRequests?.map((request) => (
          <ValuationDefaultsCard key={request.id} request={request} />
        ))}
        {message.valuationDefaultsPreviews?.map((preview) => (
          <ValuationDefaultsPreviewCard key={preview.id} preview={preview} />
        ))}
        {message.acknowledgeWarningRequests?.map((request) => (
          <AcknowledgeWarningCard key={request.id} request={request} />
        ))}
        {message.secureCredentialRequests?.map((request) => (
          <SecureCredentialCard
            key={request.id}
            request={request}
            integrationsEnabled={integrationsEnabled}
          />
        ))}
        {message.csvUploadRequests?.map((request) => (
          <CsvUploadCard key={request.id} request={request} />
        ))}
        {message.multiSelectRequests?.map((request) => (
          <MultiSelectCard
            key={request.id}
            request={request}
            onApplyAgentChoice={onApplyAgentChoice}
          />
        ))}
        {message.singleSelectRequests?.map((request) => (
          <SingleSelectCard
            key={request.id}
            request={request}
            onApplyAgentChoice={onApplyAgentChoice}
          />
        ))}
        {message.clientCreateRequests?.map((request) => (
          <ClientCreateCard key={request.id} request={request} />
        ))}
        {message.valuationSessionRequests?.map((request) => (
          <ValuationSessionCard key={request.id} request={request} />
        ))}
        {message.importReviewRequests?.map((request) => (
          <ImportReviewCard key={request.id} request={request} />
        ))}
      </div>
    </AgentActionCardProvider>
  )
}
