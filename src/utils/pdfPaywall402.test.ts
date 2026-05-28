import { describe, expect, it } from 'vitest'
import { buildPdfPaywall402JsonBody } from './pdfPaywall402'

describe('buildPdfPaywall402JsonBody', () => {
  it('maps seller invite-advisor paywall', () => {
    expect(
      buildPdfPaywall402JsonBody({
        code: 'INVITE_ADVISOR_REQUIRED',
        message: 'Invite your advisor',
        action: 'invite_accountant',
      })
    ).toEqual({
      success: false,
      error: 'Invite your advisor',
      code: 'INVITE_ADVISOR_REQUIRED',
      action: 'invite_accountant',
      inviteAdvisorRequired: true,
    })
  })

  it('maps advisor Starter paywall', () => {
    expect(
      buildPdfPaywall402JsonBody({
        code: 'STARTER_REQUIRED',
        message: 'Upgrade to Starter',
        required_tier: 'starter',
      })
    ).toMatchObject({
      success: false,
      upgradeRequired: true,
      required_tier: 'starter',
    })
  })
})
