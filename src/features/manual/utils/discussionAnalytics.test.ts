import { describe, expect, it } from 'vitest'

import { buildReviewAgenda } from './buildReviewAgenda'
import { buildDiscussionAnalyticsPayload, discussionEventName } from './discussionAnalytics'

describe('discussionAnalytics', () => {
  it('builds a PII-light started/completed payload from the review agenda', () => {
    const agenda = buildReviewAgenda({
      qualityWarnings: [{ type: 'owner_dependency', severity: 'high' }],
      methodWeights: { dcf: 0.4, ebitda_multiple: 0.6 },
      acceptedNormalizationCount: 2,
    })

    expect(
      buildDiscussionAnalyticsPayload({
        agenda,
        acknowledgedKeys: ['quality_warning'],
        notes: 'Advisor entered a sensitive rationale here',
        selectedMethod: 'hybrid',
        reportId: 'valuation-123',
      })
    ).toEqual({
      source: 'manual',
      selected_method: 'hybrid',
      report_id_present: true,
      item_count: 3,
      high_severity_count: 1,
      acknowledgement_required_count: 1,
      acknowledged_count: 1,
      notes_present: true,
    })
  })

  it('falls back to non-identifying defaults', () => {
    const agenda = buildReviewAgenda({})

    expect(buildDiscussionAnalyticsPayload({ agenda })).toMatchObject({
      selected_method: 'unknown',
      report_id_present: false,
      notes_present: false,
    })
  })

  it('records skip reason without including free-text notes', () => {
    const agenda = buildReviewAgenda({ capBreachCount: 1 })

    const payload = buildDiscussionAnalyticsPayload({
      agenda,
      notes: 'Do not send this text',
      skipReason: 'advisor_accepted_all',
    })

    expect(payload.skipped_reason).toBe('advisor_accepted_all')
    expect(Object.keys(payload)).not.toContain('notes')
  })

  it('uses BET-299 PostHog event names', () => {
    expect(discussionEventName('started')).toBe('discussion.started')
    expect(discussionEventName('completed')).toBe('discussion.completed')
    expect(discussionEventName('skipped')).toBe('discussion.skipped')
  })
})
