import { describe, expect, it } from 'vitest'
import { valuationResultRunKey } from './valuationResultRunKey'

describe('valuationResultRunKey', () => {
  it('uses valuation_id when present', () => {
    expect(valuationResultRunKey({ valuation_id: 'abc-123', html_report: 'x'.repeat(500) })).toBe(
      'abc-123'
    )
  })

  it('uses id when valuation_id missing', () => {
    expect(valuationResultRunKey({ id: 'id-only' })).toBe('id-only')
  })

  it('stringifies bigint id', () => {
    expect(valuationResultRunKey({ id: 42n } as unknown as Record<string, unknown>)).toBe('42')
  })

  it('returns stable fingerprint when id missing', () => {
    const a = valuationResultRunKey({
      valuation_results: { dcf: { available: true, value: 1 } },
      current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
      html_report: '<p>hello</p>',
    })
    const b = valuationResultRunKey({
      valuation_results: { dcf: { available: true, value: 1 } },
      current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
      html_report: '<p>hello</p>',
    })
    expect(a).toBe(b)
    expect(a.startsWith('fp:')).toBe(true)
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
    expect(a.startsWith('fp:')).toBe(true)
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
    expect(key.includes(String(d.getTime()))).toBe(true)
  })

  it('returns unknown for non-objects', () => {
    expect(valuationResultRunKey(null)).toBe('unknown')
    expect(valuationResultRunKey([] as unknown as Record<string, unknown>)).toBe('unknown')
  })
})
