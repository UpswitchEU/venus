// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { FieldHelpContext } from '@/components/calculator'
import { buildManualFieldContext, buildManualFieldHelpQuestion } from './manualFieldHelp'

describe('manualFieldHelp', () => {
  it('adapts input-panel field help context to chat drawer field context', () => {
    const context: FieldHelpContext = {
      field: 'ebitda',
      label: 'EBITDA 2025',
      value: 100_000,
      hint: 'Normalized EBITDA',
      grootboekCode: '70',
    }

    expect(buildManualFieldContext(context)).toEqual({
      field: 'ebitda',
      label: 'EBITDA 2025',
      value: 100_000,
      hint: 'Normalized EBITDA',
    })
  })

  it('builds locale-aware normalization questions', () => {
    expect(
      buildManualFieldHelpQuestion(
        { field: 'rent', label: 'Office Rent', normalizationType: 'rent' },
        'en'
      )
    ).toBe('Is the rent for office rent at market rate?')

    expect(
      buildManualFieldHelpQuestion(
        { field: 'vehicle', label: 'Autokosten', normalizationType: 'vehicle' },
        'nl'
      )
    ).toBe('Hoeveel privégebruik kan genormaliseerd worden voor autokosten?')
  })

  it('builds field-specific and ledger fallback questions', () => {
    expect(buildManualFieldHelpQuestion({ field: 'ebitda', label: '2025' }, 'en')).toBe(
      'Which normalizations are relevant for the EBITDA of 2025?'
    )
    expect(
      buildManualFieldHelpQuestion({ field: 'other', label: 'Rent', grootboekCode: '610' }, 'en')
    ).toBe('Analyze ledger account 610 (Rent) for normalization')
    expect(buildManualFieldHelpQuestion({ field: 'other', label: 'Margin' }, 'nl')).toBe(
      'Help me met margin'
    )
  })
})
