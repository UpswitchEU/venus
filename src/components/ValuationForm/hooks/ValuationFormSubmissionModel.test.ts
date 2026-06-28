// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '../../../types/valuation'
import {
  buildCalculationRequestIdentifiers,
  buildPreCalculationSessionUpdate,
  EMPLOYEE_COUNT_REQUIRED_MESSAGE,
  validateValuationFormSubmission,
} from './ValuationFormSubmissionModel'

function formData(overrides: Partial<ValuationFormData> = {}): ValuationFormData {
  return {
    company_name: 'Acme BV',
    country_code: 'BE',
    industry: 'services',
    business_model: 'services',
    founding_year: 2018,
    business_type: 'company',
    business_type_id: 'professional_services',
    revenue: 1_000_000,
    ebitda: 120_000,
    number_of_owners: 1,
    number_of_employees: 8,
    current_year_data: {
      year: 2025,
      revenue: 900_000,
      ebitda: 110_000,
    },
    ...overrides,
  }
}

describe('ValuationFormSubmissionModel', () => {
  it('allows zero revenue and EBITDA while requiring the benchmark business type', () => {
    expect(
      validateValuationFormSubmission(
        formData({
          revenue: 0,
          ebitda: 0,
        })
      )
    ).toEqual({ ok: true })

    expect(
      validateValuationFormSubmission(
        formData({
          revenue: 0,
          ebitda: 0,
          business_type_id: undefined,
        })
      )
    ).toEqual({
      ok: false,
      reason: 'missing_required_fields',
      message: 'Please fill in all required fields: business_type_id',
      missingFields: ['business_type_id'],
    })
  })

  it('requires explicit employee count for owner concentration risk but accepts zero employees', () => {
    expect(
      validateValuationFormSubmission(
        formData({
          number_of_employees: undefined,
        })
      )
    ).toEqual({
      ok: false,
      reason: 'employee_count_required',
      message: EMPLOYEE_COUNT_REQUIRED_MESSAGE,
    })

    expect(
      validateValuationFormSubmission(
        formData({
          number_of_employees: 0,
        })
      )
    ).toEqual({ ok: true })
  })

  it('detects stale business type selections after sector changes', () => {
    expect(
      validateValuationFormSubmission(
        formData({
          business_type_id: 'accounting',
          business_type_title: 'Fintech lending platform',
          industry: 'fintech',
        })
      )
    ).toEqual({
      ok: false,
      reason: 'business_type_mismatch',
      message:
        'Het geselecteerde bedrijfstype komt niet overeen met Fintech — kies het type opnieuw in stap 1.',
    })
  })

  it('returns ordered missing required fields for stable user feedback', () => {
    expect(
      validateValuationFormSubmission(
        formData({
          revenue: undefined,
          ebitda: undefined,
          industry: '',
          country_code: '',
          business_type_id: undefined,
        })
      )
    ).toEqual({
      ok: false,
      reason: 'missing_required_fields',
      message:
        'Please fill in all required fields: revenue, ebitda, industry, country_code, business_type_id',
      missingFields: ['revenue', 'ebitda', 'industry', 'country_code', 'business_type_id'],
    })
  })

  it('builds the pre-calculation session update with filing-year guards and zero-value fidelity', () => {
    const update = buildPreCalculationSessionUpdate(
      formData({
        revenue: 0,
        ebitda: 0,
        filing_year_confirmed: false,
        current_year_data: {
          year: 2025,
          revenue: 900_000,
          ebitda: 110_000,
          total_assets: 500_000,
          total_debt: 80_000,
          cash: 45_000,
        },
        historical_years_data: [
          { year: 2025, revenue: 850_000, ebitda: 100_000 },
          { year: 2024, revenue: 800_000, ebitda: 90_000 },
        ],
      }),
      new Date('2026-01-15T00:00:00.000Z')
    )

    expect(update.current_year_data).toEqual({
      year: 2024,
      revenue: 0,
      ebitda: 0,
      total_assets: 500_000,
      total_debt: 80_000,
      cash: 45_000,
    })
    expect(update.historical_years_data).toEqual([{ year: 2024, revenue: 800_000, ebitda: 90_000 }])
    expect(update.shares_for_sale).toBe(100)
  })

  it('does not let stale top-level zero mirrors clobber populated current-year accounting data', () => {
    const update = buildPreCalculationSessionUpdate(
      formData({
        revenue: 0,
        ebitda: 0,
        filing_year_confirmed: false,
        current_year_data: {
          year: 2025,
          revenue: 11_282_327,
          ebitda: 1_205_000,
          total_assets: 5_300_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 11_282_327, ebitda: 1_115_950 },
          { year: 2023, revenue: 11_282_327, ebitda: 1_045_723 },
        ],
      }),
      new Date('2026-06-28T12:00:00.000Z')
    )

    expect(update.current_year_data).toMatchObject({
      year: 2025,
      revenue: 11_282_327,
      ebitda: 1_205_000,
      total_assets: 5_300_000,
    })
  })

  it('keeps report and session identifiers out of calculation requests unless they match known formats', () => {
    expect(buildCalculationRequestIdentifiers('8d57c0da-8fc9-4042-a9ca-2f8c17b78b10')).toEqual({
      reportId: '8d57c0da-8fc9-4042-a9ca-2f8c17b78b10',
      sessionKey: undefined,
    })
    expect(buildCalculationRequestIdentifiers('val_1700000000000_abc')).toEqual({
      reportId: 'val_1700000000000_abc',
      sessionKey: 'val_1700000000000_abc',
    })
    expect(buildCalculationRequestIdentifiers('temporary-report')).toEqual({
      reportId: undefined,
      sessionKey: undefined,
    })
  })
})
