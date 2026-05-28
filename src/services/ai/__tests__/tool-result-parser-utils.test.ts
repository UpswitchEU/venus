import { describe, expect, it } from 'vitest'
import {
  arrayRecords,
  optionalString,
  optionalStringList,
  pendingRequest,
  recordValue,
  stringArray,
} from '../tool-result-parser-utils'

describe('tool-result-parser-utils', () => {
  it('re-exports shared ai-actions coercion helpers for loose envelopes', () => {
    expect(recordValue({ update: { field: 'ebitda' } })).toEqual({
      update: { field: 'ebitda' },
    })
    expect(recordValue(undefined)).toBeNull()
    expect(optionalString('KBO')).toBe('KBO')
    expect(optionalString(false)).toBeUndefined()
    expect(optionalStringList(['silverfin', 1, 'yuki'])).toEqual(['silverfin', 'yuki'])
    expect(stringArray(['exact', null, 'octopus'])).toEqual(['exact', 'octopus'])
  })

  it('keeps request extraction defensive for pending proposal envelopes', () => {
    expect(
      pendingRequest({
        status: 'pending_approval',
        request: { provider: 'silverfin' },
      })
    ).toEqual({ provider: 'silverfin' })
    expect(
      pendingRequest({
        status: 'blocked',
        request: { provider: 'silverfin' },
      })
    ).toBeNull()
    expect(arrayRecords([{ id: 'a' }, null, 'bad', { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
  })
})
