import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOOTSTRAP_CREDIT_ERROR,
  evaluateBootstrapCreditPolicy,
  evaluateBootstrapReportIdentity,
  hasMeaningfulBootstrapPrefill,
} from './BootstrapProviderModel'
import type { CreditStatus, PrefillData } from './types'
import { DEFAULT_PREFILL } from './types'

function makePrefill(overrides: Partial<PrefillData> = {}): PrefillData {
  return {
    ...DEFAULT_PREFILL,
    ...overrides,
  }
}

function deniedCreditStatus(overrides: Partial<CreditStatus> = {}): CreditStatus {
  return {
    allowed: false,
    credits_remaining: 0,
    credits_limit: 0,
    requires_upgrade: true,
    ...overrides,
  }
}

describe('evaluateBootstrapReportIdentity', () => {
  it('accepts missing requested ids and exact report id matches', () => {
    expect(
      evaluateBootstrapReportIdentity({
        requestedReportId: undefined,
        returnedReportId: 'report-a',
        reportMode: 'existing',
      })
    ).toMatchObject({ kind: 'match', requestedId: null, returnedId: 'report-a' })

    expect(
      evaluateBootstrapReportIdentity({
        requestedReportId: ' report-a ',
        returnedReportId: 'report-a',
        reportMode: 'existing',
      })
    ).toMatchObject({ kind: 'match', requestedId: 'report-a', returnedId: 'report-a' })
  })

  it('accepts the new-report id mint path', () => {
    expect(
      evaluateBootstrapReportIdentity({
        requestedReportId: 'new',
        returnedReportId: 'server-minted-report',
        reportMode: 'new',
      })
    ).toEqual({
      kind: 'expected-mint',
      requestedId: 'new',
      returnedId: 'server-minted-report',
    })
  })

  it('rejects mismatched report ids with the provider-facing error message', () => {
    expect(
      evaluateBootstrapReportIdentity({
        requestedReportId: 'requested-report',
        returnedReportId: 'returned-report',
        reportMode: 'existing',
      })
    ).toEqual({
      kind: 'mismatch',
      requestedId: 'requested-report',
      returnedId: 'returned-report',
      reportMode: 'existing',
      message:
        'Report not available: requested requeste but resolved returned. ' +
        'The report may not exist, you may not have access, or your session may be stale.',
    })
  })

  it('rejects a new-report response that does not return the minted id', () => {
    expect(
      evaluateBootstrapReportIdentity({
        requestedReportId: 'new',
        returnedReportId: '',
        reportMode: 'new',
      })
    ).toMatchObject({
      kind: 'mismatch',
      requestedId: 'new',
      returnedId: null,
    })
  })
})

describe('evaluateBootstrapCreditPolicy', () => {
  it('allows bootstraps when no credit status exists or credits are allowed', () => {
    expect(
      evaluateBootstrapCreditPolicy({
        creditStatus: undefined,
        reportMode: 'new',
      })
    ).toEqual({ kind: 'allow' })

    expect(
      evaluateBootstrapCreditPolicy({
        creditStatus: deniedCreditStatus({ allowed: true, requires_upgrade: false }),
        reportMode: 'new',
      })
    ).toEqual({ kind: 'allow' })
  })

  it('blocks new report creation when credits are exhausted', () => {
    const creditStatus = deniedCreditStatus({ message: 'Upgrade required' })

    expect(
      evaluateBootstrapCreditPolicy({
        creditStatus,
        reportMode: 'new',
      })
    ).toEqual({
      kind: 'block-new-report',
      creditStatus,
      message: 'Upgrade required',
    })
  })

  it('uses the canonical fallback message when Titan omits a credit message', () => {
    expect(
      evaluateBootstrapCreditPolicy({
        creditStatus: deniedCreditStatus(),
        reportMode: 'new',
      })
    ).toMatchObject({
      kind: 'block-new-report',
      message: DEFAULT_BOOTSTRAP_CREDIT_ERROR,
    })
  })

  it('keeps completed reports viewable when credits are exhausted', () => {
    const creditStatus = deniedCreditStatus()

    expect(
      evaluateBootstrapCreditPolicy({
        creditStatus,
        reportMode: 'existing',
      })
    ).toEqual({
      kind: 'allow-existing-report-with-credit-warning',
      creditStatus,
    })
  })
})

describe('hasMeaningfulBootstrapPrefill', () => {
  it('returns false for an empty default prefill payload', () => {
    expect(hasMeaningfulBootstrapPrefill(makePrefill())).toBe(false)
  })

  it('recognizes populated field metadata and confidence as meaningful', () => {
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ fieldsPopulated: ['company_name'] }))).toBe(
      true
    )
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ confidence: 0.05 }))).toBe(true)
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ confidence: 0.049 }))).toBe(false)
  })

  it('recognizes company, KBO, business type, and financial prefill data', () => {
    expect(
      hasMeaningfulBootstrapPrefill(makePrefill({ companyInfo: { companyName: 'Venus BV' } }))
    ).toBe(true)
    expect(
      hasMeaningfulBootstrapPrefill(
        makePrefill({ kboData: { kboNumber: '0123456789', companyName: 'Venus BV' } })
      )
    ).toBe(true)
    expect(
      hasMeaningfulBootstrapPrefill(
        makePrefill({ businessType: { id: 'professional-services', title: 'Services' } })
      )
    ).toBe(true)
    expect(
      hasMeaningfulBootstrapPrefill(makePrefill({ financials: { yearData: { 2025: {} } } }))
    ).toBe(true)
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ financials: { revenue: 0 } }))).toBe(true)
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ financials: { ebitda: 0 } }))).toBe(true)
  })

  it('ignores whitespace company names and non-finite financial values', () => {
    expect(
      hasMeaningfulBootstrapPrefill(makePrefill({ companyInfo: { companyName: '   ' } }))
    ).toBe(false)
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ financials: { revenue: NaN } }))).toBe(false)
    expect(hasMeaningfulBootstrapPrefill(makePrefill({ financials: { ebitda: Infinity } }))).toBe(
      false
    )
  })
})
