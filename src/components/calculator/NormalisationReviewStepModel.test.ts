import { describe, expect, it } from 'vitest'
import type { LedgerAccount } from '../../constants/grootboek'
import type { SuggestedNormalisation } from './NormalisationReviewStep.types'
import {
  buildManualNormalisationFromLedger,
  buildNormalisationReviewUpdate,
  filterNormalisationReviewLedgers,
  parseCustomLedgerFromQuery,
  summarizeNormalisationReview,
} from './NormalisationReviewStepModel'

const suggestions: SuggestedNormalisation[] = [
  {
    id: 'pending',
    code: '620',
    description: 'Director salary',
    category: 'salary',
    amount: 60_000,
    reason: 'Owner salary',
    status: 'pending',
  },
  {
    id: 'accepted',
    code: '610',
    description: 'Rent',
    category: 'rent',
    amount: 24_000,
    reason: 'Above market rent',
    status: 'accepted',
  },
  {
    id: 'rejected',
    code: '647',
    description: 'Legal',
    category: 'one-time',
    amount: Number.NaN,
    reason: 'Not applicable',
    status: 'rejected',
  },
]

const ledgers: LedgerAccount[] = [
  { code: '610', name: 'Huur gebouwen' },
  { code: '614', name: 'Autokosten' },
  { code: '620', name: 'Bezoldigingen directie' },
  { code: '630', name: 'Afschrijvingen' },
  { code: '647', name: 'Uitzonderlijke kosten' },
  { code: '649', name: 'Persoonlijke kosten' },
  { code: '700', name: 'Omzet' },
]

describe('summarizeNormalisationReview', () => {
  it('counts statuses and sums accepted finite adjustments only', () => {
    expect(summarizeNormalisationReview(suggestions, 100_000)).toEqual({
      pendingCount: 1,
      acceptedCount: 1,
      rejectedCount: 1,
      totalAcceptedAdjustment: 24_000,
      normalizedEbitda: 124_000,
    })
  })

  it('uses a zero baseline when original EBITDA is not usable', () => {
    expect(summarizeNormalisationReview(suggestions, Number.NaN).normalizedEbitda).toBe(24_000)
  })
})

describe('filterNormalisationReviewLedgers', () => {
  it('limits the default ledger list when there is no search query', () => {
    expect(filterNormalisationReviewLedgers(ledgers, '').map((ledger) => ledger.code)).toEqual([
      '610',
      '614',
      '620',
      '630',
      '647',
      '649',
    ])
  })

  it('filters by code and name case-insensitively', () => {
    expect(filterNormalisationReviewLedgers(ledgers, 'auto')).toEqual([
      { code: '614', name: 'Autokosten' },
    ])
    expect(filterNormalisationReviewLedgers(ledgers, '62')).toEqual([
      { code: '620', name: 'Bezoldigingen directie' },
    ])
  })
})

describe('parseCustomLedgerFromQuery', () => {
  it('parses the selected ledger display shape', () => {
    expect(parseCustomLedgerFromQuery('760 · Diverse opbrengsten')).toEqual({
      code: '760',
      name: 'Diverse opbrengsten',
    })
  })

  it('uses leading digits as a custom code for plain input', () => {
    expect(parseCustomLedgerFromQuery('760 diverse opbrengsten')).toEqual({
      code: '760',
      name: '760 diverse opbrengsten',
    })
  })
})

describe('buildNormalisationReviewUpdate', () => {
  it('calculates amount and percent adjustments from the EBITDA baseline', () => {
    expect(
      buildNormalisationReviewUpdate({
        amountInput: '60.000',
        type: 'add',
        applyAllYears: false,
        reason: 'Owner salary',
        originalEbitda: 100_000,
      })
    ).toEqual({
      amount: 60_000,
      type: 'add',
      applyAllYears: false,
      reason: 'Owner salary',
    })

    expect(
      buildNormalisationReviewUpdate({
        amountInput: '10',
        type: 'subtract_percent',
        applyAllYears: true,
        reason: '',
        originalEbitda: 100_000,
      })
    ).toEqual({
      amount: -10_000,
      type: 'subtract_percent',
      applyAllYears: true,
      reason: undefined,
    })
  })

  it('calculates absolute target adjustments against original EBITDA', () => {
    expect(
      buildNormalisationReviewUpdate({
        amountInput: '120000',
        type: 'absolute',
        applyAllYears: false,
        reason: '',
        originalEbitda: 100_000,
      })?.amount
    ).toBe(20_000)
  })

  it('returns null for invalid amount input', () => {
    expect(
      buildNormalisationReviewUpdate({
        amountInput: 'not a number',
        type: 'add',
        applyAllYears: false,
        reason: '',
        originalEbitda: 100_000,
      })
    ).toBeNull()
  })
})

describe('buildManualNormalisationFromLedger', () => {
  it('builds a manual normalisation with shared category inference', () => {
    expect(
      buildManualNormalisationFromLedger({
        ledger: { code: '647', name: 'Uitzonderlijke kosten' },
        amountInput: '25.000',
        type: 'add',
        applyAllYears: false,
        reason: '',
        originalEbitda: 100_000,
        fallbackReason: 'Manual correction',
      })
    ).toEqual({
      code: '647',
      description: 'Uitzonderlijke kosten',
      category: 'one-time',
      amount: 25_000,
      reason: 'Manual correction',
      source: 'manual',
      type: 'add',
      applyAllYears: false,
    })
  })

  it('applies percentage math for manual ledger additions', () => {
    expect(
      buildManualNormalisationFromLedger({
        ledger: { code: '620', name: 'Bezoldigingen directie' },
        amountInput: '10',
        type: 'add_percent',
        applyAllYears: true,
        reason: 'Percent addback',
        originalEbitda: 100_000,
        fallbackReason: 'Manual correction',
      })
    ).toMatchObject({
      category: 'salary',
      amount: 10_000,
      reason: 'Percent addback',
      type: 'add_percent',
      applyAllYears: true,
    })
  })
})
