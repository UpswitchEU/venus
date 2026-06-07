import { describe, expect, it } from 'vitest'
import { buildReviewAgenda } from './buildReviewAgenda'
import { buildDiscussionPhaseMetadata } from './discussionPhaseMetadata'

describe('buildDiscussionPhaseMetadata', () => {
  it('persists acknowledgements, notes, advisor attribution, and agenda summary', () => {
    const agenda = buildReviewAgenda({
      qualityWarnings: [{ type: 'owner_dependency', severity: 'high' }],
      methodWeights: { dcf: 0.5, ebitda_multiple: 0.5 },
    })

    const metadata = buildDiscussionPhaseMetadata({
      agenda,
      acknowledgedKeys: ['quality_warning'],
      notes: 'Discussed range defensibility with the client.',
      advisorName: 'Ada Advisor',
      advisorUserId: 'user-123',
      completedAt: '2026-06-07T10:00:00.000Z',
      discussionSessionKey: 'report-1:manual:quality_warning',
    })

    expect(metadata).toMatchObject({
      version: 1,
      flow: 'manual',
      discussion_session_key: 'report-1:manual:quality_warning',
      completed_at: '2026-06-07T10:00:00.000Z',
      discussion_completed_at: '2026-06-07T10:00:00.000Z',
      skipped: false,
      discussion_skipped: false,
      advisor_name: 'Ada Advisor',
      advisor_user_id: 'user-123',
      advisor_discussion_notes: 'Discussed range defensibility with the client.',
      item_count: 2,
      high_severity_count: 1,
      acknowledgement_required_count: 1,
      warnings_acknowledged: ['quality_warning'],
    })
    expect(metadata.acknowledged).toEqual([
      { key: 'quality_warning', acknowledged_at: '2026-06-07T10:00:00.000Z' },
    ])
    expect(metadata.agenda[0].refs).toEqual(['owner_dependency'])
  })

  it('refuses to persist an unresolved high-severity agenda', () => {
    const agenda = buildReviewAgenda({ capBreachCount: 1 })

    expect(() =>
      buildDiscussionPhaseMetadata({
        agenda,
        acknowledgedKeys: [],
        completedAt: '2026-06-07T10:00:00.000Z',
      })
    ).toThrow('Discussion phase cannot be persisted')
  })

  it('persists an explicit accept-all skip with reason', () => {
    const agenda = buildReviewAgenda({ capBreachCount: 1 })

    const metadata = buildDiscussionPhaseMetadata({
      agenda,
      acknowledgedKeys: [],
      skipped: true,
      skipReason: 'advisor_accepted_all',
      completedAt: '2026-06-07T10:00:00.000Z',
      flow: 'startup-studio',
    })

    expect(metadata).toMatchObject({
      flow: 'startup-studio',
      skipped: true,
      discussion_skipped: true,
      skip_reason: 'advisor_accepted_all',
      completed_at: '2026-06-07T10:00:00.000Z',
    })
  })
})
