// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualVersionRestorePlan } from './manualVersionRestorePlan'

describe('manualVersionRestorePlan', () => {
  it('builds a full restore plan from a valuation version snapshot', () => {
    const formData = {
      company_name: 'Acme BV',
      country_code: 'BE',
      industry: 'services',
      business_model: 'services',
      founding_year: 2001,
      current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      business_context: {
        _imported_ledger_analysis: {
          tax_latency_candidates: [
            {
              account_code: '221000',
              account_name: 'Buildings',
              description: 'Hidden reserve',
              suggested_question: 'Confirm market value',
              fiscal_year: 2025,
            },
          ],
        },
      },
    }

    const result = buildManualVersionRestorePlan({
      versionNumber: 3,
      formData,
      valuationResult: { success: true, html_report: '' },
      htmlReport: '<main>fallback report</main>',
      normalization_data: {
        '2025': {
          adjustments: [{ category: 'owner_compensation_adjustment', amount: 40_000 }],
        },
      },
      tax_latency_data: [
        {
          id: 'tax-1',
          type: 'passive',
          description: 'Deferred tax',
          temporaryDifference: 100_000,
          taxRate: 25,
        },
      ],
    })

    expect(result?.versionNumber).toBe(3)
    expect(result?.formData).toBe(formData)
    expect(result?.valuationResult?.html_report).toBe('<main>fallback report</main>')
    expect(result?.normalizations).toHaveLength(1)
    expect(result?.taxLatencyItems).toHaveLength(1)
    expect(result?.taxLatencyCandidates).toHaveLength(1)
  })

  it('supports history panel summary versions that use the version field', () => {
    expect(buildManualVersionRestorePlan({ version: '4' })).toEqual({
      versionNumber: 4,
      formData: undefined,
      valuationResult: undefined,
      normalizations: [],
      taxLatencyItems: [],
      taxLatencyCandidates: [],
    })
  })

  it('returns null for non-object input', () => {
    expect(buildManualVersionRestorePlan(null)).toBeNull()
    expect(buildManualVersionRestorePlan('nope')).toBeNull()
  })
})
