import { scrollContainerToBottom } from '@/utils/scrollContainer'
import type { ChatMessage } from './ChatAssistantTypes'

const renderableCardCollections: Array<keyof ChatMessage> = [
  'fieldUpdates',
  'normalisationSuggestions',
  'valuationRunRequests',
  'reportGenerationRequests',
  'sellabilityRunRequests',
  'ownerProfileAnswerRequests',
  'integrationConnectRequests',
  'integrationSyncRequests',
  'syncStatusPreviews',
  'ownerInviteAccountantRequests',
  'ownerReminderRequests',
  'listingVisibilityRequests',
  'shareTokenRequests',
  'shareTokenRevokeRequests',
  'valuationMethodPreferenceRequests',
  'acknowledgeWarningRequests',
  'secureCredentialRequests',
  'csvUploadRequests',
  'multiSelectRequests',
  'singleSelectRequests',
  'clientCreateRequests',
  'belgianCompanyBootstraps',
  'valuationSessionRequests',
  'clientDataReadinessPreviews',
  'importReviewRequests',
  'methodReadinessPreviews',
  'listingPreviews',
  'listingCreateRequests',
  'buyerProfilePreviews',
  'buyerReadyCards',
  'businessTypeSearchResults',
  'registrySearchResults',
  'tasks',
]

export function hasAssistantRenderableContent(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return true
  if (message.content.trim().length > 0) return true
  if (message.isError) return true

  return renderableCardCollections.some((key) => {
    const value = message[key]
    return Array.isArray(value) && value.length > 0
  })
}

export function getChatAssistantMessageRenderKey(messages: ChatMessage[]): string {
  return messages
    .map(
      (message) =>
        `${message.id}:${message.content.length}:${message.fieldUpdates?.length ?? 0}:${
          message.normalisationSuggestions?.length ?? 0
        }:${message.valuationRunRequests?.length ?? 0}:${
          message.reportGenerationRequests?.length ?? 0
        }:${message.sellabilityRunRequests?.length ?? 0}:${
          message.ownerProfileAnswerRequests?.length ?? 0
        }:${message.integrationConnectRequests?.length ?? 0}:${
          message.integrationSyncRequests?.length ?? 0
        }:${message.syncStatusPreviews?.length ?? 0}:${
          message.ownerInviteAccountantRequests?.length ?? 0
        }:${message.ownerReminderRequests?.length ?? 0}:${
          message.listingVisibilityRequests?.length ?? 0
        }:${message.shareTokenRequests?.length ?? 0}:${
          message.shareTokenRevokeRequests?.length ?? 0
        }:${message.valuationMethodPreferenceRequests?.length ?? 0}:${
          message.acknowledgeWarningRequests?.length ?? 0
        }:${
          message.secureCredentialRequests?.length ?? 0
        }:${message.csvUploadRequests?.length ?? 0}:${message.multiSelectRequests?.length ?? 0}:${
          message.singleSelectRequests?.length ?? 0
        }:${message.clientCreateRequests?.length ?? 0}:${
          message.belgianCompanyBootstraps?.length ?? 0
        }:${message.valuationSessionRequests?.length ?? 0}:${
          message.clientDataReadinessPreviews?.length ?? 0
        }:${message.importReviewRequests?.length ?? 0}:${
          message.methodReadinessPreviews?.length ?? 0
        }:${message.listingPreviews?.length ?? 0}:${
          message.listingCreateRequests?.length ?? 0
        }:${message.buyerProfilePreviews?.length ?? 0}:${message.buyerReadyCards?.length ?? 0}:${
          message.businessTypeSearchResults?.length ?? 0
        }:${message.registrySearchResults?.length ?? 0}:${message.tasks?.length ?? 0}`
    )
    .join('|')
}

type ScrollMessagesToBottomOptions = {
  force?: boolean
  stickThresholdPx?: number
}

const DEFAULT_STICK_THRESHOLD_PX = 96

function isNearScrollBottom(container: HTMLElement, thresholdPx: number): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= thresholdPx
}

/** Scroll the assistant messages panel without touching document scroll position. */
export function scrollMessagesContainerToBottom(
  container: HTMLElement | null | undefined,
  options?: ScrollMessagesToBottomOptions
): void {
  if (!container) return

  const force = options?.force ?? false
  const stickThresholdPx = options?.stickThresholdPx ?? DEFAULT_STICK_THRESHOLD_PX
  if (!force && !isNearScrollBottom(container, stickThresholdPx)) return

  scrollContainerToBottom(container)
}
