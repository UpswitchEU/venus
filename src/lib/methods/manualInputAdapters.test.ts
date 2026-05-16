import { describe, expect, it } from 'vitest'
import {
  getManualInputMethodAdapter,
  getRequiredManualInputMethodAdapter,
  MANUAL_INPUT_METHOD_ADAPTERS,
} from './manualInputAdapters'
import { METHOD_SPECS } from './registry'

describe('manual input method adapters', () => {
  it('registers DCF behind the canonical method key', () => {
    expect(MANUAL_INPUT_METHOD_ADAPTERS.dcf.key).toBe('dcf')
    expect(getManualInputMethodAdapter('dcf')?.key).toBe('dcf')
    expect(getRequiredManualInputMethodAdapter('dcf').key).toBe('dcf')
  })

  it('registers SDE behind the canonical method key', () => {
    expect(MANUAL_INPUT_METHOD_ADAPTERS.sde_multiple.key).toBe('sde_multiple')
    expect(getManualInputMethodAdapter('sde_multiple')?.key).toBe('sde_multiple')
    expect(getRequiredManualInputMethodAdapter('sde_multiple').key).toBe('sde_multiple')
  })

  it('does not claim adapters for methods that have not been migrated yet', () => {
    expect(getManualInputMethodAdapter('ebitda_multiple')).toBeUndefined()
    expect(getManualInputMethodAdapter('adjusted_nav')).toBeUndefined()
  })

  it('keeps registered adapter keys aligned with known method specs', () => {
    for (const key of Object.keys(MANUAL_INPUT_METHOD_ADAPTERS)) {
      expect(METHOD_SPECS[key], `adapter registered for unknown method ${key}`).toBeDefined()
    }
  })
})
