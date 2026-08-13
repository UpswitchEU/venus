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
  'company_graph_context',
] as const

const OWNER_GRAPH_CONTEXT = {
  company_node_id: '11111111-1111-4111-8111-111111111111',
  graph_revision: 'a'.repeat(64),
  maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
  ruleset_version: 'company-graph-maturity/v3',
  audience: 'owner',
} as const

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

  it('retains an exact owner/advisor graph context from the authenticated Titan card', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        company_name: 'Graph-backed BV',
        company_graph_context: OWNER_GRAPH_CONTEXT,
      }),
    } as Response)

    const result = await fetchBusinessCardData('client-123456')

    expect(result?.company_graph_context).toBe(OWNER_GRAPH_CONTEXT)
  })

  it.each([
    'public',
    'buyer',
  ])('drops a %s context from private workspace prefill', async (audience) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        company_name: 'Wrong audience BV',
        company_graph_context: { ...OWNER_GRAPH_CONTEXT, audience },
      }),
    } as Response)

    const result = await fetchBusinessCardData('client-123456')

    expect(result).not.toHaveProperty('company_graph_context')
  })
})
