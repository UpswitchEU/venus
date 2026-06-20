import { describe, expect, it } from 'vitest'
import type { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import {
  buildCreateVersionBackendRequest,
  transformVersionComparison,
  transformVersionConversationContext,
  transformVersionFromBackend,
  transformVersionStatistics,
} from './VersionAPITransforms'

describe('VersionAPITransforms', () => {
  it('builds the backend create payload without leaking frontend field names', () => {
    const payload = buildCreateVersionBackendRequest({
      reportId: 'report-1',
      versionLabel: 'Base case',
      formData: { company_name: 'Acme' } as unknown as ValuationRequest,
      valuationResult: {
        valuation_summary: { final_valuation: 1_000_000 },
      } as unknown as ValuationResponse,
      htmlReport: '<html>report</html>',
      changesSummary: { significantChanges: [], totalChanges: 0 },
      normalization_data: {
        2025: {
          adjustments: [],
          confidence_score: 'high',
          normalized_ebitda: 120_000,
          reported_ebitda: 100_000,
          total_adjustments: 20_000,
        },
      },
      notes: 'Reviewed',
      tags: ['base'],
      tax_latency_data: [],
    })

    expect(payload).toEqual({
      changes_summary: { significantChanges: [], totalChanges: 0 },
      form_data: { company_name: 'Acme' },
      html_report: '<html>report</html>',
      normalization_data: {
        2025: {
          adjustments: [],
          confidence_score: 'high',
          normalized_ebitda: 120_000,
          reported_ebitda: 100_000,
          total_adjustments: 20_000,
        },
      },
      notes: 'Reviewed',
      tags: ['base'],
      tax_latency_data: [],
      valuation_result: { valuation_summary: { final_valuation: 1_000_000 } },
      version_label: 'Base case',
    })
    expect(payload).not.toHaveProperty('reportId')
    expect(payload).not.toHaveProperty('versionLabel')
  })

  it('normalizes nested backend versions and picks the first renderable report HTML', () => {
    const version = transformVersionFromBackend({
      created_at: '2026-02-03T04:05:06.000Z',
      created_by: 'advisor-1',
      id: 'version-2',
      is_active: true,
      report_id: 'report-1',
      tags: ['base', 42],
      version_data: {
        inputs: { company_name: 'Acme' },
        outputs: {
          details: {
            html_report: '<html><body>from details</body></html>',
          },
        },
      },
      version_label: 'Advisor update',
      version_number: '2',
    })

    expect(version).toMatchObject({
      id: 'version-2',
      reportId: 'report-1',
      versionLabel: 'Advisor update',
      versionNumber: 2,
      createdBy: 'advisor-1',
      formData: { company_name: 'Acme' },
      htmlReport: '<html><body>from details</body></html>',
      isActive: true,
      tags: ['base'],
    })
    expect(version.createdAt).toEqual(new Date('2026-02-03T04:05:06.000Z'))
  })

  it('normalizes comparison and statistics responses from snake_case backend fields', () => {
    const comparison = transformVersionComparison({
      changes: { significantChanges: ['revenue'], totalChanges: 1 },
      highlights: [
        { field: 'revenue', impact: '+10%', label: 'Revenue', newValue: 110, oldValue: 100 },
      ],
      valuation_delta: {
        absolute_change: '250000',
        direction: 'increase',
        percent_change: '12.5',
      },
      version_a: { report_id: 'report-1', version_number: 1 },
      version_b: { report_id: 'report-1', version_number: 2 },
    })

    expect(comparison.valuationDelta).toEqual({
      absoluteChange: 250_000,
      direction: 'increase',
      percentChange: 12.5,
    })
    expect(comparison.versionA.versionNumber).toBe(1)
    expect(comparison.versionB.versionNumber).toBe(2)

    const statistics = transformVersionStatistics({
      avg_time_between_versions_hours: '4.5',
      avg_valuation_change_percent: '7.25',
      first_version: { created_at: '2026-01-01T00:00:00.000Z', number: '1' },
      latest_version: { created_at: '2026-01-02T00:00:00.000Z', number: '3' },
      most_changed_fields: [{ change_count: '2', field: 'revenue' }],
      total_versions: '3',
    })

    expect(statistics).toMatchObject({
      averageTimeBetweenVersions_hours: 4.5,
      averageValuationChange_percent: 7.25,
      mostChangedFields: [{ changeCount: 2, field: 'revenue' }],
      totalVersions: 3,
    })
    expect(statistics.firstVersion.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
    expect(statistics.latestVersion.number).toBe(3)
  })

  it('normalizes optional conversation context', () => {
    expect(transformVersionConversationContext(null)).toBeNull()
    expect(
      transformVersionConversationContext({
        context: { source: 'mercury' },
        conversation: { id: 'conversation-1' },
        trigger_message: { id: 'message-1' },
        trigger_type: 'advisor_override',
      })
    ).toEqual({
      context: { source: 'mercury' },
      conversation: { id: 'conversation-1' },
      triggerMessage: { id: 'message-1' },
      triggerType: 'advisor_override',
    })
  })
})
