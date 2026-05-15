// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualTaxLatencySignature } from './manualTaxLatencySignature'

describe('manualTaxLatencySignature', () => {
  it('signatures latency recalculation inputs in deterministic id order', () => {
    expect(
      buildManualTaxLatencySignature([
        {
          id: 'b',
          type: 'passive',
          description: 'B',
          temporaryDifference: 200,
          taxRate: 25,
        },
        {
          id: 'a',
          type: 'active',
          description: 'A',
          temporaryDifference: 100,
          taxRate: 20,
        },
      ])
    ).toBe(
      '[{"id":"a","type":"active","temporaryDifference":100,"taxRate":20},{"id":"b","type":"passive","temporaryDifference":200,"taxRate":25}]'
    )
  })
})
