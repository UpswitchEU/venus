// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualTaxLatencyCandidatesFromVersionFormData } from './manualVersionTaxLatencyRestore'

describe('manualVersionTaxLatencyRestore', () => {
  it('restores imported-ledger tax latency candidates from version form data', () => {
    const result = buildManualTaxLatencyCandidatesFromVersionFormData({
      business_context: {
        _imported_ledger_analysis: {
          tax_latency_candidates: [
            {
              account_code: '221000',
              account_name: 'Buildings',
              description: 'Hidden reserve on building',
              suggested_question: 'Confirm market value',
              type: 'passive',
              fiscal_year: 2025,
              temporary_difference: 100_000,
              tax_rate: 25,
              auto_apply: true,
            },
          ],
        },
      },
    })

    expect(result).toEqual([
      {
        id: 'tax_latency_2025_221000_0',
        type: 'passive',
        accountCode: '221000',
        accountName: 'Buildings',
        description: 'Hidden reserve on building',
        suggestedQuestion: 'Confirm market value',
        rationale: undefined,
        temporaryDifference: 100_000,
        taxRate: 25,
        year: 2025,
        autoApply: true,
      },
    ])
  })

  it('returns an empty list when version form data has no imported ledger analysis', () => {
    expect(buildManualTaxLatencyCandidatesFromVersionFormData(null)).toEqual([])
    expect(buildManualTaxLatencyCandidatesFromVersionFormData({})).toEqual([])
    expect(buildManualTaxLatencyCandidatesFromVersionFormData({ business_context: {} })).toEqual([])
  })
})
