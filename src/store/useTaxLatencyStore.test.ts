import { beforeEach, describe, expect, it } from 'vitest'
import { type TaxLatencyCandidate, useTaxLatencyStore } from './useTaxLatencyStore'

function candidate(overrides: Partial<TaxLatencyCandidate>): TaxLatencyCandidate {
  return {
    id: overrides.id ?? `cand-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'passive',
    accountCode: overrides.accountCode ?? '168000',
    accountName: overrides.accountName ?? 'Uitgestelde belastingen',
    description: overrides.description ?? 'Deferred tax provision',
    suggestedQuestion: overrides.suggestedQuestion ?? 'Toepassen?',
    rationale: overrides.rationale,
    temporaryDifference: overrides.temporaryDifference,
    taxRate: overrides.taxRate ?? 25,
    year: overrides.year,
    autoApply: overrides.autoApply,
  }
}

describe('useTaxLatencyStore.setCandidates auto-promotion (zero-draft)', () => {
  beforeEach(() => {
    useTaxLatencyStore.getState().clear()
  })

  it('promotes a fully-specified autoApply candidate (MAR 168 deferred tax) to an item', () => {
    useTaxLatencyStore.getState().setCandidates([
      candidate({
        id: 'cand-168',
        accountCode: '168000',
        accountName: 'Uitgestelde belastingen',
        temporaryDifference: 25_000,
        taxRate: 100,
        autoApply: true,
        year: 2025,
      }),
    ])

    const { items, candidates } = useTaxLatencyStore.getState()
    expect(candidates).toEqual([])
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(
      expect.objectContaining({
        accountCode: '168000',
        type: 'passive',
        temporaryDifference: 25_000,
        taxRate: 100,
      })
    )
    expect(items[0].id).toMatch(/^auto_/)
  })

  it('keeps real-estate (no temporaryDifference) and provision (no autoApply) candidates as cards', () => {
    useTaxLatencyStore.getState().setCandidates([
      candidate({
        id: 'cand-real-estate',
        accountCode: '222000',
        accountName: 'Gebouwen',
        // no temporaryDifference — needs FMV input
        taxRate: 25,
        autoApply: false,
        year: 2025,
      }),
      candidate({
        id: 'cand-provision',
        accountCode: '160000',
        accountName: 'Voorzieningen',
        temporaryDifference: 50_000,
        taxRate: 25,
        autoApply: false, // accountant judgement still required
        year: 2025,
      }),
    ])

    const { items, candidates } = useTaxLatencyStore.getState()
    expect(items).toEqual([])
    expect(candidates).toHaveLength(2)
  })

  it('collapses cross-year duplicate autoApply candidates into a single item', () => {
    // 168x deferred tax can fire across multiple fiscal years; the on-balance
    // value is already the latent tax, so we don't want N years × N items.
    useTaxLatencyStore.getState().setCandidates([
      candidate({
        id: 'cand-168-2024',
        accountCode: '168000',
        temporaryDifference: 25_000,
        taxRate: 100,
        autoApply: true,
        year: 2024,
      }),
      candidate({
        id: 'cand-168-2025',
        accountCode: '168000',
        temporaryDifference: 25_000,
        taxRate: 100,
        autoApply: true,
        year: 2025,
      }),
    ])

    const { items, candidates } = useTaxLatencyStore.getState()
    expect(candidates).toEqual([])
    expect(items).toHaveLength(1)
    expect(items[0].accountCode).toBe('168000')
  })

  it('does not double-apply when an item for the same (accountCode, type) already exists', () => {
    useTaxLatencyStore.getState().setItems([
      {
        id: 'manual-168',
        type: 'passive',
        accountCode: '168000',
        accountName: 'Uitgestelde belastingen (manual)',
        description: 'Manually entered earlier',
        temporaryDifference: 30_000,
        taxRate: 100,
      },
    ])

    useTaxLatencyStore.getState().setCandidates([
      candidate({
        id: 'cand-168-auto',
        accountCode: '168000',
        temporaryDifference: 25_000,
        taxRate: 100,
        autoApply: true,
      }),
    ])

    const { items, candidates } = useTaxLatencyStore.getState()
    expect(candidates).toEqual([])
    expect(items).toHaveLength(1)
    // The manual entry wins; the autoApply candidate is silently dropped (no
    // double-counting in the equity bridge).
    expect(items[0].id).toBe('manual-168')
  })

  it('mixes promotion and parking: autoApply ones promote, others stay as candidates', () => {
    useTaxLatencyStore.getState().setCandidates([
      candidate({
        id: 'cand-168',
        accountCode: '168000',
        temporaryDifference: 25_000,
        taxRate: 100,
        autoApply: true,
      }),
      candidate({
        id: 'cand-real-estate',
        accountCode: '222000',
        accountName: 'Gebouwen',
        taxRate: 25,
        autoApply: false,
      }),
    ])

    const { items, candidates } = useTaxLatencyStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].accountCode).toBe('168000')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].accountCode).toBe('222000')
  })

  it('does not promote a candidate with autoApply but zero temporaryDifference', () => {
    useTaxLatencyStore.getState().setCandidates([
      candidate({
        id: 'cand-zero',
        accountCode: '168000',
        temporaryDifference: 0,
        taxRate: 100,
        autoApply: true,
      }),
    ])

    const { items, candidates } = useTaxLatencyStore.getState()
    expect(items).toEqual([])
    expect(candidates).toHaveLength(1)
  })

  it('preserves imported governance but invalidates approval after a user edit', () => {
    useTaxLatencyStore.getState().setItems(
      [
        {
          id: 'governed-tax-1',
          type: 'passive',
          description: 'Reviewed deferred tax',
          temporaryDifference: 100_000,
          taxRate: 25,
          status: 'accepted',
          evidence_id: 'evidence-tax-1',
          reviewed_at: '2026-08-12T09:30:00Z',
          rule_version: 'equity-bridge-v1',
          approved_by: 'advisor-17',
          currency: 'EUR',
          fiscal_year: 2025,
          effective_date: '2025-12-31',
        },
      ],
      { source: 'system' }
    )

    expect(useTaxLatencyStore.getState().items[0]).toMatchObject({
      status: 'accepted',
      evidence_id: 'evidence-tax-1',
    })

    useTaxLatencyStore.getState().updateItem('governed-tax-1', { taxRate: 30 })
    const edited = useTaxLatencyStore.getState().items[0]
    expect(edited).toMatchObject({
      taxRate: 30,
      status: 'proposed',
      currency: 'EUR',
      fiscal_year: 2025,
      effective_date: '2025-12-31',
    })
    expect(edited).not.toHaveProperty('evidence_id')
    expect(edited).not.toHaveProperty('reviewed_at')
    expect(edited).not.toHaveProperty('rule_version')
    expect(edited).not.toHaveProperty('approved_by')
  })
})
