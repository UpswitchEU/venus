import { describe, expect, it } from 'vitest'
import { isValuationIdSameAsActiveReport, valuationIdsReferToSameReport } from '../identifiers'

describe('valuationIdsReferToSameReport', () => {
  it('matches UUID and session key when session links both', () => {
    const uuid = '3884436d-61f4-4333-aaaa-703b187c86d2'
    const sk = 'val_1777437324654_v5dbyp7vjv'
    expect(valuationIdsReferToSameReport(uuid, sk, { sessionReportId: uuid, sessionKey: sk })).toBe(
      true
    )
    expect(valuationIdsReferToSameReport(sk, uuid, { sessionReportId: uuid, sessionKey: sk })).toBe(
      true
    )
  })

  it('returns false for unrelated ids even with link object', () => {
    expect(
      valuationIdsReferToSameReport('val_a', 'val_b', {
        sessionReportId: 'u1',
        sessionKey: 'val_a',
      })
    ).toBe(false)
  })
})

describe('isValuationIdSameAsActiveReport', () => {
  it('accepts sidebar UUID when route segment is val_* and session ties them', () => {
    const uuid = '3884436d-61f4-4333-aaaa-703b187c86d2'
    const sk = 'val_1777437324654_v5dbyp7vjv'
    expect(
      isValuationIdSameAsActiveReport(uuid, {
        reportId: sk,
        resolvedReportId: uuid,
        sessionReportId: uuid,
        sessionKey: sk,
      })
    ).toBe(true)
  })
})
