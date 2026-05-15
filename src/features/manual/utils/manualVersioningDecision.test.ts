// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationRequest } from '@/types/valuation'
import { planManualCalculationVersioning } from './manualVersioningDecision'

function request(overrides: Partial<ValuationRequest> = {}): ValuationRequest {
  return {
    company_name: 'Acme BV',
    country_code: 'BE',
    industry: 'services',
    business_model: 'services',
    founding_year: 2001,
    current_year_data: {
      year: 2025,
      revenue: 1_000_000,
      ebitda: 100_000,
    },
    revenue: 1_000_000,
    ebitda: 100_000,
    ...overrides,
  }
}

describe('planManualCalculationVersioning', () => {
  it('logs a zero-change audit entry when Titan creates the first version', () => {
    const decision = planManualCalculationVersioning({
      previousVersion: null,
      latestVersion: { versionNumber: 1 },
      request: request(),
    })

    expect(decision).toEqual({
      firstTitanVersionAudit: {
        versionNumber: 1,
        changes: { totalChanges: 0, significantChanges: [] },
      },
    })
  })

  it('logs Titan regeneration when the backend advanced the version number', () => {
    const previous = request()
    const next = request({ revenue: 1_250_000 })

    const decision = planManualCalculationVersioning({
      previousVersion: { versionNumber: 2, formData: previous },
      latestVersion: { versionNumber: 3 },
      request: next,
    })

    expect(decision.titanRegenerationAudit?.versionNumber).toBe(3)
    expect(decision.titanRegenerationAudit?.changes.revenue).toMatchObject({
      from: 1_000_000,
      to: 1_250_000,
    })
    expect(decision.venusVersionCreate).toBeUndefined()
  })

  it('creates a Venus-side version when significant changes exist and Titan did not advance', () => {
    const previous = request()
    const next = request({ revenue: 1_250_000 })

    const decision = planManualCalculationVersioning({
      previousVersion: { versionNumber: 2, formData: previous },
      latestVersion: { versionNumber: 2 },
      request: next,
    })

    expect(decision.titanRegenerationAudit).toBeUndefined()
    expect(decision.venusVersionCreate).toMatchObject({
      nextVersionNumber: 3,
      changes: {
        significantChanges: expect.arrayContaining(['revenue']),
      },
    })
    expect(decision.venusVersionCreate?.versionLabel).toContain('v3')
  })

  it('does nothing when only non-version-worthy changes exist', () => {
    const previous = request()
    const next = request({ company_name: 'Acme Group BV' })

    const decision = planManualCalculationVersioning({
      previousVersion: { versionNumber: 2, formData: previous },
      latestVersion: { versionNumber: 2 },
      request: next,
    })

    expect(decision).toEqual({})
  })

  it('does nothing when latest version fetch did not return a version', () => {
    const decision = planManualCalculationVersioning({
      previousVersion: { versionNumber: 2, formData: request() },
      latestVersion: null,
      request: request({ revenue: 1_250_000 }),
    })

    expect(decision).toEqual({})
  })
})
