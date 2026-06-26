import { describe, expect, it } from 'vitest'
import type { KBOCompany } from '@/design-system'
import type { BusinessType as ApiBusinessType } from '@/services/businessTypesApi'
import {
  buildBusinessStructurePatch,
  buildCompanyCardBusinessTypeSelectionPatch,
  buildCompanyCardClearPatch,
  buildCompanyCardCountryResetPatch,
  buildCompanyCardRegistrySelectionPlan,
  formatMaterialRevenueNudgeMrr,
  getLegalFormOptions,
  hasMaterialRecurringRevenue,
  resolveStageDefaultRaiseSeed,
} from './companyCardStepModel'

const accountingBusinessType: ApiBusinessType = {
  id: 'accounting',
  title: 'Accounting practice',
  description: '',
  icon: 'chart',
  category: 'Professional Services',
  category_id: 'professional-services',
  industryMapping: 'professional-services',
  keywords: [],
  popular: false,
  primaryMultiple: {
    label: 'EV/EBITDA',
    basis: 'EBITDA',
    median: 5.4,
  },
  status: 'active',
  createdAt: '',
  updatedAt: '',
}

const taxBusinessType: ApiBusinessType = {
  ...accountingBusinessType,
  id: 'tax-advisory',
  title: 'Tax advisory',
  primaryMultiple: {
    label: 'EV/EBITDA',
    basis: 'EBITDA',
    median: 6.1,
  },
}

const registryCompany: KBOCompany = {
  id: 'company-1',
  name: 'Acme Robotics',
  kboNumber: '0123456789',
  legalForm: 'BV',
  address: '',
  postalCode: '',
  city: '',
  canonicalNaceCode: ' 62010 ',
  naceCode: '70220',
  naceDescription: 'Software development and automation consulting',
  activityLabel: 'Industrial automation software for SMEs',
  countryCode: 'nl',
  foundingYear: 2021,
}

describe('getLegalFormOptions', () => {
  it('returns country-specific legal forms and falls back to Belgium', () => {
    expect(getLegalFormOptions('NL').map((option) => option.value)).toContain('stichting')
    expect(getLegalFormOptions('FR').map((option) => option.value)).toContain('sarl')
    expect(getLegalFormOptions('XX').map((option) => option.value)).toEqual(
      getLegalFormOptions('BE').map((option) => option.value)
    )
  })

  it('returns a defensive copy so callers cannot mutate shared options', () => {
    const options = getLegalFormOptions('BE')
    options.pop()

    expect(getLegalFormOptions('BE')).toHaveLength(6)
  })
})

describe('resolveStageDefaultRaiseSeed', () => {
  it('seeds a missing raise from the selected stage default', () => {
    expect(resolveStageDefaultRaiseSeed({ stage: 'pre_seed', raise: null })).toBe(250_000)
  })

  it('re-seeds when the current raise is still one of the stage defaults', () => {
    expect(resolveStageDefaultRaiseSeed({ stage: 'series_a', raise: 750_000 })).toBe(3_000_000)
  })

  it('does not clobber a founder override', () => {
    expect(resolveStageDefaultRaiseSeed({ stage: 'seed', raise: 600_000 })).toBeNull()
  })
})

describe('material recurring revenue nudge', () => {
  it('triggers before Series A when MRR or ARR crosses the SaaS pivot', () => {
    expect(hasMaterialRecurringRevenue({ stage: 'pre_seed', mrr: 10_000, arr: null })).toBe(true)
    expect(hasMaterialRecurringRevenue({ stage: 'seed', mrr: null, arr: 120_000 })).toBe(true)
  })

  it('suppresses the nudge for Series A and below-threshold revenue', () => {
    expect(hasMaterialRecurringRevenue({ stage: 'series_a', mrr: 50_000, arr: null })).toBe(false)
    expect(hasMaterialRecurringRevenue({ stage: 'seed', mrr: 9_999, arr: 119_999 })).toBe(false)
  })

  it('formats the translated MRR token from either MRR or ARR', () => {
    expect(formatMaterialRevenueNudgeMrr({ mrr: 10_400, arr: null })).toBe('10.4')
    expect(formatMaterialRevenueNudgeMrr({ mrr: null, arr: 180_000 })).toBe('15')
  })
})

