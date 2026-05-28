import { describe, expect, it } from 'vitest'
import {
  normalizeValuationResultEnvelope,
  resolveAcademicValidationIssues,
} from './resolveAcademicValidationIssues'

describe('resolveAcademicValidationIssues', () => {
  it('prefers top-level issues', () => {
    expect(
      resolveAcademicValidationIssues({
        academic_validation_issues: ['Top-level issue'],
        details: { academic_validation_issues: ['Nested issue'] },
      }),
    ).toEqual(['Top-level issue'])
  })

  it('reads from details when top-level is absent', () => {
    expect(
      resolveAcademicValidationIssues({
        details: { academic_validation_issues: ['WACC outside SME band'] },
      }),
    ).toEqual(['WACC outside SME band'])
  })

  it('falls back to validation_warnings messages', () => {
    expect(
      resolveAcademicValidationIssues({
        validation_warnings: [{ type: 'wacc', severity: 'high', message: 'WACC out of band' }],
      }),
    ).toEqual(['WACC out of band'])
  })

  it('returns undefined when no issues', () => {
    expect(resolveAcademicValidationIssues(null)).toBeUndefined()
    expect(resolveAcademicValidationIssues({ details: {} })).toBeUndefined()
  })
})

describe('normalizeValuationResultEnvelope', () => {
  it('hoists nested issues to top-level and details', () => {
    const out = normalizeValuationResultEnvelope({
      valuation_id: 'v1',
      details: { academic_validation_issues: ['Nested only'] },
    } as never)

    expect(out.academic_validation_issues).toEqual(['Nested only'])
    expect(out.details?.academic_validation_issues).toEqual(['Nested only'])
  })
})
