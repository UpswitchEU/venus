// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { buildManualNormalizationsFromVersionSnapshot } from '../features/manual/utils/manualVersionNormalizationRestore'
import type { CreateVersionRequest } from '../types/ValuationVersion'
import { buildVersionNormalizationSnapshot } from './versionNormalizationSnapshot'

const request = (ebitda: number | null = 100): CreateVersionRequest => ({
  reportId: 'report',
  formData: {
    current_year_data: { year: 2025, revenue: 1000, ebitda },
    currency: 'EUR',
  } as unknown as CreateVersionRequest['formData'],
})
const item = (
  id: string,
  adjustment: number,
  status: NormalizationItem['status'] = 'accepted'
): NormalizationItem => ({
  id,
  adjustment,
  value: Math.abs(adjustment),
  category: 'other',
  type: adjustment < 0 ? 'subtract' : 'add',
  source: 'manual',
  status,
  ledgerCode: '610',
  ledgerName: 'Adjustment',
  year: 2025,
  applyAllYears: false,
})

describe('versioned normalization ledger', () => {
  it('retains every review state while summing accepted amounts exactly and independently of order', () => {
    const rows = [
      item('a', 0.1),
      item('b', 0.2),
      item('pending', 50, 'pending'),
      item('rejected', 40, 'rejected'),
    ]
    for (const ordered of [rows, [...rows].reverse()]) {
      const snapshot = buildVersionNormalizationSnapshot(request(), ordered)
      expect(snapshot?.['2025']).toMatchObject({
        schema_version: 'normalization_year.v2',
        currency: 'EUR',
        reported_ebitda: '100',
        total_adjustments: '0.3',
        normalized_ebitda: '100.3',
        pricing_status: 'scenario_only',
      })
      expect(snapshot?.['2025'].adjustments).toHaveLength(4)
      const restored = buildManualNormalizationsFromVersionSnapshot(
        JSON.parse(JSON.stringify(snapshot))
      )
      expect(restored.map(({ id, status }) => [id, status])).toEqual(
        ordered.map(({ id, status }) => [id, status])
      )
    }
  })

  it('retains a missing earnings basis without zero-filling percentage normalizations', () => {
    const snapshot = buildVersionNormalizationSnapshot(request(null), [
      { ...item('percent', 10), type: 'add_percent', value: 10 },
    ])
    expect(snapshot?.['2025']).toMatchObject({
      reported_ebitda: null,
      total_adjustments: null,
      normalized_ebitda: null,
    })
    expect(snapshot?.['2025'].adjustments[0].calculated_amount).toBeNull()
  })

  it('preserves cancellation and never rounds intermediate totals', () => {
    const rows = [item('big', 1e16), item('cent', 0.01), item('offset', -1e16)]
    for (const ordered of [rows, [...rows].reverse()]) {
      expect(
        buildVersionNormalizationSnapshot(request(), ordered)?.['2025'].total_adjustments
      ).toBe('0.01')
    }
  })

  it('deduplicates year scopes and rejects duplicate adjustment identities', () => {
    const row = { ...item('same', 10), applyYears: [2025, 2025] }
    expect(buildVersionNormalizationSnapshot(request(), [row])?.['2025'].adjustments).toHaveLength(
      1
    )
    expect(() => buildVersionNormalizationSnapshot(request(), [row, row])).toThrow(/Duplicate/)
  })

  it('preserves multi-year identities and owner replacement cost evidence on restore', () => {
    const input = request()
    input.formData.historical_years_data = [{ year: 2024, revenue: 800, ebitda: 80 }]
    const snapshot = buildVersionNormalizationSnapshot(input, [
      {
        ...item('salary', 30),
        applyAllYears: true,
        ruleVersion: 'owner.v1',
        ownerRole: 'working',
        actualOwnerCompensation: 80,
        replacementOwnerCompensation: 50,
      },
    ])
    const restored = buildManualNormalizationsFromVersionSnapshot(snapshot)
    expect(new Set(restored.map((row) => row.id)).size).toBe(2)
    expect(restored.every((row) => row.sourceAdjustmentId === 'salary')).toBe(true)
    expect(
      restored.every(
        (row) =>
          row.actualOwnerCompensation === 80 &&
          row.replacementOwnerCompensation === 50 &&
          row.ruleVersion === 'owner.v1'
      )
    ).toBe(true)
  })

  it('does not relabel future or absent fiscal periods as the current year', () => {
    const input = request()
    input.formData.current_year_data.year = 2027
    const snapshot = buildVersionNormalizationSnapshot(input, [
      { ...item('future', 10), year: 2027 },
    ])
    expect(Object.keys(snapshot ?? {})).toEqual(['2027'])
  })
  it('does not reuse an obsolete reported baseline after a manual earnings edit', () => {
    const input = request(120)
    Object.assign(input.formData.current_year_data, {
      ebitda_normalized: true,
      ebitda_normalization_metadata: { reported_ebitda: '100', normalized_ebitda: '110' },
    })
    expect(buildVersionNormalizationSnapshot(input, [item('a', 10)])?.['2025']).toMatchObject({
      reported_ebitda: '120',
      normalized_ebitda: '130',
    })
    input.formData.current_year_data.ebitda = 110
    expect(buildVersionNormalizationSnapshot(input, [item('a', 10)])?.['2025']).toMatchObject({
      reported_ebitda: '100',
      normalized_ebitda: '110',
    })
  })

  it('does not treat normalized earnings as reported earnings when the source bridge is absent', () => {
    const input = request(110)
    Object.assign(input.formData.current_year_data, { ebitda_normalized: true })
    expect(buildVersionNormalizationSnapshot(input, [item('a', 10)])?.['2025']).toMatchObject({
      reported_ebitda: null,
      normalized_ebitda: null,
    })
  })
})
