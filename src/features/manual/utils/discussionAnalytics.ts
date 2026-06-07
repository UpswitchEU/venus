import type { ReviewAgenda, ReviewItemKind } from './buildReviewAgenda'

export type DiscussionEventKind = 'started' | 'completed' | 'skipped'
export type DiscussionAnalyticsSource = 'manual' | 'startup-studio'

export interface DiscussionAnalyticsInput {
  agenda: ReviewAgenda
  acknowledgedKeys?: readonly ReviewItemKind[]
  notes?: string
  selectedMethod?: string | null
  reportId?: string | null
  skipReason?: string
  source?: DiscussionAnalyticsSource
}

export interface DiscussionAnalyticsPayload {
  source: DiscussionAnalyticsSource
  selected_method: string
  report_id_present: boolean
  item_count: number
  high_severity_count: number
  acknowledgement_required_count: number
  acknowledged_count: number
  notes_present: boolean
  skipped_reason?: string
}

export function buildDiscussionAnalyticsPayload(
  input: DiscussionAnalyticsInput
): DiscussionAnalyticsPayload {
  const acknowledged = new Set(input.acknowledgedKeys ?? [])
  const highSeverityCount = input.agenda.items.filter((item) => item.severity === 'high').length

  return {
    source: input.source ?? 'manual',
    selected_method: input.selectedMethod || 'unknown',
    report_id_present: Boolean(input.reportId),
    item_count: input.agenda.items.length,
    high_severity_count: highSeverityCount,
    acknowledgement_required_count: input.agenda.acknowledgementKeys.length,
    acknowledged_count: input.agenda.acknowledgementKeys.filter((key) => acknowledged.has(key))
      .length,
    notes_present: Boolean(input.notes?.trim()),
    ...(input.skipReason ? { skipped_reason: input.skipReason } : {}),
  }
}

export function discussionEventName(kind: DiscussionEventKind): string {
  return `discussion.${kind}`
}
