import { describe, expect, it } from 'vitest'

import type { ValuationResponse } from '../../types/valuation'
import { extractPresentationContract } from './SessionValuationOutputNormalizer'

const wellFormed = {
  tier: 'defensible',
  tierLabel: 'Defensible valuation',
  tierDescription: 'Grounded in your real financials.',
  display: 'point_and_band',
  showPointEstimate: true,
  pointEstimateBasis: 'policy',
  bandFloorWidth: 0.15,
  confidence: 'medium',
  confidenceLabel: 'Medium confidence',
  disclaimer: 'Defensible valuation grounded in your financials.',
}

// The function reads off a ValuationResponse-shaped record; tests pass loose
// objects (the engine wire shape) and cast, mirroring the rest of the suite.
const withContract = (raw: unknown): ValuationResponse =>
  ({ presentation_contract: raw }) as unknown as ValuationResponse

describe('extractPresentationContract (BET-462)', () => {
  it('returns null when there is no result or no contract', () => {
    expect(extractPresentationContract(null)).toBeNull()
    expect(extractPresentationContract(undefined)).toBeNull()
    expect(extractPresentationContract({} as ValuationResponse)).toBeNull()
  })

  it('parses a well-formed point_and_band contract through', () => {
    const out = extractPresentationContract(withContract(wellFormed))
    expect(out).toEqual({
      tier: 'defensible',
      tierLabel: 'Defensible valuation',
      tierDescription: 'Grounded in your real financials.',
      display: 'point_and_band',
      showPointEstimate: true,
      pointEstimateBasis: 'policy',
      bandFloorWidth: 0.15,
      confidence: 'medium',
      confidenceLabel: 'Medium confidence',
      disclaimer: 'Defensible valuation grounded in your financials.',
    })
  })

  it('reads the camelCase `presentationContract` key too', () => {
    const result = { presentationContract: wellFormed } as unknown as ValuationResponse
    expect(extractPresentationContract(result)?.tier).toBe('defensible')
  })

  it('reads a contract nested under `details`', () => {
    const result = {
      details: { presentation_contract: wellFormed },
    } as unknown as ValuationResponse
    expect(extractPresentationContract(result)?.tier).toBe('defensible')
  })

  it('coerces an indicative tier to band_only even if the wire says point_and_band', () => {
    const out = extractPresentationContract(
      withContract({ ...wellFormed, tier: 'indicative', display: 'point_and_band' })
    )
    expect(out?.display).toBe('band_only')
    expect(out?.showPointEstimate).toBe(false)
  })

  it('never lets a malformed/incomplete contract over-state confidence (→ null)', () => {
    for (const bad of [
      null,
      'defensible',
      { ...wellFormed, tier: 'platinum' },
      { ...wellFormed, tierLabel: '   ' },
      { ...wellFormed, confidenceLabel: undefined },
      { ...wellFormed, disclaimer: '' },
    ]) {
      expect(extractPresentationContract(withContract(bad))).toBeNull()
    }
  })

  it('defaults soft fields conservatively (bad floor → 0.3, bad confidence → low)', () => {
    const out = extractPresentationContract(
      withContract({
        ...wellFormed,
        bandFloorWidth: 5,
        confidence: 'nonsense',
        display: 'garbage',
        showPointEstimate: true,
      })
    )
    expect(out?.bandFloorWidth).toBe(0.3)
    expect(out?.confidence).toBe('low')
    expect(out?.display).toBe('band_only')
    expect(out?.showPointEstimate).toBe(false)
  })
})
