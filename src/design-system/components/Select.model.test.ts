import { describe, expect, it } from 'vitest'
import {
  createSelectFocusIndexMap,
  filterSelectOptions,
  flattenEnabledSelectOptions,
  flattenSelectOptions,
  isGroupedOptions,
} from './Select.model'
import type { SelectOptions } from './Select.types'

describe('Select model', () => {
  it('flattens flat and grouped option collections', () => {
    const flatOptions: SelectOptions = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' },
    ]
    const groupedOptions: SelectOptions = [
      {
        label: 'Numbers',
        options: flatOptions,
      },
    ]

    expect(isGroupedOptions(flatOptions)).toBe(false)
    expect(isGroupedOptions(groupedOptions)).toBe(true)
    expect(flattenSelectOptions(flatOptions).map((option) => option.value)).toEqual(['one', 'two'])
    expect(flattenSelectOptions(groupedOptions).map((option) => option.value)).toEqual([
      'one',
      'two',
    ])
  })

  it('filters grouped options without leaking empty groups', () => {
    const options: SelectOptions = [
      {
        label: 'Accounting',
        options: [
          { value: 'yuki', label: 'Yuki' },
          { value: 'octopus', label: 'Octopus' },
        ],
      },
      {
        label: 'Operations',
        options: [{ value: 'crm', label: 'CRM', description: 'Pipeline system' }],
      },
    ]

    expect(filterSelectOptions(options, 'pipeline')).toEqual([
      {
        label: 'Operations',
        options: [{ value: 'crm', label: 'CRM', description: 'Pipeline system' }],
      },
    ])
  })

  it('indexes focusable options by enabled-option order only', () => {
    const disabled = { value: 'blocked', label: 'Blocked', disabled: true }
    const first = { value: 'first', label: 'First' }
    const second = { value: 'second', label: 'Second' }
    const options: SelectOptions = [
      {
        label: 'Group',
        options: [disabled, first, second],
      },
    ]

    const focusIndexByOption = createSelectFocusIndexMap(options)

    expect(flattenEnabledSelectOptions(options)).toEqual([first, second])
    expect(focusIndexByOption.has(disabled)).toBe(false)
    expect(focusIndexByOption.get(first)).toBe(0)
    expect(focusIndexByOption.get(second)).toBe(1)
  })
})
