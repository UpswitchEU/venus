import { describe, expect, it } from 'vitest'
import {
  canonicalizeTaxLatencyWireArray,
  canonicalTaxLatenciesToStoreItems,
  TAX_LATENCY_FIELD_CONFLICT,
  TAX_LATENCY_SCHEMA_INVALID,
  TaxLatencyBoundaryError,
} from '../taxLatencyWire'

describe('taxLatencyWire', () => {
  const legacyIncidentRow = {
    id: 'auto_tax_latency_2023_168100_0',
    type: 'passive' as const,
    taxRate: 100,
    temporaryDifference: 37_625.28,
    accountCode: '168100',
    accountName: 'Deferred taxes',
    description: 'Deferred tax liability',
    fiscalYear: 2023,
  }

  it('canonicalizes the exact legacy production shape without camelCase leakage', () => {
    const result = canonicalizeTaxLatencyWireArray([legacyIncidentRow])

    expect(result).toEqual([
      {
        id: 'auto_tax_latency_2023_168100_0',
        type: 'passive',
        description: 'Deferred tax liability',
        temporary_difference: 37_625.28,
        tax_rate: 100,
        account_code: '168100',
        fiscal_year: 2023,
      },
    ])
    expect(JSON.stringify(result)).not.toMatch(
      /temporaryDifference|taxRate|accountCode|accountName/
    )
  })

  it('preserves canonical provenance and converts it back to the internal store shape', () => {
    const canonical = canonicalizeTaxLatencyWireArray([
      {
        id: 'tax-1',
        type: 'active',
        description: 'Recoverable deferred tax',
        temporary_difference: 10_000,
        tax_rate: 25,
        account_code: '414000',
        status: 'accepted',
        evidence_id: 'evidence-1',
        reviewed_at: '2026-08-26T08:00:00Z',
        rule_version: 'equity-bridge-v1',
        approved_by: 'advisor-1',
        currency: 'eur',
        fiscal_year: 2025,
        effective_date: '2025-12-31',
      },
    ])

    expect(canonical[0]).toMatchObject({
      status: 'accepted',
      evidence_id: 'evidence-1',
      reviewed_at: '2026-08-26T08:00:00Z',
      rule_version: 'equity-bridge-v1',
      approved_by: 'advisor-1',
      currency: 'EUR',
      fiscal_year: 2025,
      effective_date: '2025-12-31',
    })
    expect(canonicalTaxLatenciesToStoreItems(canonical)[0]).toMatchObject({
      temporaryDifference: 10_000,
      taxRate: 25,
      accountCode: '414000',
      evidence_id: 'evidence-1',
    })
  })

  it('accepts equivalent canonical and legacy aliases', () => {
    expect(
      canonicalizeTaxLatencyWireArray([
        {
          ...legacyIncidentRow,
          temporary_difference: '37625.28',
          tax_rate: 100,
          account_code: '168100',
          fiscal_year: 2023,
        },
      ])[0]
    ).toMatchObject({ temporary_difference: 37_625.28, tax_rate: 100 })
  })

  it('rejects conflicting aliases without choosing a value', () => {
    expect(() =>
      canonicalizeTaxLatencyWireArray([{ ...legacyIncidentRow, temporary_difference: 10_000 }])
    ).toThrowError(
      expect.objectContaining<TaxLatencyBoundaryError>({
        boundaryCode: TAX_LATENCY_FIELD_CONFLICT,
      })
    )
  })

  it.each([
    [{ ...legacyIncidentRow, temporaryDifference: undefined }, 'temporary_difference'],
    [{ ...legacyIncidentRow, taxRate: Number.NaN }, 'tax_rate'],
    [{ ...legacyIncidentRow, taxRate: 101 }, 'tax_rate'],
    [{ ...legacyIncidentRow, temporaryDifference: -1 }, 'temporary_difference'],
  ])('rejects malformed accounting values without defaulting or clamping', (row, field) => {
    try {
      canonicalizeTaxLatencyWireArray([row])
      throw new Error('Expected malformed tax latency to be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(TaxLatencyBoundaryError)
      expect((error as TaxLatencyBoundaryError).boundaryCode).toBe(TAX_LATENCY_SCHEMA_INVALID)
      expect((error as TaxLatencyBoundaryError).issues[0]?.field).toContain(field)
    }
  })
})
