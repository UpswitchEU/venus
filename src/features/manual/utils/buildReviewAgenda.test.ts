import { describe, expect, it } from 'vitest'
import { buildReviewAgenda, isDiscussionComplete } from './buildReviewAgenda'

describe('buildReviewAgenda', () => {
  it('returns an empty, non-gating agenda when there are no signals', () => {
    const agenda = buildReviewAgenda({})
    expect(agenda.items).toEqual([])
    expect(agenda.acknowledgementKeys).toEqual([])
    expect(agenda.requiresReview).toBe(false)
  })

  it('adds a quality-warning item carrying the worst severity + refs', () => {
    const agenda = buildReviewAgenda({
      qualityWarnings: [
        { type: 'sector_missing', severity: 'medium' },
        { type: 'low_revenue_base', severity: 'high' },
        { type: 'info_only', severity: 'info' },
        { type: 'cap_table_note', severity: 'medium' },
      ],
    })
    const item = agenda.items.find((i) => i.kind === 'quality_warning')
    expect(item).toMatchObject({ count: 4, severity: 'high' })
    expect(item?.refs).toEqual(['low_revenue_base', 'sector_missing', 'cap_table_note'])
    // high-severity → gates the lock
    expect(agenda.acknowledgementKeys).toContain('quality_warning')
    expect(agenda.requiresReview).toBe(true)
  })

  it('normalizes engine severity aliases (critical/block → high, warn → medium)', () => {
    expect(
      buildReviewAgenda({ qualityWarnings: [{ severity: 'critical' }] }).items[0].severity
    ).toBe('high')
    expect(buildReviewAgenda({ qualityWarnings: [{ severity: 'warn' }] }).items[0].severity).toBe(
      'medium'
    )
    expect(
      buildReviewAgenda({ qualityWarnings: [{ severity: 'whatever' }] }).items[0].severity
    ).toBe('info')
  })

  it('flags method mix only when more than one method carries weight', () => {
    expect(
      buildReviewAgenda({ methodWeights: { dcf: 1 } }).items.find((i) => i.kind === 'method_mix')
    ).toBeUndefined()
    const mix = buildReviewAgenda({
      methodWeights: { dcf: 0.4, ebitda_multiple: 0.6, revenue_multiple: 0 },
    }).items.find((i) => i.kind === 'method_mix')
    expect(mix).toMatchObject({ count: 2, severity: 'info' })
    expect(mix?.refs).toEqual(['dcf', 'ebitda_multiple'])
  })

  it('treats method mix + normalizations as informational (non-gating)', () => {
    const agenda = buildReviewAgenda({
      methodWeights: { dcf: 0.5, ebitda_multiple: 0.5 },
      acceptedNormalizationCount: 3,
    })
    expect(agenda.items.map((i) => i.kind).sort()).toEqual(['method_mix', 'normalization'])
    expect(agenda.requiresReview).toBe(false)
    expect(agenda.acknowledgementKeys).toEqual([])
  })

  it('treats a cap breach as a high-severity gate', () => {
    const agenda = buildReviewAgenda({ capBreachCount: 1 })
    expect(agenda.acknowledgementKeys).toEqual(['cap_breach'])
    expect(agenda.requiresReview).toBe(true)
  })
})

describe('isDiscussionComplete', () => {
  const agenda = buildReviewAgenda({
    qualityWarnings: [{ type: 'x', severity: 'high' }],
    capBreachCount: 1,
  })

  it('requires every high-severity key to be acknowledged', () => {
    expect(isDiscussionComplete(agenda, ['quality_warning'], false)).toBe(false)
    expect(isDiscussionComplete(agenda, ['quality_warning', 'cap_breach'], false)).toBe(true)
  })

  it('passes immediately when explicitly skipped', () => {
    expect(isDiscussionComplete(agenda, [], true)).toBe(true)
  })

  it('passes when there is nothing to acknowledge', () => {
    const informational = buildReviewAgenda({ acceptedNormalizationCount: 2 })
    expect(isDiscussionComplete(informational, [], false)).toBe(true)
  })
})
