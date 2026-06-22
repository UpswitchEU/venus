import { describe, expect, it } from 'vitest'
import type { TaxLatencyItem } from '../../store/useTaxLatencyStore'
import {
  buildTaxLatencyDraftMetrics,
  buildTaxLatencyDraftPayload,
  clampTaxLatencyRate,
  findNavTaxLatencyConflicts,
  getLedgerDisplayLabel,
  groupTaxLatencyCandidates,
  parseNumericInput,
  resolveTaxLatencyDefaultRate,
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

  it('clamps default NAV rates and falls back to configured defaults', () => {
    expect(clampTaxLatencyRate(125)).toBe(100)
    expect(clampTaxLatencyRate(-10)).toBe(0)
    expect(resolveTaxLatencyDefaultRate(12.5, 25)).toEqual({
      rate: 12.5,
      source: 'navSchedule',
    })
    expect(resolveTaxLatencyDefaultRate(undefined, 25)).toEqual({
      rate: 25,
      source: 'fallback',
    })
  })

  it('builds signed preview metrics from localized draft inputs', () => {
    expect(
      buildTaxLatencyDraftMetrics({
        amountInput: '€ 100,5',
        rateInput: '25',
        type: 'passive',
      })
    ).toMatchObject({
      canSubmitAmount: true,
      parsedAmount: 100.5,
      parsedRate: 25,
      preview: -25.125,
    })
    expect(
      buildTaxLatencyDraftMetrics({
        amountInput: '100',
        rateInput: '150',
        type: 'active',
      })
    ).toMatchObject({
      parsedRate: 100,
      preview: 100,
    })
  })

  it('builds tax-latency draft payloads with ledger and edit fallbacks', () => {
    expect(
      buildTaxLatencyDraftPayload({
        accountCode: '',
        accountName: 'Gebouwen',
        amountInput: '100',
        description: 'Latentie',
        rateInput: '25',
        type: 'passive',
      })
    ).toBeNull()

    expect(
      buildTaxLatencyDraftPayload({
        accountCode: '222000',
        accountName: '',
        amountInput: '100',
        description: 'Latentie',
        existingAccountName: 'Existing name',
        rateInput: '25',
        type: 'passive',
      })
    ).toEqual({
      type: 'passive',
      accountCode: '222000',
      accountName: 'Existing name',
      description: 'Latentie',
      temporaryDifference: 100,
      taxRate: 25,
    })
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
