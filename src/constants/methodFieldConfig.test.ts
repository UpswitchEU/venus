import { describe, expect, it } from 'vitest'
import {
  equalWeightsFor,
  getBonusSections,
  getBonusSectionsSaasSignalsFromFormData,
  getConflictingMethod,
  getPreSelectableMethodsForFirm,
  getPreSelectableMethodsForFirmAndRevenue,
  isCombinableMethod,
  isUpfrontMethodAllowedForNav,
  rebalanceMethodWeights,
  resolveBusinessTypeIdForBonusSections,
  resolveDisplayPreSelectedMethodKey,
  sanitizeMethodSelection,
  sanitizeSynthesisWeightDigits,
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

  it('surfaces omzet multiple for upfront revenue-led selections', () => {
    expect(PRE_SELECTABLE_METHODS).toContain('omzet_multiple')
    expect(getBonusSections('omzet_multiple')).toEqual(['revenue_quality'])
  })

  it('maps revenue_multiple (English alias) to the same bonus sections as omzet_multiple', () => {
    expect(getBonusSections('revenue_multiple')).toEqual(['revenue_quality'])
  })

  it('reports omzet_multiple and revenue_multiple as mutual conflicts', () => {
    expect(getConflictingMethod('omzet_multiple')).toBe('revenue_multiple')
    expect(getConflictingMethod('revenue_multiple')).toBe('omzet_multiple')
  })

  it('treats revenue_multiple as combinable like omzet_multiple for blended sanitization', () => {
    expect(sanitizeMethodSelection(['revenue_multiple', 'dcf', 'ebitda_multiple'])).toEqual([
      'revenue_multiple',
      'dcf',
      'ebitda_multiple',
    ])
  })

  it('treats adjusted_nav (Gecorrigeerde Netto Actiefwaarde) as combinable for weighted synthesis', () => {
    expect(isCombinableMethod('adjusted_nav')).toBe(true)
    expect(sanitizeMethodSelection(['ebitda_multiple', 'dcf', 'adjusted_nav'])).toEqual([
      'ebitda_multiple',
      'dcf',
      'adjusted_nav',
    ])
    expect(sanitizeMethodSelection(['adjusted_nav'])).toEqual(['adjusted_nav'])
  })

  it('drops duplicate revenue lens when omzet_multiple and revenue_multiple both appear', () => {
    expect(sanitizeMethodSelection(['omzet_multiple', 'revenue_multiple', 'dcf'])).toEqual([
      'omzet_multiple',
      'dcf',
    ])
    expect(sanitizeMethodSelection(['revenue_multiple', 'omzet_multiple', 'dcf'])).toEqual([
      'revenue_multiple',
      'dcf',
    ])
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

  it('adds SaaS metrics when business_model signals SaaS without saas in type id', () => {
    expect(
      getBonusSections('upswitch_adaptive', 'technology', 'software_products', {
        businessModel: 'b2b_saas',
      })
    ).toEqual(['saas_metrics'])
  })

  it('adds SaaS metrics from business_context category or sector_tag', () => {
    expect(
      getBonusSections('ebitda_multiple', 'retail', 'shop', {
        businessContextCategory: 'saas',
      })
    ).toEqual(['revenue_quality', 'saas_metrics'])
    expect(
      getBonusSections('upswitch_adaptive', 'services', 'consulting', {
        sectorTag: 'SaaS – B2B',
      })
    ).toEqual(['saas_metrics'])
  })

  it('resolves business type id for bonus sections (picker, form, then store)', () => {
    expect(resolveBusinessTypeIdForBonusSections('  saas ', '', 'ignored')).toBe('saas')
    expect(resolveBusinessTypeIdForBonusSections('saas', 'other', 'ignored')).toBe('saas')
    expect(resolveBusinessTypeIdForBonusSections(null, '  b2b ', 'store')).toBe('b2b')
    expect(resolveBusinessTypeIdForBonusSections('  ', '', 'vertical-saas')).toBe('vertical-saas')
    expect(resolveBusinessTypeIdForBonusSections(null, '', '  ')).toBe(null)
    expect(resolveBusinessTypeIdForBonusSections(undefined, undefined, undefined)).toBe(null)
  })

  it('parses SaaS signals from form-like state', () => {
    expect(
      getBonusSectionsSaasSignalsFromFormData({
        business_model: 'b2b_saas',
        business_context: { business_category: 'other', sector_tag: 'x' },
      })
    ).toEqual({
      businessModel: 'b2b_saas',
      businessContextCategory: 'other',
      sectorTag: 'x',
    })
  })

  it('excludes Belgian fiscal reference method for NL accountant firms', () => {
    const nl = getPreSelectableMethodsForFirm('NL')
    expect(nl).not.toContain('fiscal_4x')
    expect(nl.length).toBe(PRE_SELECTABLE_METHODS.length - 1)
    expect(getPreSelectableMethodsForFirm('BE')).toEqual(PRE_SELECTABLE_METHODS)
    expect(getPreSelectableMethodsForFirm('nl')).not.toContain('fiscal_4x')
  })

  it('omits omzet_multiple when turnover is known to be ≤ 0', () => {
    expect(getPreSelectableMethodsForFirmAndRevenue('BE', 0)).not.toContain('omzet_multiple')
    expect(getPreSelectableMethodsForFirmAndRevenue('BE', undefined)).toEqual(PRE_SELECTABLE_METHODS)
  })

  it('isUpfrontMethodAllowedForNav respects list and always allows adaptive', () => {
    const allowed = getPreSelectableMethodsForFirm('NL')
    expect(isUpfrontMethodAllowedForNav('upswitch_adaptive', allowed)).toBe(true)
    expect(isUpfrontMethodAllowedForNav('fiscal_4x', allowed)).toBe(false)
    expect(isUpfrontMethodAllowedForNav('ebitda_multiple', allowed)).toBe(true)
  })

  it('resolveDisplayPreSelectedMethodKey falls back to adaptive when invalid', () => {
    const allowed = getPreSelectableMethodsForFirmAndRevenue('BE', 0)
    expect(resolveDisplayPreSelectedMethodKey('omzet_multiple', allowed)).toBe('upswitch_adaptive')
    expect(resolveDisplayPreSelectedMethodKey(null, allowed)).toBe('upswitch_adaptive')
    expect(resolveDisplayPreSelectedMethodKey('dcf', allowed)).toBe('dcf')
  })

  describe('synthesis weights (Waarderingssynthese)', () => {
    it('equalWeightsFor splits 100% across three methods with integer remainder', () => {
      expect(equalWeightsFor(['dcf', 'ebitda_multiple', 'arr_multiple'])).toEqual({
        dcf: 34,
        ebitda_multiple: 33,
        arr_multiple: 33,
      })
    })

    it('sanitizeSynthesisWeightDigits keeps digits and caps length', () => {
      expect(sanitizeSynthesisWeightDigits('ab34cd')).toBe('34')
      expect(sanitizeSynthesisWeightDigits('1000')).toBe('100')
      expect(sanitizeSynthesisWeightDigits('')).toBe('')
    })

    it('rebalanceMethodWeights keeps total 100% when one method changes', () => {
      const w = { dcf: 34, ebitda_multiple: 33, arr_multiple: 33 }
      const next = rebalanceMethodWeights(w, 'dcf', 40)
      expect(Object.values(next).reduce((s, v) => s + v, 0)).toBe(100)
      expect(next).toEqual({
        dcf: 40,
        ebitda_multiple: 30,
        arr_multiple: 30,
      })
    })

    it('rebalanceMethodWeights avoids divide-by-zero when only one key exists', () => {
      expect(rebalanceMethodWeights({ dcf: 100 }, 'dcf', 50)).toEqual({ dcf: 100 })
    })
  })
})
