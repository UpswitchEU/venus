import { afterEach, describe, expect, it, vi } from 'vitest'
import certification from '../../../../../tests/contracts/valuation-certification-sentinel.v1.json'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationTypes'
import type { ValuationFormData } from '../../types/valuation'
import { buildValuationRequest } from '../buildValuationRequest'
import { makeFormData } from './buildValuationRequest.testUtils'

function atPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, value)
}

describe('cross-service valuation certification sentinel', () => {
  afterEach(() => vi.useRealTimers())

  it('preserves every certified Venus input through request serialization', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'))

    const source = makeFormData({
      ...certification.venus.form_data,
      valuation_case: {
        ...certification.valuation_case,
        accounting_evidence: certification.hermes.accounting_evidence_package,
      },
    } as unknown as Partial<ValuationFormData>)
    const request = buildValuationRequest(
      source,
      certification.venus.normalizations as NormalizationItem[],
      'en'
    )
    const serialized = JSON.parse(JSON.stringify(request)) as Record<string, unknown>

    for (const path of certification.conformance.venus_request_paths) {
      expect(atPath(serialized, path), `certified path ${path}`).not.toBeUndefined()
    }

    expect(serialized.current_year_data).toMatchObject({
      year: 2025,
      revenue: 1_200_000,
      reported_ebitda: 125_000,
      operating_cash_flow: 150_000,
      free_cash_flow: 100_000,
    })
    expect(serialized.forecast_years_data).toEqual([
      expect.objectContaining({ year: 2026, free_cash_flow: 120_000, is_forecast: true }),
      expect.objectContaining({ year: 2027, free_cash_flow: 135_000, is_forecast: true }),
    ])
    expect(serialized.normalizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fiscal_year: 2024,
          evidence_id: 'evidence-invoice-2024-42',
          adjustment_amount: 15_000,
          status: 'accepted',
        }),
        expect.objectContaining({
          fiscal_year: 2025,
          evidence_id: 'evidence-owner-pay-2025',
          owner_role: 'working',
          actual_owner_compensation: 100_000,
          replacement_owner_compensation: 60_000,
          adjustment_amount: 40_000,
          status: 'accepted',
        }),
        expect.objectContaining({
          fiscal_year: 2025,
          evidence_id: 'evidence-request-lease',
          status: 'proposed',
        }),
      ])
    )

    expect(serialized.valuation_case).toMatchObject({
      schema_version: 'valuation_case.v2',
      decision_set_hash: certification.valuation_case.decision_set_hash,
      accounting_evidence: {
        schema_version: 'accounting_evidence_package.v3',
        content_hash: certification.hermes.accounting_evidence_package.content_hash,
      },
      input_decisions: [
        expect.objectContaining({
          schema_version: 'valuation_input_decision.v2',
          value_payload: expect.objectContaining({ contract_transferability: 'high' }),
        }),
        expect.objectContaining({ signed_amount: '200000', currency: 'EUR' }),
      ],
    })
    expect(serialized.holdings_consolidation).toEqual(
      expect.objectContaining({
        subsidiary_run_ids: ['50000000-0000-4000-8000-000000000001'],
        subsidiaries: [expect.objectContaining({ ownership_pct: 80, equity_value: 800_000 })],
      })
    )
    expect(serialized.cap_table).toMatchObject({
      option_pool_pct: 10,
      safe_notes: [expect.objectContaining({ valuation_cap: 1_800_000 })],
    })
  })
})
