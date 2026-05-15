// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualQualityWarnings } from './manualQualityWarnings'

const translate = (key: string, fallback: string) => `${key}:${fallback}`

describe('manualQualityWarnings', () => {
  it('keeps only high-severity unacknowledged warnings', () => {
    expect(
      buildManualQualityWarnings({
        acknowledgedTypes: new Set(['dismissed_warning']),
        translateCta: translate,
        result: {
          data_quality_warnings: [
            { type: 'dismissed_warning', severity: 'high', message: 'Dismissed' },
            { type: 'medium_warning', severity: 'medium', message: 'Medium' },
            { type: 'unknown_high', severity: 'HIGH', message: 'High' },
          ],
        },
      })
    ).toEqual([
      {
        type: 'unknown_high',
        severity: 'HIGH',
        message: 'High',
        recommendation: undefined,
        step_number: undefined,
        cta_label: 'Open in chat',
        cta_prompt: 'High',
      },
    ])
  })

  it('uses configured CTA translation keys for actionable warnings', () => {
    expect(
      buildManualQualityWarnings({
        acknowledgedTypes: new Set(),
        translateCta: translate,
        result: {
          data_quality_warnings: [
            {
              type: 'thin_comparables_proxy',
              severity: 'high',
              message: 'Thin comps',
              recommendation: 'Check benchmark.',
              step_number: 7,
            },
          ],
        },
      })
    ).toEqual([
      {
        type: 'thin_comparables_proxy',
        severity: 'high',
        message: 'Thin comps',
        recommendation: 'Check benchmark.',
        step_number: 7,
        cta_label: 'qualityCtaThinComparablesLabel:Open in chat',
        cta_prompt: 'qualityCtaThinComparablesPrompt:Thin comps Check benchmark.',
      },
    ])
  })

  it('reads nested warning payloads through the shared extractor', () => {
    expect(
      buildManualQualityWarnings({
        acknowledgedTypes: new Set(),
        translateCta: translate,
        result: {
          details: {
            valuation_result: {
              data_quality_warnings: [{ type: 'nested_high', severity: 'high' }],
            },
          },
        },
      })
    ).toHaveLength(1)
  })
})
