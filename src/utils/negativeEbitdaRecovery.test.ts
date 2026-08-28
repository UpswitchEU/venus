import { describe, expect, it } from 'vitest'
import {
  compileRecoveryInputsDraft,
  createRecoveryInputsDraft,
  recoveryDriverRevenue,
  reviewRecoveryInputsDraft,
} from './negativeEbitdaRecovery'

function evidenceBackedDraft(
  draft: ReturnType<typeof createRecoveryInputsDraft>
): ReturnType<typeof createRecoveryInputsDraft> {
  draft.scenarios.forEach((scenario) =>
    scenario.forecast_years.forEach((row) => {
      row.evidence_references = [`management-plan:${scenario.key}:${row.year}`]
    })
  )
  draft.funding_plan.evidence_references = ['cash-runway:management-plan']
  return draft
}

describe('negative EBITDA recovery request compiler', () => {
  it('keeps generated scaffolding UI-only until the complete plan is confirmed', () => {
    const draft = createRecoveryInputsDraft({
      startYear: 2027,
      revenue: 1_000_000,
      reportedEbitda: -100_000,
      verificationIntent: 'owner_attestation',
    })

    expect(compileRecoveryInputsDraft(draft)).toMatchObject({
      inputs: null,
      issues: expect.arrayContaining(['recovery_plan_review_required']),
    })

    const reviewedSuggestion = compileRecoveryInputsDraft(reviewRecoveryInputsDraft(draft))
    expect(reviewedSuggestion.inputs).toBeNull()
    expect(reviewedSuggestion.issues).toEqual(
      expect.arrayContaining(['downside_2027_forecast_evidence_required'])
    )

    const result = compileRecoveryInputsDraft(reviewRecoveryInputsDraft(evidenceBackedDraft(draft)))

    expect(result.issues).toEqual([])
    expect(result.inputs?.verification_intent).toEqual({
      intent: 'automated_guardrails',
      accepted: true,
    })
  })

  it('emits exactly three reconciled scenarios after financial checks', () => {
    let draft = createRecoveryInputsDraft({
      startYear: 2027,
      revenue: 1_000_000,
      reportedEbitda: -100_000,
      verificationIntent: 'owner_attestation',
    })
    draft.governed_assumptions.evidence_references = ['sector-wacc-2026']
    draft = reviewRecoveryInputsDraft(evidenceBackedDraft(draft))

    const result = compileRecoveryInputsDraft(draft)

    expect(result.issues).toEqual([])
    expect(result.inputs?.schema_version).toBe('recovery_inputs.v1')
    expect(result.inputs?.scenarios.map((scenario) => scenario.key).sort()).toEqual([
      'base',
      'downside',
      'upside',
    ])
    expect(
      result.inputs?.scenarios.reduce((total, scenario) => total + scenario.probability_percent, 0)
    ).toBe(100)
    expect('enabled' in (result.inputs ?? {})).toBe(false)
  })

  it('blocks a driver total that does not reconcile to schedule revenue', () => {
    let draft = createRecoveryInputsDraft({
      startYear: 2027,
      revenue: 1_000_000,
      reportedEbitda: -100_000,
      verificationIntent: 'advisor_review',
    })
    draft.governed_assumptions.evidence_references = ['advisor-wacc-file']
    draft = reviewRecoveryInputsDraft(evidenceBackedDraft(draft))
    draft.scenarios[1].forecast_years[0].operating_driver = {
      model_type: 'units_price',
      units: 10,
      price_per_unit: 1,
    }

    const result = compileRecoveryInputsDraft(draft)

    expect(result.inputs).toBeNull()
    expect(result.issues).toContain('base_2027_driver_not_reconciled')
  })

  it('derives all supported driver models without caller FCFF totals', () => {
    expect(
      recoveryDriverRevenue({
        model_type: 'customer_acv',
        customers: 100,
        annual_contract_value: 12_000,
      })
    ).toBe(1_200_000)
    expect(
      recoveryDriverRevenue({
        model_type: 'consultant_capacity',
        consultants: 10,
        annual_capacity_per_consultant: 1_600,
        utilization: 0.75,
        rate: 100,
      })
    ).toBe(1_200_000)
    expect(
      recoveryDriverRevenue({
        model_type: 'arr_retention_expansion',
        opening_arr: 1_000_000,
        gross_retention_rate: 0.9,
        expansion_arr: 100_000,
        new_arr: 200_000,
      })
    ).toBe(1_200_000)
    expect(
      recoveryDriverRevenue({
        model_type: 'attested_custom',
        model_name: 'Owner-attested pipeline model',
        derived_revenue: 1_200_000,
        evidence_references: ['owner-model-1'],
      })
    ).toBe(1_200_000)
  })

  it('blocks out-of-range model drivers before the request reaches Titan', () => {
    let draft = createRecoveryInputsDraft({
      startYear: 2027,
      revenue: 1_000_000,
      reportedEbitda: -100_000,
      verificationIntent: 'owner_attestation',
    })
    draft.governed_assumptions.evidence_references = ['sector-wacc-2026']
    draft = reviewRecoveryInputsDraft(evidenceBackedDraft(draft))
    draft.scenarios[1].forecast_years[0].operating_driver = {
      model_type: 'arr_retention_expansion',
      opening_arr: 1_000_000,
      gross_retention_rate: 1.2,
      expansion_arr: 0,
      new_arr: 0,
    }

    expect(compileRecoveryInputsDraft(draft).issues).toContain('base_2027_driver_inputs_invalid')
  })

  it('lets an owner submit an evidence-backed custom driver', () => {
    let draft = createRecoveryInputsDraft({
      startYear: 2027,
      revenue: 1_000_000,
      reportedEbitda: -100_000,
      verificationIntent: 'owner_attestation',
    })
    draft.governed_assumptions.evidence_references = ['sector-wacc-2026']
    draft = reviewRecoveryInputsDraft(evidenceBackedDraft(draft))
    draft.scenarios[0].forecast_years[0].operating_driver = {
      model_type: 'attested_custom',
      model_name: 'Owner-attested pipeline model',
      derived_revenue: draft.scenarios[0].forecast_years[0].revenue,
      evidence_references: ['owner-model-1'],
    }

    expect(compileRecoveryInputsDraft(draft).issues).toEqual([])
  })
})
