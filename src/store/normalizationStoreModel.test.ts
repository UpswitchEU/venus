import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import type { CustomAdjustment, NormalizationAdjustment } from '../types/ebitdaNormalization'
import {
  acceptNormalizationItem,
  acceptNormalizationItems,
  buildTitanNormalizationRequest,
  computeNormalizedEbitda,
  extractSessionNormalizationItems,
  mapBackendCategoryToFrontend,
  mapFrontendCategoryToBackend,
  mapTitanNormalizationsToItems,
  rejectNormalizationItem,
  selectNormalizationsByYear,
} from './normalizationStoreModel'

function makeItem(overrides: Partial<NormalizationItem> = {}): NormalizationItem {
  return {
    id: 'norm-1',
    ledgerCode: '610000',
    ledgerName: 'Owner salary',
    category: 'salary',
    type: 'add',
    value: 10_000,
    adjustment: 10_000,
    reason: 'Owner salary normalization',
    source: 'manual',
    sourceRef: '',
    status: 'accepted',
    applyAllYears: false,
    year: 2024,
    confidence: 'high',
    ...overrides,
  }
}

describe('normalizationStoreModel', () => {
  it('round-trips backend categories without collapsing preserved 12-category values', () => {
    expect(mapBackendCategoryToFrontend('related_party_transactions')).toBe('rent')
    expect(mapBackendCategoryToFrontend('unknown_backend_category')).toBe('other')
    expect(mapFrontendCategoryToBackend('salary')).toBe('owner_compensation_adjustment')
    expect(mapFrontendCategoryToBackend('other', 'tax_optimization_reversal')).toBe(
      'tax_optimization_reversal'
    )
  })

  it('builds finite Titan requests and filters accepted items by target year', () => {
    const request = buildTitanNormalizationRequest({
      reportId: 'val-normalization-123',
      reportedEbitda: Number.NaN,
      year: 2024,
      items: [
        makeItem({
          id: 'accepted-2024',
          backendCategory: 'tax_optimization_reversal',
          type: 'add_percent',
          value: 10,
          adjustment: 0,
          applyYears: [2024, 2025],
        }),
        makeItem({ id: 'pending-2024', status: 'pending', adjustment: 50_000 }),
        makeItem({ id: 'accepted-2023', year: 2023, adjustment: 25_000 }),
      ],
    })

    expect(request.reported_ebitda).toBe(0)
    expect(request.adjustments).toHaveLength(1)
    expect(request.adjustments[0]).toMatchObject({
      amount: 0,
      apply_years: [2024, 2025],
      category: 'tax_optimization_reversal',
      frontend_id: 'accepted-2024',
      normalization_type: 'add_percent',
      normalization_value: 10,
    })
  })

  it('maps Titan responses to normalized items and deduplicates multi-year frontend ids', () => {
    type RestoredAdjustment = NormalizationAdjustment & {
      apply_years?: number[]
      frontend_id?: string
      normalization_type?: NormalizationItem['type']
      normalization_value?: number
    }
    type RestoredCustomAdjustment = CustomAdjustment & {
      frontend_id?: string
      normalization_type?: NormalizationItem['type']
      normalization_value?: number
    }

    const sharedAdjustment: RestoredAdjustment = {
      category: 'owner_compensation_adjustment',
      amount: 12_000,
      note: 'Owner salary',
      confidence: 'medium',
      ledger_code: '620000',
      ledger_name: 'Management fee',
      frontend_id: 'shared-import',
      apply_years: [2024, 2025],
      normalization_type: 'add',
      normalization_value: 12_000,
    }
    const customAdjustment: RestoredCustomAdjustment = {
      id: 'custom-1',
      description: 'One-off addback',
      amount: -3_000,
      note: 'One-off',
      frontend_id: 'custom-front',
    }

    const items = mapTitanNormalizationsToItems([
      {
        year: 2024,
        adjustments: [sharedAdjustment],
        custom_adjustments: [customAdjustment],
      },
      {
        year: 2025,
        adjustments: [sharedAdjustment],
        custom_adjustments: [],
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: 'shared-import',
      category: 'salary',
      backendCategory: 'owner_compensation_adjustment',
      applyYears: [2024, 2025],
      confidence: 'medium',
      year: 2024,
    })
    expect(items[1]).toMatchObject({
      id: 'custom-front',
      category: 'other',
      type: 'subtract',
      value: 3_000,
    })
  })

  it('keeps bulk accept from bypassing imported-ledger review while single accept records review', () => {
    const imported = makeItem({
      id: 'imported_sde_owner_salary',
      source: 'yuki',
      status: 'pending',
    })
    const manual = makeItem({ id: 'manual-rent', category: 'rent', status: 'pending' })

    const bulkAccepted = acceptNormalizationItems([imported, manual], [imported.id, manual.id])
    expect(bulkAccepted.find((item) => item.id === imported.id)?.status).toBe('pending')
    expect(bulkAccepted.find((item) => item.id === manual.id)?.status).toBe('accepted')

    const individuallyAccepted = acceptNormalizationItem(imported)
    expect(individuallyAccepted.status).toBe('accepted')
    expect(individuallyAccepted.reviewedAt).toEqual(expect.any(String))

    const rejected = rejectNormalizationItem(individuallyAccepted)
    expect(rejected.status).toBe('rejected')
    expect(rejected.reviewedAt).toBeUndefined()
  })

  it('extracts session items and computes selector totals without trusting invalid adjustments', () => {
    const accepted = makeItem({ adjustment: 15_000 })
    const rejectedInvalid = makeItem({
      id: 'bad-rejected',
      adjustment: Number.NaN,
      status: 'rejected',
    })
    const sessionItems = extractSessionNormalizationItems({
      _normalizations: [accepted, rejectedInvalid, { id: 123 }],
    })

    expect(sessionItems).toHaveLength(2)
    expect(selectNormalizationsByYear(sessionItems, 2024)).toHaveLength(2)
    expect(computeNormalizedEbitda(100_000, sessionItems)).toBe(115_000)
  })
})