describe('company-card form patches', () => {
  it('clears stale identity fields in the same country-change patch', () => {
    expect(buildCompanyCardCountryResetPatch('nl')).toMatchObject({
      country_code: 'NL',
      company_name: '',
      kbo_number: undefined,
      legal_form: undefined,
      business_structure: undefined,
      business_type_id: undefined,
    })
  })

  it('clears all company identity and business-type fields', () => {
    expect(buildCompanyCardClearPatch()).toMatchObject({
      company_name: '',
      business_type_id: undefined,
      business_type_title: undefined,
      business_type_segments: [],
      business_model: undefined,
      business_structure: undefined,
    })
  })

  it('bridges registry legal forms into the downstream business structure field', () => {
    expect(buildBusinessStructurePatch('BV')).toEqual({ business_structure: 'bv' })
    expect(buildBusinessStructurePatch('unknown form')).toEqual({ business_structure: undefined })
  })

  it('builds a canonical multi-segment business-type patch', () => {
    const patch = buildCompanyCardBusinessTypeSelectionPatch({
      selectedBusinessTypes: [accountingBusinessType, taxBusinessType],
      existingSegments: [{ business_type_id: 'tax-advisory', weight: 70, earnings: '100000' }],
      extraUpdates: { company_name: 'Acme Robotics' },
    })

    expect(patch).toMatchObject({
      company_name: 'Acme Robotics',
      business_type_id: 'accounting',
      business_type_title: 'Accounting practice',
      business_model: 'accounting',
      industry: 'professional-services',
      business_type_segments: [
        {
          business_type_id: 'accounting',
          basis: 'EBITDA',
          multiple: 5.4,
          weight: 30,
        },
        {
          business_type_id: 'tax-advisory',
          basis: 'EBITDA',
          earnings: '100000',
          multiple: 6.1,
          weight: 70,
        },
      ],
    })
  })

  it('clears business-type fields while preserving unrelated extra updates', () => {
    expect(
      buildCompanyCardBusinessTypeSelectionPatch({
        selectedBusinessTypes: [],
        extraUpdates: { company_name: 'Acme Robotics' },
      })
    ).toMatchObject({
      company_name: 'Acme Robotics',
      business_type_id: undefined,
      business_type_title: undefined,
      business_type_segments: [],
      business_model: undefined,
      industry: undefined,
    })
  })
})

describe('buildCompanyCardRegistrySelectionPlan', () => {
  it('normalizes registry company identity into a downstream form patch', () => {
    const plan = buildCompanyCardRegistrySelectionPlan({
      company: registryCompany,
      currentDescription: '',
      currentFoundingYear: 0,
      fallbackCountry: 'BE',
    })

    expect(plan.countryCode).toBe('NL')
    expect(plan.foundingYearSeed).toBe(2021)
    expect(plan.descriptionSeed).toBe('Industrial automation software for SMEs')
    expect(plan.formPatch).toMatchObject({
      company_name: 'Acme Robotics',
      kbo_number: '0123456789',
      legal_form: 'BV',
      business_structure: 'bv',
      country_code: 'NL',
      nace_code: '62010',
      nace_description: 'Software development and automation consulting',
      founding_year: 2021,
    })
  })

  it('does not clobber existing founding year or pitch fields', () => {
    const plan = buildCompanyCardRegistrySelectionPlan({
      company: registryCompany,
      currentDescription: 'Founder-written pitch',
      currentFoundingYear: 2018,
      fallbackCountry: 'BE',
    })

    expect(plan.foundingYearSeed).toBeNull()
    expect(plan.descriptionSeed).toBeNull()
    expect(plan.formPatch).not.toHaveProperty('founding_year')
  })

  it('falls back to the active country and NACE code when registry enrichments are absent', () => {
    const plan = buildCompanyCardRegistrySelectionPlan({
      company: {
        ...registryCompany,
        canonicalNaceCode: undefined,
        countryCode: undefined,
      },
      currentDescription: '',
      currentFoundingYear: null,
      fallbackCountry: 'fr',
    })

    expect(plan.countryCode).toBe('FR')
    expect(plan.formPatch).toMatchObject({
      country_code: 'FR',
      nace_code: '70220',
    })
  })
})
