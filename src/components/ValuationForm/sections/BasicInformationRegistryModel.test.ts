import { describe, expect, it } from 'vitest'
import type { CompanySearchResult } from '../../../services/registry/types'
import type { ValuationFormData } from '../../../types/valuation'
import {
  buildInitialSelectedCompany,
  buildSelectedCompanyFormUpdates,
  removeRegistryContextFields,
  selectedCompanySyncKey,
} from './BasicInformationRegistryModel'

function company(overrides: Partial<CompanySearchResult> = {}): CompanySearchResult {
  return {
    company_id: 'company-1',
    company_name: 'Acme NV',
    result_type: 'COMPANY',
    registration_number: '0123456789',
    country_code: 'BE',
    legal_form: 'BV',
    address: 'Main Street 1',
    status: 'Active',
    confidence_score: 1,
    registry_name: 'KBO',
    registry_url: '',
    ...overrides,
  }
}

describe('buildInitialSelectedCompany', () => {
  it('restores registry company state from saved business_context', () => {
    const restored = buildInitialSelectedCompany({
      company_name: 'Dutch BV',
      country_code: 'NL',
      business_context: {
        registrationNumber: '12345678',
        companyId: 'kvk-12345678',
        legalForm: 'Besloten vennootschap',
        registeredAddress: 'Keizersgracht 1',
        companyStatus: 'Active',
      },
    } as ValuationFormData)

    expect(restored).toMatchObject({
      company_id: 'kvk-12345678',
      company_name: 'Dutch BV',
      registration_number: '12345678',
      country_code: 'NL',
      legal_form: 'Besloten vennootschap',
      address: 'Keizersgracht 1',
      status: 'Active',
      registry_name: 'KVK',
    })
  })

  it('restores Mercury-prefilled top-level KBO fields and derives an address', () => {
    const restored = buildInitialSelectedCompany({
      company_name: 'Belgian NV',
      country_code: 'BE',
      kbo_number: '0123.456.789',
      legal_form: 'NV',
      postal_code: '1000',
      city: 'Brussels',
    } as ValuationFormData)

    expect(restored).toMatchObject({
      company_id: '0123.456.789',
      registration_number: '0123.456.789',
      legal_form: 'NV',
      address: '1000 Brussels',
      registry_name: 'KBO',
    })
  })

  it('does not create a selected company without a stored registration', () => {
    expect(
      buildInitialSelectedCompany({
        company_name: 'No Registry Ltd',
      } as ValuationFormData)
    ).toBeNull()
  })
})

describe('buildSelectedCompanyFormUpdates', () => {
  it('maps Belgian registry selections to KBO fields and clears stale KVK fields', () => {
    const updates = buildSelectedCompanyFormUpdates({
      selectedCompany: company(),
      effectiveCountryCode: 'BE',
      formData: {
        country_code: 'BE',
        business_context: {
          advisor_note: 'keep me',
          kbo_registration: 'old',
        },
      } as ValuationFormData,
    })

    expect(updates).toMatchObject({
      company_name: 'Acme NV',
      country_code: 'BE',
      registration_number: '0123456789',
      kbo_number: '0123456789',
      kvk_number: undefined,
      legal_form: 'BV',
      business_context: {
        advisor_note: 'keep me',
        kbo_registration: '0123456789',
        kbo_registration_number: '0123456789',
        legal_form: 'BV',
        company_id: 'company-1',
        company_address: 'Main Street 1',
        company_status: 'Active',
      },
    })
  })

  it('maps Dutch registry selections to KVK fields and clears stale KBO fields', () => {
    const updates = buildSelectedCompanyFormUpdates({
      selectedCompany: company({
        country_code: 'NL',
        registration_number: '12345678',
        registry_name: 'KVK',
      }),
      effectiveCountryCode: 'BE',
      formData: {
        country_code: 'BE',
      } as ValuationFormData,
    })

    expect(updates).toMatchObject({
      country_code: 'NL',
      registration_number: '12345678',
      kvk_number: '12345678',
      kbo_number: undefined,
    })
  })
})

describe('removeRegistryContextFields', () => {
  it('removes stale registry identifiers while preserving unrelated context', () => {
    expect(
      removeRegistryContextFields({
        kbo_registration: 'old',
        companyId: 'old-id',
        companyStatus: 'Active',
        advisor_note: 'keep me',
      } as ValuationFormData['business_context'])
    ).toEqual({ advisor_note: 'keep me' })
  })

  it('returns undefined when only registry context remains', () => {
    expect(
      removeRegistryContextFields({
        kbo_registration: 'old',
        companyId: 'old-id',
      } as ValuationFormData['business_context'])
    ).toBeUndefined()
  })
})

describe('selectedCompanySyncKey', () => {
  it('prefers stable registry identity over display name', () => {
    expect(selectedCompanySyncKey(company({ company_id: ' company-id ' }))).toBe('company-id')
    expect(selectedCompanySyncKey(company({ company_id: '', registration_number: ' 123 ' }))).toBe(
      '123'
    )
    expect(
      selectedCompanySyncKey(
        company({ company_id: '', registration_number: '', company_name: ' Acme ' })
      )
    ).toBe('Acme')
  })
})
