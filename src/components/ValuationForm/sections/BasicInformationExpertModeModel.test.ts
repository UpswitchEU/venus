import { describe, expect, it } from 'vitest'
import { shouldDefaultBasicInformationExpertMode } from './BasicInformationExpertModeModel'

describe('shouldDefaultBasicInformationExpertMode', () => {
  it('defaults Grow owners into expert controls without advisor audience role', () => {
    expect(
      shouldDefaultBasicInformationExpertMode({
        isAccountantForClient: false,
        planType: 'owner_grow',
        userRole: 'seller',
      })
    ).toBe(true)
  })

  it('keeps free owners on the guided basic controls', () => {
    expect(
      shouldDefaultBasicInformationExpertMode({
        isAccountantForClient: false,
        planType: 'free',
        userRole: 'seller',
      })
    ).toBe(false)
  })

  it('defaults advisors and delegated client sessions into expert controls', () => {
    expect(
      shouldDefaultBasicInformationExpertMode({
        isAccountantForClient: false,
        planType: 'free',
        userRole: 'accountant',
      })
    ).toBe(true)
    expect(
      shouldDefaultBasicInformationExpertMode({
        isAccountantForClient: true,
        planType: 'free',
        userRole: 'seller',
      })
    ).toBe(true)
  })
})
