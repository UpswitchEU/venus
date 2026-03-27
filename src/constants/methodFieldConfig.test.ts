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

  it('keeps ARR multiple pre-selectable for SaaS workflows', () => {
    expect(PRE_SELECTABLE_METHODS).toContain('arr_multiple')
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

  it('supports Titan SaaS business type ids even when the category is generic', () => {
    expect(getBonusSections('upswitch_adaptive', 'tech-digital', 'saas')).toEqual(['saas_metrics'])
  })

  it('future-proofs SaaS subtype ids without explicit registry entries', () => {
    expect(getBonusSections('upswitch_adaptive', 'tech-digital', 'vertical-saas-fintech')).toEqual([
      'saas_metrics',
    ])
  })
})
