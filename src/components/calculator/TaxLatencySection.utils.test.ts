import { describe, expect, it } from 'vitest'
import type { TaxLatencyItem } from '../../store/useTaxLatencyStore'
import {
  findNavTaxLatencyConflicts,
  getLedgerDisplayLabel,
  groupTaxLatencyCandidates,
  parseNumericInput,
} from './TaxLatencySection.utils'

const item = (overrides: Partial<TaxLatencyItem>): TaxLatencyItem => ({
  id: 'item-1',
  type: 'passive',
  accountCode: '222000',
  accountName: 'Gebouwen',
  description: 'Latentie',
  temporaryDifference: 100_000,
  taxRate: 25,
  ...overrides,
})

describe('TaxLatencySection utils', () => {
  it('parses localized numeric input defensively', () => {
    expect(parseNumericInput('€ 12,5')).toBe(12.5)
    expect(parseNumericInput('abc')).toBe(0)
  })

  it('formats ledger display labels from partial account metadata', () => {
    expect(getLedgerDisplayLabel('222000', 'Gebouwen')).toBe('222000 · Gebouwen')
    expect(getLedgerDisplayLabel(undefined, 'Gebouwen')).toBe('Gebouwen')
    expect(getLedgerDisplayLabel()).toBe('—')
  })

  it('groups duplicate imported candidates while preserving non-consecutive years', () => {
    const groups = groupTaxLatencyCandidates([
      {
        id: 'a',
        type: 'passive',
        accountCode: '630200',
        accountName: 'Depreciation',
        description: 'desc',
        suggestedQuestion: 'question',
        taxRate: 25,
        year: 2021,
      },
      {
        id: 'b',
        type: 'passive',
        accountCode: '630200',
        accountName: 'Depreciation',
        description: 'desc',
        suggestedQuestion: 'question',
        taxRate: 25,
        year: 2023,
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ candidateIds: ['a', 'b'], years: [2021, 2023] })
  })
})

describe('findNavTaxLatencyConflicts', () => {
  it('flags passive Belgian MAR 22x and 3x rows when NAV tax is already active', () => {
    const conflicts = findNavTaxLatencyConflicts({
      countryCode: 'BE',
      navTaxLatencyPct: 25,
      navAssets: {
        nav_real_estate_adjustment: 200_000,
        nav_inventory_adjustment: 50_000,
      },
      items: [
        item({ id: 'property', accountCode: '222000' }),
        item({ id: 'inventory', accountCode: '300000' }),
        item({ id: 'active-property', type: 'active', accountCode: '222000' }),
      ],
    })

    expect(conflicts.map((conflict) => conflict.id)).toEqual(['property', 'inventory'])
  })

  it('does not flag non-BE, inactive NAV tax, or missing positive NAV uplift cases', () => {
    const base = {
      items: [item({ accountCode: '222000' })],
      navAssets: { nav_real_estate_adjustment: 200_000 },
    }

    expect(
      findNavTaxLatencyConflicts({ ...base, countryCode: 'NL', navTaxLatencyPct: 25 })
    ).toEqual([])
    expect(findNavTaxLatencyConflicts({ ...base, countryCode: 'BE', navTaxLatencyPct: 0 })).toEqual(
      []
    )
    expect(
      findNavTaxLatencyConflicts({
        countryCode: 'BE',
        navTaxLatencyPct: 25,
        navAssets: { nav_real_estate_adjustment: 0 },
        items: [item({ accountCode: '222000' })],
      })
    ).toEqual([])
  })
})
