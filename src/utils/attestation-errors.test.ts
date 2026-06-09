import { describe, expect, it } from 'vitest'
import { resolveAttestationErrorDescription } from './attestation-errors'

describe('resolveAttestationErrorDescription', () => {
  it('maps not-finalized Titan errors to product copy', () => {
    expect(
      resolveAttestationErrorDescription(
        'only completed reports can be attested',
        'Finalize the report first'
      )
    ).toBe('Finalize the report first')
  })
})
