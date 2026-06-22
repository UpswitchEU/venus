import { describe, expect, it } from 'vitest'
import type { BusinessTypeSegmentInput } from '../../../types/valuation'
import {
  buildBusinessTypeSegmentRows,
  updateBusinessTypeSegmentField,
} from './BasicInformationSegmentsModel'

function segment(overrides: Partial<BusinessTypeSegmentInput> = {}): BusinessTypeSegmentInput {
  return {
    business_type_id: 'consulting',
    business_type_title: 'Consulting',
    basis: 'EBITDA',
    applied_multiple: 4.75,
    ...overrides,
  }
}

describe('BasicInformationSegmentsModel', () => {
  it('updates only the selected segment and normalizes blank editor values to null', () => {
    const segments = [
      segment({ business_type_id: 'software', earnings: '100000' }),
      segment({ business_type_id: 'consulting', weight: '40' }),
    ]

    expect(updateBusinessTypeSegmentField(segments, 1, 'weight', '   ')).toEqual([
      segments[0],
      { ...segments[1], weight: null },
    ])
    expect(updateBusinessTypeSegmentField(segments, 0, 'multiple', '5.2')).toEqual([
      { ...segments[0], multiple: '5.2' },
      segments[1],
    ])
  })

  it('builds stable row presentation with explicit overrides taking precedence', () => {
    const rows = buildBusinessTypeSegmentRows([
      segment({
        business_type_id: 'software',
        business_type_title: 'Software',
        basis: undefined,
        earnings_basis: 'Revenue',
        multiple: 6.25,
        applied_multiple: 4.75,
        weight: '70',
      }),
      segment({
        business_type_id: 'services',
        business_type_title: undefined,
        basis: undefined,
        earnings_basis: undefined,
        multiple: null,
        applied_multiple: '3.5',
      }),
    ])

    expect(rows).toEqual([
      {
        key: 'software-0',
        title: 'Software',
        basis: 'Revenue',
        earningsLabel: 'Revenue earnings',
        multiplePlaceholder: '6.3',
        weightValue: '70',
      },
      {
        key: 'services-1',
        title: 'services',
        basis: undefined,
        earningsLabel: 'Segment earnings',
        multiplePlaceholder: '3.5',
        weightValue: 50,
      },
    ])
  })
})
