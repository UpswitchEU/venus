import { describe, expect, it, vi } from 'vitest'
import { buildStartupValuationRequest } from './buildStartupValuationRequest'
import { getCurrentFilingYear } from './fiscalYear'

describe('buildStartupValuationRequest', () => {
  const baseStartupInputs = {
    stage: 'pre_seed',
    region: 'BE',
    berkus: { sound_idea: 250000 },
  }

  it('hard-pins selected_method and user_weights to the venture path', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme Startup',
      countryCode: 'BE',
      startupInputs: baseStartupInputs,
    })

    expect(req.selected_method).toBe('startup_valuation')
    expect(req.user_weights).toEqual({ startup_valuation: 1.0 })
    expect(req.use_dcf).toBe(false)
    expect(req.use_multiples).toBe(false)
    expect(req.startup_inputs).toBe(baseStartupInputs)
  })

  it('emits a zero-revenue placeholder current_year_data so Titan/IQ schema validation passes', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      startupInputs: baseStartupInputs,
    })

    expect(req.current_year_data).toMatchObject({ revenue: 0, ebitda: 0 })
    expect(req.historical_years_data).toEqual([])
    expect(req.forecast_years_data).toEqual([])
  })

  it('uses filing-safe year so current_year_data.year never exceeds Titan max (calendar year − 1)', () => {
    // April 2026: filing year 2025; Titan rejects year > 2025
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00Z'))
    try {
      const req = buildStartupValuationRequest({
        companyName: 'Acme',
        startupInputs: baseStartupInputs,
      })
      const maxConfirmable = new Date().getFullYear() - 1
      expect(req.current_year_data?.year).toBeLessThanOrEqual(maxConfirmable)
      expect(req.current_year_data?.year).toBe(2025)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses year − 2 in Jan–Mar when books for prior year are not yet filed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'))
    try {
      const req = buildStartupValuationRequest({
        companyName: 'Acme',
        startupInputs: baseStartupInputs,
      })
      expect(req.current_year_data?.year).toBe(2024)
      expect(req.current_year_data?.year).toBeLessThanOrEqual(new Date().getFullYear() - 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to safe defaults for company name, country and founding year', () => {
    const req = buildStartupValuationRequest({
      companyName: '',
      startupInputs: baseStartupInputs,
    })

    expect(req.company_name).toBe('Unknown Startup')
    expect(req.country_code).toBe('BE')
    expect(req.industry).toBe('technology')
    expect(req.business_model).toBe('saas')
    expect(req.founding_year).toBeGreaterThan(1900)
  })

  it('uppercases and trims country code, capping it to ISO-2', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      countryCode: ' nl ',
      startupInputs: baseStartupInputs,
    })

    expect(req.country_code).toBe('NL')
  })

  it('maps UK to GB for ValuationIQ country_code validation', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      countryCode: 'uk',
      startupInputs: baseStartupInputs,
    })

    expect(req.country_code).toBe('GB')
  })

  it('rejects invalid founding years and substitutes a recent year', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      foundingYear: 1700,
      startupInputs: baseStartupInputs,
    })

    expect(req.founding_year).toBeGreaterThan(2000)
  })

  it('clamps founding year to the current filing year (cannot be after closed books)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))
    try {
      const filing = getCurrentFilingYear()
      const req = buildStartupValuationRequest({
        companyName: 'Acme',
        foundingYear: 2030,
        startupInputs: baseStartupInputs,
      })
      expect(req.founding_year).toBe(filing)
    } finally {
      vi.useRealTimers()
    }
  })

  it('threads optional NACE / business-type fields when provided', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      naceCode: '62.01',
      naceDescription: 'Computer programming',
      businessTypeId: 'bt_42',
      businessType: 'private_company',
      startupInputs: baseStartupInputs,
    })

    expect(req.nace_code).toBe('62.01')
    expect(req.nace_description).toBe('Computer programming')
    expect(req.business_type_id).toBe('bt_42')
    expect(req.business_type).toBe('private_company')
  })

  it('threads normalized multi business-type segments when provided', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      businessTypeId: 'accounting',
      businessTypeSegments: [
        {
          business_type_id: 'accounting',
          business_type_title: 'Accounting practice',
          basis: 'EBITDA',
          earnings: '120000',
          multiple: '5.4',
          weight: 60,
        },
        {
          business_type_id: 'tax-advisory',
          business_type_title: 'Tax advisory',
          basis: 'EBITDA',
          earnings: 80000,
          applied_multiple: 6.1,
          weight: '40',
        },
      ],
      startupInputs: baseStartupInputs,
    })

    expect(req.business_type_segments).toEqual([
      {
        business_type_id: 'accounting',
        business_type_title: 'Accounting practice',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        earnings: 120000,
        multiple: 5.4,
        weight: 60,
      },
      {
        business_type_id: 'tax-advisory',
        business_type_title: 'Tax advisory',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        earnings: 80000,
        multiple: 6.1,
        weight: 40,
      },
    ])
  })

  it('threads a single business-type segment as a 100% benchmark mix', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      businessTypeSegments: [
        {
          business_type_id: 'saas',
          business_type_title: 'SaaS',
          weight: 100,
        },
      ],
      startupInputs: baseStartupInputs,
    })

    expect(req.business_type_segments).toEqual([
      {
        business_type_id: 'saas',
        business_type_title: 'SaaS',
        weight: 100,
      },
    ])
  })

  it('canonicalizes legacy business-type aliases before submit', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Upswitch',
      businessTypeId: 'fintech_lending_credit',
      startupInputs: baseStartupInputs,
    })

    expect(req.business_type_id).toBe('fintech-lending')
  })

  it('does not send legal forms as business_type_id', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      businessTypeId: 'company',
      businessType: 'company',
      startupInputs: baseStartupInputs,
    })

    expect(req.business_type_id).toBeUndefined()
    expect(req.business_type).toBe('company')
  })

  it('omits locale when not provided', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      startupInputs: baseStartupInputs,
    })

    expect((req as { locale?: string }).locale).toBeUndefined()
  })

  it('forwards locale verbatim when provided', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      startupInputs: baseStartupInputs,
      locale: 'nl',
    })

    expect((req as { locale?: string }).locale).toBe('nl')
  })

  it('threads a locale-aware Mercury "invite my accountant" CTA URL via metadata', () => {
    // Without `window`, getMercuryUrl falls back to the production host —
    // we still expect the path / query shape to be deterministic so the
    // ValuationIQ aggregator can pick it up via _get_metadata_str.
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      startupInputs: baseStartupInputs,
      locale: 'en',
    })

    const url = (req.metadata as Record<string, string> | undefined)?.startup_advisor_cta_url
    expect(url).toBeTruthy()
    expect(url).toContain('/en/client/dashboard')
    expect(url).toContain('source=startup_report')
    expect(url).toContain('action=invite_accountant')
  })

  it('defaults the CTA locale to "nl" when no locale is provided', () => {
    const req = buildStartupValuationRequest({
      companyName: 'Acme',
      startupInputs: baseStartupInputs,
    })

    const url = (req.metadata as Record<string, string> | undefined)?.startup_advisor_cta_url
    expect(url).toContain('/nl/client/dashboard')
  })
})
