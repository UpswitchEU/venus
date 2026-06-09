import { describe, expect, it } from 'vitest'
import {
  formatBootstrapCompanyAddress,
  formatLegalFormLabel,
  formatRegistryCompanyLocation,
  formatRegistryNumber,
  getRegistryActivityDescription,
} from './registryCompanyDisplay'

describe('formatLegalFormLabel', () => {
  it('maps truncated BV long form to BV', () => {
    expect(
      formatLegalFormLabel('Besloten vennootschap met beperkte aansprakelijkhe')
    ).toEqual({
      label: 'BV',
      title: 'Besloten vennootschap met beperkte aansprakelijkhe',
    })
  })

  it('returns short codes uppercased', () => {
    expect(formatLegalFormLabel('bv')).toEqual({ label: 'BV' })
  })

  it('returns empty for blank input', () => {
    expect(formatLegalFormLabel('')).toEqual({ label: '' })
    expect(formatLegalFormLabel('—')).toEqual({ label: '' })
  })

  it('ellipsis unmapped long labels', () => {
    expect(formatLegalFormLabel('Some Unknown Long Legal Form Name')).toEqual({
      label: 'Some Unknown…',
      title: 'Some Unknown Long Legal Form Name',
    })
  })
})

describe('getRegistryActivityDescription', () => {
  it('prefers activity label over nace description', () => {
    expect(
      getRegistryActivityDescription({
        activityLabel: 'Primary label',
        naceDescription: 'Fallback',
      })
    ).toBe('Primary label')
  })
})

describe('formatRegistryCompanyLocation', () => {
  it('joins address, postal code, and city', () => {
    expect(
      formatRegistryCompanyLocation({
        address: 'Kerkstraat 1',
        postalCode: '2018',
        city: 'Antwerpen',
      })
    ).toBe('Kerkstraat 1, 2018 Antwerpen')
  })

  it('deduplicates postal and city when already in address', () => {
    expect(
      formatRegistryCompanyLocation({
        address: 'Kerkstraat 1, 2018 Antwerpen',
        postalCode: '2018',
        city: 'Antwerpen',
      })
    ).toBe('Kerkstraat 1, 2018 Antwerpen')
  })

  it('avoids duplicate year-style postal when address already contains it', () => {
    expect(
      formatRegistryCompanyLocation({
        address: '2018 Antwerpen',
        postalCode: '2018',
        city: 'Antwerpen',
      })
    ).toBe('2018 Antwerpen')
  })

  it('returns empty when all parts are blank', () => {
    expect(formatRegistryCompanyLocation({ address: '', postalCode: '', city: '' })).toBe('')
  })

  it('omits trailing comma when postal and city are empty', () => {
    expect(formatRegistryCompanyLocation({ address: 'Kerkstraat 1' })).toBe('Kerkstraat 1')
  })

  it('strips trailing punctuation from registry address parts', () => {
    expect(
      formatRegistryCompanyLocation({
        address: '8531 Harelbeke,',
        postalCode: '8531',
        city: 'Harelbeke',
      })
    ).toBe('8531 Harelbeke')
  })
})

describe('formatRegistryNumber', () => {
  it('formats Belgian KBO numbers', () => {
    expect(formatRegistryNumber('0631747439', 'BE')).toBe('0631.747.439')
  })

  it('passes through non-10-digit BE numbers unchanged', () => {
    expect(formatRegistryNumber('12345', 'BE')).toBe('12345')
  })
})

describe('formatBootstrapCompanyAddress', () => {
  it('prefers street address and dedupes postal/city from companyInfo', () => {
    expect(
      formatBootstrapCompanyAddress({
        address: 'Kerkstraat 1, 2018 Antwerpen',
        postalCode: '2018',
        city: 'Antwerpen',
      })
    ).toBe('Kerkstraat 1, 2018 Antwerpen')
  })

  it('falls back to kboData when companyInfo has no address parts', () => {
    expect(
      formatBootstrapCompanyAddress(null, {
        address: '2018 Antwerpen',
        postalCode: '2018',
        city: 'Antwerpen',
      })
    ).toBe('2018 Antwerpen')
  })
})
