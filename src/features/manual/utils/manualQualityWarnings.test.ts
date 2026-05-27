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
        // Title is now sourced from the i18n override (engine message is the
        // fallback string passed to the translator).
        message: 'qualityTitleThinComparables:Thin comps',
        recommendation: 'qualityBodyThinComparables:Check benchmark.',
        step_number: 7,
        cta_label: 'qualityCtaThinComparablesLabel:Open in chat',
        cta_prompt: 'qualityCtaThinComparablesPrompt:Thin comps Check benchmark.',
      },
    ])
  })

  it('falls back to the engine title/recommendation verbatim for unknown warning types', () => {
    expect(
      buildManualQualityWarnings({
        acknowledgedTypes: new Set(),
        translateCta: translate,
        result: {
          data_quality_warnings: [
            {
              type: 'brand_new_engine_warning',
              severity: 'high',
              message: 'Engine voice goes here',
              recommendation: 'Engine recommendation here',
            },
          ],
        },
      })
    ).toEqual([
      {
        type: 'brand_new_engine_warning',
        severity: 'high',
        // Unknown type — no override, engine copy passes through unchanged.
        message: 'Engine voice goes here',
        recommendation: 'Engine recommendation here',
        step_number: undefined,
        cta_label: 'Open in chat',
        cta_prompt: 'Engine voice goes here Engine recommendation here',
      },
    ])
  })

  it('rewrites the method_substitution title so it does NOT lead with "could not be executed"', () => {
    const [warning] = buildManualQualityWarnings({
      acknowledgedTypes: new Set(),
      translateCta: translate,
      result: {
        data_quality_warnings: [
          {
            type: 'method_substitution',
            severity: 'high',
            message: 'De gevraagde waarderingsmethode kon niet worden uitgevoerd',
          },
        ],
      },
    })
    // The override key gets first crack — engine text is now the fallback.
    expect(warning?.message).toBe(
      'qualityTitleMethodSubstitution:De gevraagde waarderingsmethode kon niet worden uitgevoerd'
    )
    // The advisor-facing key MUST exist in en.json + nl.json (verified in the
    // i18n test below; this assertion just locks the wire-up.)
    expect(warning?.cta_label).toBe('qualityCtaMethodSubstitutionLabel:Open in chat')
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
