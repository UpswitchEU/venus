import { describe, expect, it } from 'vitest'
import {
  getBonusSections,
  METHOD_FIELD_CONFIG,
  PRE_SELECTABLE_METHODS,
} from './methodFieldConfig'

describe('methodFieldConfig', () => {
  it('covers every pre-selectable method in the registry', () => {
    expect(
      PRE_SELECTABLE_METHODS.every((method) => Object.prototype.hasOwnProperty.call(METHOD_FIELD_CONFIG, method))
    ).toBe(true)
  })

  it('merges method and business-type sections without duplicates', () => {
    expect(getBonusSections('dcf', 'saas_software')).toEqual([
      'dcf_projections',
      'saas_metrics',
    ])
  })

  it('falls back to business-type sections when the method is unknown', () => {
    expect(getBonusSections('unknown_method', 'saas_software')).toEqual(['saas_metrics'])
  })

  it('supports arr_multiple as a result-only SaaS method', () => {
    expect(getBonusSections('arr_multiple', 'saas_software')).toEqual(['saas_metrics'])
  })
})
