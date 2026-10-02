import { describe, expect, it } from 'vitest'
import {
  parseIndicativeExportRequest,
  savedIndicativeExportRequest,
  savedIndicativeRun,
} from './indicativeReportExport'

const run = {
  schema_version: 'valuation_run.v2',
  run_hash: 'a'.repeat(64),
  response_snapshot: { data_tier: 'indicative' },
  valuation_range: {
    low: '0.00',
    mid: '150.08',
    high: '9007199254740993.03',
    currency: 'GBP',
    value_basis: 'equity_value',
  },
}
const updated = '2026-10-02T06:59:00.123Z'
const report = { updated_at: updated, valuation_result: { valuation_run: run } }

describe('saved indicative export selection', () => {
  it('carries exact immutable identity without recomputing money or dates', () => {
    const before = JSON.stringify(report)
    expect(savedIndicativeExportRequest(report, 'fr')).toEqual({
      expected_run_hash: run.run_hash,
      expected_updated_at: updated,
      language: 'fr',
      include_pdf: true,
    })
    expect(JSON.stringify(report)).toBe(before)
    expect(savedIndicativeRun(report)?.valuation_range).toEqual(run.valuation_range)
  })
  it('accepts producer details wrapper and API envelope', () => {
    expect(
      savedIndicativeExportRequest(
        { data: { updated_at: updated, valuation_result: { details: { valuation_run: run } } } },
        'nl'
      )?.expected_run_hash
    ).toBe(run.run_hash)
  })
  it('keeps formal and legacy routes separate', () => {
    expect(
      savedIndicativeExportRequest(
        {
          updated_at: updated,
          valuation_result: {
            valuation_run: { ...run, response_snapshot: { data_tier: 'attested' } },
          },
        },
        'en'
      )
    ).toBeNull()
    expect(
      savedIndicativeExportRequest(
        { updated_at: updated, valuation_result: { equity_value_mid: 12 } },
        'en'
      )
    ).toBeNull()
  })
  it.each([
    undefined,
    'not-a-date',
    '2026-02-30T00:00:00Z',
  ])('refuses missing/malformed revision %s without fallback', (updated_at) => {
    expect(() => savedIndicativeExportRequest({ ...report, updated_at }, 'en')).toThrow()
  })
  it('refuses conflicting producer identities', () => {
    expect(() =>
      savedIndicativeExportRequest(
        {
          ...report,
          valuation_result: {
            valuation_run: run,
            details: { valuation_run: { ...run, run_hash: 'b'.repeat(64) } },
          },
        },
        'en'
      )
    ).toThrow('conflict')
  })
  it.each(['de', 'en-GB', ''])('does not invent a supported locale %s', (language) => {
    expect(() => savedIndicativeExportRequest(report, language)).toThrow()
  })
  it('rejects browser pricing overlays and nonfinite monetary inputs at the export contract', () => {
    expect(() =>
      parseIndicativeExportRequest({
        ...savedIndicativeExportRequest(report, 'en'),
        valuation: NaN,
      })
    ).toThrow()
  })
})
