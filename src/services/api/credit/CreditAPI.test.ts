import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpClient } from '../HttpClient'
import { CreditAPI } from './CreditAPI'

type ExecuteRequestTarget = {
  executeRequest: () => Promise<unknown>
}

const executeRequestSpy = vi.spyOn(
  HttpClient.prototype as unknown as ExecuteRequestTarget,
  'executeRequest'
)

describe('CreditAPI.getUserPlan', () => {
  beforeEach(() => {
    executeRequestSpy.mockReset()
  })

  afterAll(() => {
    executeRequestSpy.mockRestore()
  })

  it('preserves omitted optional plan feature keys for plan-baseline fallback', async () => {
    executeRequestSpy.mockResolvedValue({
      plan_type: 'owner_grow',
      creditsRemaining: 10,
      creditsLimit: 10,
      plan_features: {
        ebitda_normalization: true,
        tax_latencies: true,
        version_control: true,
        audit_trail: true,
        integrations_enabled: true,
      },
    })

    const plan = await new CreditAPI('https://api.example.test').getUserPlan()

    expect(plan.plan_features).toMatchObject({
      ebitda_normalization: true,
      tax_latencies: true,
      version_control: true,
      audit_trail: true,
      integrations_enabled: true,
    })
    expect(plan.plan_features).not.toHaveProperty('valuation_synthesis')
    expect(plan.plan_features).not.toHaveProperty('valuation_download')
    expect(plan.plan_features).not.toHaveProperty('live_benelux_sector_multiples')
  })
})
