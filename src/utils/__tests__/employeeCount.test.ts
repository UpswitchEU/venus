import { describe, expect, it } from 'vitest'
import type { DataResponse } from '../../types/data-collection'
import { convertDataResponsesToFormData } from '../dataCollectionUtils'
import { parseEmployeeCount } from '../employeeCount'

function makeResponse(value: DataResponse['value']): DataResponse {
  return {
    fieldId: 'number_of_employees',
    value,
    method: 'conversational',
    confidence: 0.9,
    source: 'test',
    timestamp: new Date(),
  }
}

describe('parseEmployeeCount', () => {
  it('maps known employee ranges to their midpoint values', () => {
    expect(parseEmployeeCount('11-25')).toBe(18)
    expect(parseEmployeeCount(' 50-100 ')).toBe(75)
    expect(parseEmployeeCount('500+')).toBe(750)
  })

  it('preserves direct numeric employee counts', () => {
    expect(parseEmployeeCount('11')).toBe(11)
    expect(parseEmployeeCount(11)).toBe(11)
  })
})

describe('convertDataResponsesToFormData', () => {
  it('converts employee ranges without truncating to the lower bound', () => {
    const formData = convertDataResponsesToFormData([makeResponse('11-25')])

    expect(formData.number_of_employees).toBe(18)
  })

  it('keeps direct employee counts unchanged', () => {
    const formData = convertDataResponsesToFormData([makeResponse('11')])

    expect(formData.number_of_employees).toBe(11)
  })
})
