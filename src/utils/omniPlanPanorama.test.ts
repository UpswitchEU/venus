import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult } from '@/types/valuation'
import { mergePlanGatedOmniPanoramaResults } from './omniPlanPanorama'

const label = (k: string) => `L-${k}`

describe('mergePlanGatedOmniPanoramaResults', () => {
  it('returns a shallow copy unchanged when plan allows all methods', () => {
    const base: Record<string, ValuationMethodResult> = {
      ebitda_multiple: {
        value: 1,
        label: 'E',
        available: true,
      },
    }
    const out = mergePlanGatedOmniPanoramaResults(base, null, {
      hideFiscalForNl: false,
      getLabel: label,
    })
    expect(out).toEqual(base)
    expect(out).not.toBe(base)
  })

  it('strips values and marks plan_teaser for disallowed methods present in base', () => {
    const base: Record<string, ValuationMethodResult> = {
      dcf: {
        value: 1_000_000,
        label: 'DCF',
        available: true,
        multiple_used: 2,
      },
    }
    const out = mergePlanGatedOmniPanoramaResults(base, ['ebitda_multiple'], {
      hideFiscalForNl: false,
      getLabel: label,
    })
    expect(out.dcf?.plan_teaser).toBe(true)
    expect(out.dcf?.value).toBeNull()
    expect(out.dcf?.available).toBe(false)
  })

  it('adds placeholder rows for locked primary methods missing from base', () => {
    const base: Record<string, ValuationMethodResult> = {
      ebitda_multiple: { value: 1, label: 'E', available: true },
    }
    const out = mergePlanGatedOmniPanoramaResults(base, ['ebitda_multiple'], {
      hideFiscalForNl: false,
      getLabel: label,
    })
    expect(out.dcf?.plan_teaser).toBe(true)
    expect(out.dcf?.label).toBe('L-dcf')
  })

  it('skips fiscal_4x placeholder when hideFiscalForNl', () => {
    const base: Record<string, ValuationMethodResult> = {
      ebitda_multiple: { value: 1, label: 'E', available: true },
    }
    const out = mergePlanGatedOmniPanoramaResults(base, ['ebitda_multiple'], {
      hideFiscalForNl: true,
      getLabel: label,
    })
    expect(out.fiscal_4x).toBeUndefined()
  })

  it('drops duplicate revenue_multiple key when same ref as omzet_multiple and skips sibling placeholder', () => {
    const shared: ValuationMethodResult = { value: 100, label: 'Omzet', available: true }
    const base: Record<string, ValuationMethodResult> = {
      ebitda_multiple: { value: 90, label: 'E', available: true },
      omzet_multiple: shared,
      revenue_multiple: shared,
    }
    const out = mergePlanGatedOmniPanoramaResults(base, ['ebitda_multiple'], {
      hideFiscalForNl: false,
      getLabel: label,
    })
    expect(out.revenue_multiple).toBeUndefined()
    expect(out.omzet_multiple?.plan_teaser).toBe(true)
    expect(out.dcf?.label).toBe('L-dcf')
  })

  it('does not add omzet teaser when only revenue_multiple is present for the revenue methodology', () => {
    const base: Record<string, ValuationMethodResult> = {
      ebitda_multiple: { value: 1, label: 'E', available: true },
      revenue_multiple: { value: 100, label: 'Rev', available: true },
    }
    const out = mergePlanGatedOmniPanoramaResults(base, ['ebitda_multiple'], {
      hideFiscalForNl: false,
      getLabel: label,
    })
    expect(out.omzet_multiple).toBeUndefined()
    expect(out.revenue_multiple?.plan_teaser).toBe(true)
  })
})
