import { describe, expect, it } from 'vitest'
import type { CompanySearchResult } from '@/services/registry/types'
import { mapRegistrySearchResultToKboCompany } from './mapRegistrySearchResultToKboCompany'

function hit(overrides: Partial<CompanySearchResult> = {}): CompanySearchResult {
  return {
    company_id: '0631747439',
    company_name: 'Bakker Aldo',
    result_type: 'COMPANY',
    registration_number: '0631747439',
    country_code: 'BE',
    legal_form: 'Besloten vennootschap met beperkte aansprakelijkhe',
    address: 'Kerkstraat 1',
    postal_code: '2018',
    city: 'Antwerpen',
    status: 'Active',
    confidence_score: 1,
    registry_name: 'KBO',
    registry_url: '',
    nace_code: '47241',
    nace_description: 'Detailhandel in brood, banketbakkerswerk, suikerwerk en chocolade',
    ...overrides,
  }
}

describe('mapRegistrySearchResultToKboCompany', () => {
  it('keeps street address separate from postal and city', () => {
    expect(mapRegistrySearchResultToKboCompany(hit())).toMatchObject({
      name: 'Bakker Aldo',
      address: 'Kerkstraat 1',
      postalCode: '2018',
      city: 'Antwerpen',
      kboNumber: '0631747439',
      countryCode: 'BE',
    })
  })

  it('resolves NL rechtsvorm and preserves activity label', () => {
    const result = mapRegistrySearchResultToKboCompany(
      {
        ...hit(),
        country_code: 'NL',
        registration_number: '12345678',
        legal_form: '',
        activity_label: 'Software publishing',
        nace_description: 'Fallback description',
      } as CompanySearchResult & { rechtsvorm?: string },
      { searchCountry: 'NL' }
    )
    expect(result).toMatchObject({
      legalForm: '',
      countryCode: 'NL',
      naceDescription: 'Software publishing',
      activityLabel: 'Software publishing',
    })

    expect(
      mapRegistrySearchResultToKboCompany(
        {
          ...hit({ country_code: 'NL', registration_number: '12345678', legal_form: '' }),
          rechtsvorm: 'BV',
        } as CompanySearchResult & { rechtsvorm: string },
        { searchCountry: 'NL' }
      ).legalForm
    ).toBe('BV')
  })

  it('parses founding year from start_date when not in options', () => {
    expect(
      mapRegistrySearchResultToKboCompany(
        hit({ start_date: '2015-03-12' } as CompanySearchResult & { start_date: string })
      ).foundingYear
    ).toBe(2015)
  })

  it('prefers explicit foundingYear option over registry hit', () => {
    expect(
      mapRegistrySearchResultToKboCompany(
        hit({ start_date: '2015-03-12' } as CompanySearchResult & { start_date: string }),
        { foundingYear: 2020 }
      ).foundingYear
    ).toBe(2020)
  })

  it('preserves multi business-type and NACE candidates from registry enrichment', () => {
    expect(
      mapRegistrySearchResultToKboCompany(
        hit({
          business_type_id: 'accounting',
          business_type_title: 'Accounting practice',
          business_type_ids: ['accounting', 'tax-advisory'],
          business_type_candidates: [
            {
              business_type_id: 'accounting',
              business_type_title: 'Accounting practice',
              nace_code: '69201',
            },
            {
              id: 'tax-advisory',
              title: 'Tax advisory',
              nace_code: '69202',
            },
          ],
          nace_codes: ['69201', '69202'],
        })
      )
    ).toMatchObject({
      businessTypeId: 'accounting',
      businessTypeIds: ['accounting', 'tax-advisory'],
      businessTypeCandidates: [
        {
          id: 'accounting',
          title: 'Accounting practice',
          naceCode: '69201',
        },
        {
          id: 'tax-advisory',
          title: 'Tax advisory',
          naceCode: '69202',
        },
      ],
      naceCodes: ['69201', '69202'],
    })
  })
})
