import {
  isDiscussionComplete,
  type ReviewAgenda,
  type ReviewAgendaItem,
  type ReviewItemKind,
} from './buildReviewAgenda'

export type DiscussionPhaseFlow = 'manual' | 'startup-studio'

export interface DiscussionAcknowledgementMetadata {
  key: ReviewItemKind
  acknowledged_at: string
}

export interface DiscussionPhaseMetadata {
  version: 1
  flow: DiscussionPhaseFlow
  discussion_session_key?: string
  completed_at: string
  discussion_completed_at: string
  skipped: boolean
  discussion_skipped: boolean
  skip_reason?: string
  advisor_name?: string
  advisor_user_id?: string
  advisor_discussion_notes?: string
  agenda: ReviewAgendaItem[]
  acknowledged: DiscussionAcknowledgementMetadata[]
  warnings_acknowledged: ReviewItemKind[]
  item_count: number
  high_severity_count: number
  acknowledgement_required_count: number
}

export interface BuildDiscussionPhaseMetadataParams {
  agenda: ReviewAgenda
  acknowledgedKeys: readonly ReviewItemKind[]
  notes?: string
  advisorName?: string | null
  advisorUserId?: string | null
  completedAt?: string
  skipped?: boolean
  skipReason?: string
  flow?: DiscussionPhaseFlow
  discussionSessionKey?: string | null
}

function trimmedString(value: string | null | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function cloneAgendaItem(item: ReviewAgendaItem): ReviewAgendaItem {
  return {
    kind: item.kind,
    count: item.count,
    severity: item.severity,
    ...(item.refs?.length ? { refs: [...item.refs] } : {}),
  }
}

export function buildDiscussionPhaseMetadata({
  agenda,
  acknowledgedKeys,
  notes,
  advisorName,
  advisorUserId,
  completedAt = new Date().toISOString(),
  skipped = false,
  skipReason,
  flow = 'manual',
  discussionSessionKey,
}: BuildDiscussionPhaseMetadataParams): DiscussionPhaseMetadata {
  if (!isDiscussionComplete(agenda, acknowledgedKeys, skipped)) {
    throw new Error('Discussion phase cannot be persisted before required acknowledgements.')
  }

  const acknowledgedSet = new Set(acknowledgedKeys)
  const warningsAcknowledged = agenda.acknowledgementKeys.filter((key) => acknowledgedSet.has(key))
  const acknowledged = warningsAcknowledged.map((key) => ({
    key,
    acknowledged_at: completedAt,
  }))
  const highSeverityCount = agenda.items.filter((item) => item.severity === 'high').length
  const advisorDiscussionNotes = trimmedString(notes, 4000)
  const advisorNameValue = trimmedString(advisorName, 120)
  const advisorUserIdValue = trimmedString(advisorUserId, 120)

  return {
    version: 1,
    flow,
    ...(trimmedString(discussionSessionKey, 300)
      ? { discussion_session_key: trimmedString(discussionSessionKey, 300) }
      : {}),
    completed_at: completedAt,
    discussion_completed_at: completedAt,
    skipped,
    discussion_skipped: skipped,
    ...(skipReason ? { skip_reason: skipReason } : {}),
    ...(advisorNameValue ? { advisor_name: advisorNameValue } : {}),
    ...(advisorUserIdValue ? { advisor_user_id: advisorUserIdValue } : {}),
    ...(advisorDiscussionNotes ? { advisor_discussion_notes: advisorDiscussionNotes } : {}),
    agenda: agenda.items.map(cloneAgendaItem),
    acknowledged,
    warnings_acknowledged: warningsAcknowledged,
    item_count: agenda.items.length,
    high_severity_count: highSeverityCount,
    acknowledgement_required_count: agenda.acknowledgementKeys.length,
  }
}
