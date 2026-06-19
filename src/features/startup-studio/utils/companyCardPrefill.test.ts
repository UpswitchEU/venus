import { describe, expect, it } from 'vitest'
import { deriveCompanyCardPrefillPlan } from './companyCardPrefill'

describe('deriveCompanyCardPrefillPlan', () => {
  it('maps a complete Mercury deep-link envelope into form and studio patches', () => {
    expect(
      deriveCompanyCardPrefillPlan(
        '?companyName=Acme%20Robotics&stage=seed&sector=saas&country=be&mrr=12000.4&arr=144000&raise=750000&pitch=AI%20for%20law%20firms',
        {}
      )
    ).toEqual({
      formPatch: {
        company_name: 'Acme Robotics',
        country_code: 'BE',
      },
      studioPatch: {
        stage: 'seed',
        sector: 'saas',
        country_code: 'BE',
        mrr: 12000,
        arr: 144000,
        investment_amount_sought: 750000,
        description: 'AI for law firms',
      },
    })
  })

  it('preserves existing founder-entered values guarded by clobber rules', () => {
    expect(
      deriveCompanyCardPrefillPlan(
        '?prefilledQuery=Other&country=NL&mrr=15000&arr=180000&raise=900000&pitch=Replace%20me',
        {
          companyName: 'Existing BV',
          countryCode: 'BE',
          mrr: 10_000,
          arr: 120_000,
          investmentAmountSought: 750_000,
          description: 'Existing pitch',
        }
      )
    ).toEqual({
      formPatch: {},
      studioPatch: {},
    })
  })

  it('still applies explicit stage and sector because the URL is first-mount intent', () => {
    expect(
      deriveCompanyCardPrefillPlan('?stage=series_a&sector=fintech', {
        companyName: 'Existing BV',
        description: 'Existing pitch',
      }).studioPatch
    ).toEqual({
      stage: 'series_a',
      sector: 'fintech',
    })
  })

  it('rejects invalid enum, country, and numeric values', () => {
    expect(
      deriveCompanyCardPrefillPlan(
        '?stage=growth&sector=space&country=belgium&mrr=0&arr=-1&raise=NaN',
        {}
      )
    ).toEqual({
      formPatch: {},
      studioPatch: {},
    })
  })

  it('clamps long company names and pitches', () => {
    const plan = deriveCompanyCardPrefillPlan(
      `?companyName=${'A'.repeat(200)}&pitch=${'B'.repeat(400)}`,
      {}
    )

    expect(plan.formPatch.company_name).toHaveLength(120)
    expect(plan.studioPatch.description).toHaveLength(240)
  })
})
