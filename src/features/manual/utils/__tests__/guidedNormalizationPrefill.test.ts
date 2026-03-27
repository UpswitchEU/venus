import { describe, expect, it } from 'vitest'
import { deriveGuidedNormalizationPrefill } from '../guidedNormalizationPrefill'

describe('deriveGuidedNormalizationPrefill', () => {
  it('returns source-account seeded prefill when the active field has normalization hints', () => {
    const prefill = deriveGuidedNormalizationPrefill({
      activeDomId: 'ebitda__2024',
      importQuality: {
        '2024': {
          confidence_score: 0.72,
          audit_flags: [
            {
              field: 'ebitda',
              code: 'LOW_CONFIDENCE',
              severity: 'warning',
              message: 'Needs review',
              source_accounts: ['614'],
              fiscal_year: 2024,
            },
          ],
          field_provenance: [],
          total_accounts_processed: 1,
          accounts_mapped_directly: 0,
          accounts_fallback: 1,
          accounts_skipped: 0,
          ai_enrichment: {
            ledger_mappings: [],
            normalization_hints: [
              {
                hint_code: 'vehicle_private_use',
                title_nl: 'Privegebruik wagen',
                title_en: 'Private vehicle use',
                rationale_nl: 'Hint',
                rationale_en: 'Hint',
                confidence: 82,
              },
            ],
            review_tier: 'needs_verification',
            generated_at: new Date().toISOString(),
            model: 'test-model',
          },
        },
      },
    })

    expect(prefill).toEqual({
      initialSearchQuery: '614',
      initialYearFilter: 2024,
    })
  })

  it('falls back to field defaults for normalization fields without source accounts', () => {
    const prefill = deriveGuidedNormalizationPrefill({
      activeDomId: 'rent_expense__2023',
      importQuality: {
        '2023': {
          confidence_score: 0.94,
          audit_flags: [
            {
              field: 'rent_expense',
              code: 'MISSING_FIELD',
              severity: 'warning',
              message: 'Rent review',
              source_accounts: [],
              fiscal_year: 2023,
            },
          ],
          field_provenance: [],
          total_accounts_processed: 1,
          accounts_mapped_directly: 1,
          accounts_fallback: 0,
          accounts_skipped: 0,
        },
      },
    })

    expect(prefill).toEqual({
      initialSearchQuery: '610',
      initialYearFilter: 2023,
    })
  })

  it('returns null for guided contexts that are not normalization-related', () => {
    const prefill = deriveGuidedNormalizationPrefill({
      activeDomId: 'revenue__2024',
      importQuality: {
        '2024': {
          confidence_score: 0.94,
          audit_flags: [
            {
              field: 'revenue',
              code: 'MISSING_FIELD',
              severity: 'warning',
              message: 'Revenue review',
              source_accounts: ['70'],
              fiscal_year: 2024,
            },
          ],
          field_provenance: [],
          total_accounts_processed: 1,
          accounts_mapped_directly: 1,
          accounts_fallback: 0,
          accounts_skipped: 0,
        },
      },
    })

    expect(prefill).toBeNull()
  })
})
