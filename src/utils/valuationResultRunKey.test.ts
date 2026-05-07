import { describe, expect, it } from 'vitest'

import { valuationResultRunKey } from './valuationResultRunKey'

describe('valuationResultRunKey', () => {
  it('uses valuation_id when present', () => {
    expect(
      valuationResultRunKey({
        valuation_id: 'val-abc',
        valuation_results: { dcf: { available: true, value: 1, label: 'DCF' } },
      })
    ).toBe('val-abc')
  })

  it('uses id when valuation_id missing', () => {
    expect(valuationResultRunKey({ id: 'id-only' })).toBe('id-only')
  })

  it('stringifies numeric id', () => {
    expect(valuationResultRunKey({ id: 42 } as Record<string, unknown>)).toBe('42')
  })

  it('stringifies bigint id', () => {
    expect(valuationResultRunKey({ id: 42n } as unknown as Record<string, unknown>)).toBe('42')
  })

  it('falls back to stable fingerprint when id is missing', () => {
    const base = {
      selected_valuation_method: 'dcf',
      recommended_asking_price: 500_000,
      valuation_results: {
        dcf: { available: true, value: 400_000, label: 'DCF' },
      },
    }
    const a = valuationResultRunKey(base)
    const b = valuationResultRunKey({ ...base })
    expect(a).toMatch(/^fp:[0-9a-f]+$/)
    expect(a).toBe(b)
  })

  it('matches fingerprint for nested valuation_results under details', () => {
    const top = valuationResultRunKey({
      selected_valuation_method: 'dcf',
      valuation_results: { dcf: { available: true, value: 100, label: 'DCF' } },
    })
    const nested = valuationResultRunKey({
      selected_valuation_method: 'dcf',
      details: {
        valuation_results: { dcf: { available: true, value: 100, label: 'DCF' } },
      },
    })
    expect(top).toBe(nested)
  })

  it('changes fingerprint when html_report changes', () => {
    const a = valuationResultRunKey({
      valuation_results: { dcf: { available: true, value: 1, label: 'DCF' } },
      html_report: '<html>a</html>',
    })
    const b = valuationResultRunKey({
      valuation_results: { dcf: { available: true, value: 1, label: 'DCF' } },
      html_report: '<html>b</html>',
    })
    expect(a).not.toBe(b)
  })

  it('changes fingerprint when headline numbers change', () => {
    const a = valuationResultRunKey({
      recommended_asking_price: 1,
      valuation_results: { dcf: { available: true, value: 2, label: 'DCF' } },
    })
    const b = valuationResultRunKey({
      recommended_asking_price: 1,
      valuation_results: { dcf: { available: true, value: 3, label: 'DCF' } },
    })
    expect(a).not.toBe(b)
  })

  it('fingerprint differs when updated_at differs (no stable id)', () => {
    const base = {
      valuation_results: { dcf: { available: true, value: 1 } },
      html_report: '<p>x</p>',
    }
    const a = valuationResultRunKey({
      ...base,
      updated_at: '2026-01-01T00:00:00Z',
    } as Record<string, unknown>)
    const b = valuationResultRunKey({
      ...base,
      updated_at: '2026-01-02T00:00:00Z',
    } as Record<string, unknown>)
    expect(a).toMatch(/^fp:[0-9a-f]+$/)
    expect(a).not.toBe(b)
  })

  it('stable id ignores updated_at', () => {
    expect(
      valuationResultRunKey({
        valuation_id: 'same',
        updated_at: '2026-01-01T00:00:00Z',
      } as Record<string, unknown>)
    ).toBe('same')
  })

  it('includes Date updated_at in fingerprint when id missing', () => {
    const d = new Date('2026-06-01T12:00:00Z')
    const key = valuationResultRunKey({
      valuation_results: { dcf: { available: true, value: 1 } },
      updated_at: d,
    } as Record<string, unknown>)
    expect(key.startsWith('fp:')).toBe(true)
  })

  it('returns empty string for nullish input', () => {
    expect(valuationResultRunKey(null)).toBe('')
    expect(valuationResultRunKey(undefined)).toBe('')
  })

  it('returns empty for array input', () => {
    expect(valuationResultRunKey([])).toBe('')
  })
})
