import { describe, expect, it } from 'vitest'
import { defaultPlanFeatures } from './useCredits'

describe('useCredits plan fallback gates', () => {
  it('treats legacy paid advisor aliases as Starter: manual/file features yes, integrations no', () => {
    for (const alias of ['accountant_paid', 'accountant_pro', 'accountant_starter']) {
      expect(defaultPlanFeatures(alias)).toMatchObject({
        ebitda_normalization: true,
        version_control: true,
        audit_trail: true,
        integrations_enabled: false,
        valuation_synthesis: true,
        valuation_download: true,
        live_benelux_sector_multiples: true,
        team_seat_addons: true,
      })
    }
  })

  it('keeps Pro+ aliases on the integration-enabled side of the split', () => {
    expect(defaultPlanFeatures('pro').integrations_enabled).toBe(true)
    expect(defaultPlanFeatures('accountant_expert').integrations_enabled).toBe(true)
    expect(defaultPlanFeatures('accountant_enterprise').integrations_enabled).toBe(true)
  })

  it('keeps free aliases integration-disabled and paid features locked', () => {
    expect(defaultPlanFeatures('accountant_free')).toMatchObject({
      ebitda_normalization: false,
      version_control: false,
      audit_trail: false,
      integrations_enabled: false,
      valuation_synthesis: false,
      valuation_download: false,
    })
  })
})
