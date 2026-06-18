import { afterEach, describe, expect, it, vi } from 'vitest'
import { BASE_SPARSE_BACKFILL_KEYS, fetchBusinessCardData } from '../SessionSparseBackfill'

/**
 * Contract: Hermes/integration blobs must stay in BASE_SPARSE_BACKFILL_KEYS so
 * backfillSparseSessionFromStoreSeed can recover them when GET returns a thin payload.
 */
const REQUIRED = [
  'number_of_employees',
  'employee_count',
  'business_description',
  'canonical_nace_code',
  'taxonomy',
  'subIndustry',
  'business_type_segments',
  'business_type_mix',
  'business_type_weights',
  '_import_quality',
  'import_quality',
  '_financial_data_source',
  '_imported_ledger_analysis',
  '_imported_saas_metrics',
  '_imported_saas_provenance',
  'filing_year_confirmed',
] as const

describe('BASE_SPARSE_BACKFILL_KEYS integration parity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(REQUIRED)('includes %s', (key) => {
    expect(BASE_SPARSE_BACKFILL_KEYS).toContain(key)
  })

  it('parses weighted business-type mix from Titan business-card responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        company_name: 'Boekhoudkantoor Venus',
        business_type_id: 'accounting',
        business_type_segments: [
          { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
          {
            business_type_id: 'tax-advisory',
            business_type_title: 'Tax advisory',
            weight: 35,
          },
        ],
      }),
    } as Response)

    await expect(fetchBusinessCardData('client-123456')).resolves.toMatchObject({
      business_type_id: 'accounting',
      business_type_segments: [
        { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
        {
          business_type_id: 'tax-advisory',
          business_type_title: 'Tax advisory',
          weight: 35,
        },
      ],
      business_type_weights: {
        accounting: 65,
        'tax-advisory': 35,
      },
    })
  })

  it('falls back to business_type_mix when Titan returns an empty segments array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        company_name: 'Boekhoudkantoor Venus',
        business_type_segments: [],
        business_type_mix: [
          { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
          { business_type_id: 'tax-advisory', business_type_title: 'Tax advisory', weight: 35 },
        ],
      }),
    } as Response)

    await expect(fetchBusinessCardData('client-123456')).resolves.toMatchObject({
      business_type_id: 'accounting',
      business_type_segments: [
        { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
        { business_type_id: 'tax-advisory', business_type_title: 'Tax advisory', weight: 35 },
      ],
      business_type_weights: {
        accounting: 65,
        'tax-advisory': 35,
      },
    })
  })
})
