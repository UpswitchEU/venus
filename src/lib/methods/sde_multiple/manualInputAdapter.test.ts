import { describe, expect, it } from 'vitest'
import { sdeManualInputAdapter } from './manualInputAdapter'

describe('sdeManualInputAdapter', () => {
  it('is bound to the canonical SDE method key', () => {
    expect(sdeManualInputAdapter.key).toBe('sde_multiple')
  })

  it('activates owner-compensation input when SDE is selected', () => {
    expect(sdeManualInputAdapter.deriveOwnerCompensationSectionActive(['sde_multiple'])).toBe(true)
    expect(
      sdeManualInputAdapter.deriveOwnerCompensationSectionActive([
        'dcf',
        'sde_multiple',
        'adjusted_nav',
      ])
    ).toBe(true)
  })

  it('does not activate owner-compensation input for other method selections', () => {
    expect(sdeManualInputAdapter.deriveOwnerCompensationSectionActive([])).toBe(false)
    expect(sdeManualInputAdapter.deriveOwnerCompensationSectionActive(['dcf'])).toBe(false)
    expect(sdeManualInputAdapter.deriveOwnerCompensationSectionActive(['adjusted_nav'])).toBe(false)
  })
})
