// @vitest-environment node

import { describe, expect, it } from 'vitest'
import en from '../../../../messages/en.json'
import fr from '../../../../messages/fr.json'
import nl from '../../../../messages/nl.json'
import {
  getManualEmployeeCountIssue,
  getManualSubmitValidationIssue,
  MANUAL_SUBMIT_VALIDATION_TOAST_KEYS,
} from './manualSubmitValidation'

/** SME cases that reach past the headcount check describe a company whose count is known. */
const knownHeadcount = { ownerManagers: 1, fteEmployees: 4 }

describe('getManualSubmitValidationIssue', () => {
  it('requires company name for every method', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: ' ',
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'startup_valuation'
      )
    ).toBe('companyNameMissing')
  })

  it('requires business type for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: '',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'dcf'
      )
    ).toBe('businessTypeMissing')
  })

  it('accepts restored canonical business type ids for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          ...knownHeadcount,
          businessType: '',
          businessTypeId: 'fintech-lending-credit',
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('accepts restored business type codes for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          ...knownHeadcount,
          businessType: '',
          businessTypeCode: 'fintech-lending-credit',
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('accepts restored snake_case business type ids for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          ...knownHeadcount,
          businessType: '',
          business_type_id: 'fintech-lending-credit',
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('accepts restored multi-segment business type identity for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          ...knownHeadcount,
          businessType: '',
          business_type_segments: [
            { business_type_id: 'accounting' },
            { business_type_id: 'tax-advisory' },
          ],
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('requires a complete financial year for SME methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          ...knownHeadcount,
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 0, ebitda: 0 }],
        },
        'dcf'
      )
    ).toBe('financialDataIncomplete')
  })

  it('requires canonical business type identity for venture-path methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'startup',
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBe('businessTypeMissing')
  })

  it('accepts multi-segment business type identity for venture-path methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'startup',
          business_type_segments: [
            { business_type_id: 'saas' },
            { business_type_id: 'marketplace' },
          ],
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBeNull()
  })

  it('skips SME financial blockers for venture-path methods after business type is resolved', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: '',
          businessTypeId: 'saas',
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBeNull()
  })

  it('blocks explicit DCF with fewer than three closed fiscal years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          ...knownHeadcount,
          businessType: 'Consulting',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'dcf'
      )
    ).toBe('dcfNotReady')
  })

  it('passes explicit DCF with three closed fiscal years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          ...knownHeadcount,
          businessType: 'Consulting',
          yearlyFinancials: [
            { year: '2025', revenue: 100, ebitda: 10 },
            { year: '2024', revenue: 90, ebitda: 9 },
            { year: '2023', revenue: 80, ebitda: 8 },
          ],
        },
        'dcf'
      )
    ).toBeNull()
  })

  it('passes one-year SME submissions with zero historical placeholders', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Upswitch',
          ...knownHeadcount,
          businessType: 'Financial Services',
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 0, ebitda: 0 },
            { year: '2023', revenue: 0, ebitda: 0 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('passes the exact two-year LGS case through Adaptive', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'LGS workshop',
          ...knownHeadcount,
          businessType: 'Reclamebureau',
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 900_000, ebitda: 100_000 },
            { year: '2023', revenue: 0, ebitda: 0 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('blocks an Adaptive synthesis carrying a positive DCF weight when not ready', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'LGS workshop',
          ...knownHeadcount,
          businessType: 'Reclamebureau',
          user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 900_000, ebitda: 100_000 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBe('dcfNotReady')
  })

  it('blocks advisor-entered DCF assumptions with fewer than three actual years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          ...knownHeadcount,
          businessType: 'Consulting',
          dcf_exit_multiple: 4.5,
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            { year: '2024', revenue: 900_000, ebitda: 90_000 },
          ],
        },
        'upswitch_adaptive'
      )
    ).toBe('dcfNotReady')
  })

  it('allows explicit FCFF projections with fewer than three actual years', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'LGS workshop',
          ...knownHeadcount,
          businessType: 'Reclamebureau',
          dcf_input_mode: 'fcff_only',
          yearlyFinancials: [
            { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
            {
              year: '2026',
              revenue: 0,
              ebitda: 0,
              free_cash_flow: 125_000,
              isForecast: true,
            },
          ],
        },
        'dcf'
      )
    ).toBeNull()
  })

  // E-04a: an unknown headcount used to reach the engine as an invented 5 (panel) or 0
  // (assistant-approved run), and 0 with one owner reads as a sole trader.
  it.each([
    ['missing', undefined],
    ['null', null],
    ['not a number', Number.NaN],
  ])('asks a company for its headcount when it is %s', (_label, fteEmployees) => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          fteEmployees,
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'upswitch_adaptive'
      )
    ).toBe('employeeCountMissing')
  })

  it('accepts a typed headcount of 0 for an owner-only company', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          ownerManagers: 1,
          fteEmployees: 0,
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  it('does not ask a sole trader for a headcount', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          businessStructure: 'sole-trader',
          ownerManagers: 1,
          fteEmployees: undefined,
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'upswitch_adaptive'
      )
    ).toBeNull()
  })

  // A cleared owner field reads as 0, but the request still goes out with one owner; the
  // count used to be skipped then, so the run went out with one owner and no employees.
  it('still asks for a headcount when the owner count was cleared', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: 'Consulting',
          ownerManagers: 0,
          fteEmployees: undefined,
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        'upswitch_adaptive'
      )
    ).toBe('employeeCountMissing')
  })

  it('does not ask for a headcount on startup methods', () => {
    expect(
      getManualSubmitValidationIssue(
        {
          companyName: 'Acme',
          businessType: '',
          businessTypeId: 'saas',
          ownerManagers: 1,
          fteEmployees: undefined,
          yearlyFinancials: [],
        },
        'startup_valuation'
      )
    ).toBeNull()
  })

  it.each([
    ['en', en],
    ['nl', nl],
    ['fr', fr],
  ])('every submit blocker has %s toast copy', (_locale, messages) => {
    const toastCopy = (messages as { toast: Record<string, unknown> }).toast
    for (const { title, description } of Object.values(MANUAL_SUBMIT_VALIDATION_TOAST_KEYS)) {
      expect(toastCopy[title], title).toEqual(expect.any(String))
      expect(String(toastCopy[title]).trim(), title).not.toBe('')
      expect(toastCopy[description], description).toEqual(expect.any(String))
      expect(String(toastCopy[description]).trim(), description).not.toBe('')
    }
  })

  // The toast and the field's own error used to say "0 if owner-only", which contradicts
  // the field hint (owners included). All three now give the hint's instruction, and the
  // toast names the field as the panel labels it.
  it.each([
    ['en', en, 'owners included'],
    ['nl', nl, 'eigenaars meegeteld'],
    ['fr', fr, 'propriétaires inclus'],
  ])('asks for the headcount the way the field hint defines it (%s)', (_locale, messages, ownersIncluded) => {
    const copy = messages as {
      manualInput: {
        fields: { totalFte: string }
        totalFteHint: string
        validation: { fteRequired: string }
      }
      toast: Record<string, string>
    }
    const { title, description } = MANUAL_SUBMIT_VALIDATION_TOAST_KEYS.employeeCountMissing

    expect(copy.manualInput.totalFteHint).toContain(ownersIncluded)
    expect(copy.toast[description]).toContain(ownersIncluded)
    expect(copy.manualInput.validation.fteRequired).toContain(ownersIncluded)
    expect(copy.toast[title]).toContain(copy.manualInput.fields.totalFte)
  })
})

// Recalculations that bypass Calculate apply this on its own: it must be the same rule,
// exemptions included, not a stricter or looser copy.
describe('getManualEmployeeCountIssue', () => {
  it.each([
    ['an unknown headcount', { ownerManagers: 1 }, 'upswitch_adaptive', 'employeeCountMissing'],
    ['a cleared owner count', { ownerManagers: 0 }, 'upswitch_adaptive', 'employeeCountMissing'],
    ['a typed 0', { ownerManagers: 1, fteEmployees: 0 }, 'upswitch_adaptive', null],
    ['a sole trader', { businessStructure: 'sole-trader' }, 'upswitch_adaptive', null],
    ['a startup method', { ownerManagers: 1 }, 'startup_valuation', null],
  ])('treats %s like the submit check does', (_label, data, method, expected) => {
    expect(getManualEmployeeCountIssue(data, method)).toBe(expected)
  })
})
