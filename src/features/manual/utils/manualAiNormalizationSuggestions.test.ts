// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '@/components/calculator'
import {
  buildManualAiNormalizationSuggestions,
  buildManualImportedNormalizationSuggestions,
  buildSuggestedNormalisationsFromItems,
  MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS,
  updateSuggestedNormalisationStatus,
} from './manualAiNormalizationSuggestions'

function idFactory() {
  let next = 0
  return () => `norm-${++next}`
}

describe('manualAiNormalizationSuggestions', () => {
  it('maps loose AI suggestions to typed normalization items and review suggestions', () => {
    const result = buildManualAiNormalizationSuggestions({
      suggestions: [
        {
          ledgerCode: '620',
          description: 'Owner salary add-back',
          category: 'owner_compensation_adjustment',
          isAddback: true,
          amount: 50_000,
          reason: 'Above-market owner pay',
        },
        {
          description: 'One-off grant',
          category: 'non_recurring_revenue',
          isAddback: false,
          amount: -10_000,
        },
      ],
      filingYear: 2025,
      createId: idFactory(),
    })

    expect(result.items).toEqual([
      {
        id: 'norm-1',
        ledgerCode: '620',
        ledgerName: 'Owner salary add-back',
        category: 'salary',
        backendCategory: 'owner_compensation_adjustment',
        type: 'add',
        value: 50_000,
        adjustment: 50_000,
        reason: 'Above-market owner pay',
        source: 'ai',
        sourceRef: 'Claude AI',
        status: 'pending',
        applyAllYears: false,
        year: 2025,
      },
      {
        id: 'norm-2',
        ledgerCode: '',
        ledgerName: 'One-off grant',
        category: 'other',
        backendCategory: 'non_recurring_revenue',
        type: 'subtract',
        value: 10_000,
        adjustment: -10_000,
        reason: undefined,
        source: 'ai',
        sourceRef: 'Claude AI',
        status: 'pending',
        applyAllYears: false,
        year: 2025,
      },
    ])
    expect(result.reviewSuggestions).toEqual([
      {
        id: 'norm-1',
        code: '620',
        description: 'Owner salary add-back',
        category: 'salary',
        amount: 50_000,
        reason: 'Above-market owner pay',
        sourceRef: 'Claude AI',
        status: 'pending',
        source: 'ai',
        type: 'add',
        applyAllYears: false,
      },
      {
        id: 'norm-2',
        code: '',
        description: 'One-off grant',
        category: 'other',
        amount: -10_000,
        reason: '',
        sourceRef: 'Claude AI',
        status: 'pending',
        source: 'ai',
        type: 'subtract',
        applyAllYears: false,
      },
    ])
  })

  it('coerces invalid amount and unknown category defensively', () => {
    const result = buildManualAiNormalizationSuggestions({
      suggestions: [{ category: 'not_real', amount: 'nope' }],
      filingYear: 2026,
      createId: idFactory(),
      sourceRef: 'AI',
    })

    expect(result.items[0]).toMatchObject({
      category: 'other',
      value: 0,
      adjustment: 0,
      sourceRef: 'AI',
    })
  })

  it('builds review suggestions from existing normalization items', () => {
    const items: NormalizationItem[] = [
      {
        id: 'existing',
        ledgerCode: '610',
        ledgerName: 'Rent normalization',
        category: 'rent',
        type: 'add',
        value: 12_000,
        adjustment: 12_000,
        reason: 'Related-party rent',
        source: 'csv',
        sourceRef: 'CSV Import',
        status: 'accepted',
        applyAllYears: true,
        year: 2025,
      },
    ]

    expect(buildSuggestedNormalisationsFromItems(items)).toEqual([
      {
        id: 'existing',
        code: '610',
        description: 'Rent normalization',
        category: 'rent',
        amount: 12_000,
        reason: 'Related-party rent',
        sourceRef: 'CSV Import',
        status: 'accepted',
        source: 'csv',
        type: 'add',
        applyAllYears: true,
      },
    ])
  })

  it('updates a single review suggestion status by id without replacing siblings', () => {
    const first = {
      id: 'norm-1',
      code: '610',
      description: 'Rent normalization',
      category: 'rent',
      amount: 12_000,
      reason: 'Related-party rent',
      sourceRef: 'AI',
      status: 'pending',
      source: 'ai',
      type: 'add',
      applyAllYears: false,
    } satisfies ReturnType<typeof buildSuggestedNormalisationsFromItems>[number]
    const second = { ...first, id: 'norm-2', description: 'Owner salary' }

    const result = updateSuggestedNormalisationStatus([first, second], 'norm-1', 'accepted')

    expect(result).toEqual([{ ...first, status: 'accepted' }, second])
    expect(result[0]).not.toBe(first)
    expect(result[1]).toBe(second)
  })

  it('leaves suggestions untouched when no id matches', () => {
    const suggestion = {
      id: 'norm-1',
      code: '610',
      description: 'Rent normalization',
      category: 'rent',
      amount: 12_000,
      reason: 'Related-party rent',
      sourceRef: 'AI',
      status: 'pending',
      source: 'ai',
      type: 'add',
      applyAllYears: false,
    } satisfies ReturnType<typeof buildSuggestedNormalisationsFromItems>[number]

    const result = updateSuggestedNormalisationStatus([suggestion], 'missing', 'rejected')

    expect(result).toEqual([suggestion])
    expect(result[0]).toBe(suggestion)
  })

  it('maps imported normalization suggestions to pending store, review, and chat cards', () => {
    const result = buildManualImportedNormalizationSuggestions({
      source: 'exact',
      filingYear: 2025,
      suggestions: [
        {
          id: 'exact-row-1',
          code: '620',
          description: 'Owner compensation',
          category: 'salary',
          amount: 45_000,
          reason: 'Above market salary',
          status: 'accepted',
        },
      ],
    })

    expect(result.items).toEqual([
      {
        id: 'exact-row-1',
        ledgerCode: '620',
        ledgerName: 'Owner compensation',
        category: 'salary',
        type: 'add',
        value: 45_000,
        adjustment: 45_000,
        reason: 'Above market salary',
        source: 'exact',
        sourceRef: 'Exact Online',
        status: 'pending',
        applyAllYears: false,
        year: 2025,
      },
    ])
    expect(result.reviewSuggestions[0]).toMatchObject({
      id: 'exact-row-1',
      sourceRef: MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS.exact,
      status: 'pending',
    })
    expect(result.chatSuggestions).toEqual([
      {
        id: 'exact-row-1',
        code: '620',
        description: 'Owner compensation',
        category: 'salary',
        amount: 45_000,
        reason: 'Above market salary',
        sourceRef: 'Exact Online',
        status: 'pending',
        multiple: 5.2,
      },
    ])
  })

  it('defaults loose imported normalization fields defensively', () => {
    const result = buildManualImportedNormalizationSuggestions({
      source: 'yuki',
      filingYear: 2026,
      suggestions: [{ ledgerName: 'Unknown row', category: 'not-valid', amount: 'nope' }],
      multiple: 4.8,
    })

    expect(result.items[0]).toMatchObject({
      id: 'yuki-1',
      ledgerCode: '',
      ledgerName: 'Unknown row',
      category: 'other',
      value: 0,
      adjustment: 0,
      reason: '',
      source: 'yuki',
      sourceRef: 'Yuki',
      status: 'pending',
      applyAllYears: false,
      year: 2026,
    })
    expect(result.chatSuggestions[0]).toMatchObject({ id: 'yuki-1', multiple: 4.8 })
  })
})
