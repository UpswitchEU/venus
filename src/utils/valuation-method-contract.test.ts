import { describe, expect, it } from 'vitest'
import contract from '../../tests/contracts/valuation-methods.v1.json'
import * as compiledRegistry from '../../vendor/types/dist/esm/valuation-methods.js'
import * as registry from '../../vendor/types/src/valuation-methods'

describe('engine-owned valuation method contract', () => {
  it('ships the same method registry in the compiled package', () => {
    expect(compiledRegistry.VALUATION_RESULT_METHOD_KEYS).toEqual(
      registry.VALUATION_RESULT_METHOD_KEYS
    )
    expect(compiledRegistry.VALUATION_METHOD_KEYS).toEqual(registry.VALUATION_METHOD_KEYS)
    expect(compiledRegistry.VALUATION_METHOD_ALIASES).toEqual(registry.VALUATION_METHOD_ALIASES)
  })
  it('keeps request methods aligned with the engine', () => {
    expect([...registry.VALUATION_METHOD_KEYS]).toEqual(contract.requestKeys)
  })
  it('accepts every engine result, including governed holding SOTP', () => {
    expect([...registry.VALUATION_RESULT_METHOD_KEYS].sort()).toEqual(
      [...contract.resultKeys].sort()
    )
    expect(registry.VALUATION_METHOD_KEYS).not.toContain('holding_sotp')
  })
  it('preserves weighting, aliases, standalone methods and UI order', () => {
    expect([...registry.USER_WEIGHT_VALUATION_METHOD_KEYS].sort()).toEqual(contract.userWeightKeys)
    expect([...registry.NON_COMBINABLE_VALUATION_METHOD_KEYS].sort()).toEqual(
      contract.nonCombinableKeys
    )
    expect(registry.VALUATION_METHOD_ALIASES).toEqual(contract.aliases)
    expect([...registry.VALUATION_PRIMARY_OMNI_METHOD_ORDER]).toEqual(contract.primaryOrder)
    expect([...registry.OMNI_CALC_PATCHABLE_METHODS]).toEqual(contract.patchableKeys)
    expect(registry.DISTINCT_VALUATION_METHOD_COUNT).toBe(contract.distinctMethodCount)
  })
})
