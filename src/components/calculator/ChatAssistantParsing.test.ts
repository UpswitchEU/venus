// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseFinancialValues, parseNormalizationCommands } from './ChatAssistantParsing'

describe('ChatAssistantParsing', () => {
  it('parses Dutch normalization commands into field updates', () => {
    expect(parseNormalizationCommands('Normaliseer eigenaarssalaris naar €60k')).toEqual([
      {
        type: 'normalize',
        field: 'ownerSalary',
        label: 'Eigenaarssalaris',
        value: 60_000,
        originalText: 'Normaliseer eigenaarssalaris naar €60k',
      },
    ])
  })

  it('parses add-back command value-first Dutch phrasing', () => {
    expect(parseNormalizationCommands('Voeg €35k toe aan eenmalige kosten')).toEqual([
      {
        type: 'normalize',
        field: 'oneTime',
        label: 'Eenmalige kosten',
        value: 35_000,
        originalText: 'Voeg €35k toe aan eenmalige kosten',
      },
    ])
  })

  it('parses English commands for mixed-language advisors', () => {
    expect(parseNormalizationCommands('Set EBITDA to 500k')).toEqual([
      {
        type: 'normalize',
        field: 'ebitda',
        label: 'EBITDA',
        value: 500_000,
        originalText: 'Set EBITDA to 500k',
      },
    ])
  })

  it('detects financial values from context words', () => {
    expect(parseFinancialValues('Onze omzet is €500.000')).toEqual([
      {
        field: 'revenue',
        label: 'Omzet',
        value: 500_000,
        originalText: '€500.000',
      },
    ])
  })

  it('defaults substantial uncategorized values to EBITDA', () => {
    expect(parseFinancialValues('500000')).toEqual([
      {
        field: 'ebitda',
        label: 'EBITDA',
        value: 500_000,
        originalText: '500000',
      },
    ])
  })
})
