import { describe, expect, it } from 'vitest'

import { deepEqual } from './deepEqual'

describe('deepEqual', () => {
  it('matches nested arrays and objects by value', () => {
    expect(
      deepEqual(
        { rows: [{ year: 2026, values: [1, 2, 3] }] },
        { rows: [{ year: 2026, values: [1, 2, 3] }] }
      )
    ).toBe(true)
  })

  it('rejects missing keys and changed nested values', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
  })

  it('distinguishes objects from null and primitives', () => {
    expect(deepEqual(null, {})).toBe(false)
    expect(deepEqual(1, '1')).toBe(false)
  })
})
