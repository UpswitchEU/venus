import { describe, expect, it } from 'vitest'
import { normalizeAccountantPlanTypeKey } from '../constants/accountantPlanMethods'
import { defaultPlanFeatures, resolvePlanFeatures } from './useCredits'

describe('useCredits plan fallback gates', () => {
  it('normalizes owner and advisor launch aliases before feature fallback', () => {
    expect(normalizeAccountantPlanTypeKey('owner_free')).toBe('free')
    expect(normalizeAccountantPlanTypeKey('grow')).toBe('owner_grow')
    expect(normalizeAccountantPlanTypeKey('owner_grow')).toBe('owner_grow')
    expect(normalizeAccountantPlanTypeKey('sell')).toBe('owner_sell')
    expect(normalizeAccountantPlanTypeKey('premium')).toBe('owner_sell')
    expect(normalizeAccountantPlanTypeKey('accountant_paid')).toBe('starter')
    expect(normalizeAccountantPlanTypeKey('accountant_pro')).toBe('starter')
  })

  it('treats legacy paid advisor aliases as Starter: manual/file features yes, integrations no', () => {
    for (const alias of ['accountant_paid', 'accountant_pro', 'accountant_starter']) {
      expect(defaultPlanFeatures(alias)).toMatchObject({
        ebitda_normalization: true,
        tax_latencies: true,
        version_control: true,
        audit_trail: true,
        integrations_enabled: false,
        valuation_synthesis: true,
        valuation_download: true,
        live_benelux_sector_multiples: true,
        team_seat_addons: false,
      })
    }
  })

  it('mirrors Titan owner Free/Grow and advisor Starter/Pro feature gates', () => {
    expect(defaultPlanFeatures('owner_free')).toMatchObject({
      ebitda_normalization: false,
      tax_latencies: true,
      version_control: false,
      audit_trail: false,
      integrations_enabled: false,
      valuation_synthesis: false,
      valuation_download: false,
      live_benelux_sector_multiples: false,
      team_seat_addons: false,
    })

    expect(defaultPlanFeatures('owner_grow')).toMatchObject({
      ebitda_normalization: true,
      tax_latencies: true,
      version_control: true,
      audit_trail: true,
      integrations_enabled: true,
      valuation_synthesis: true,
      valuation_download: true,
      live_benelux_sector_multiples: true,
      team_seat_addons: false,
    })

    expect(defaultPlanFeatures('starter')).toMatchObject({
      integrations_enabled: false,
      valuation_synthesis: true,
      valuation_download: true,
      live_benelux_sector_multiples: true,
      team_seat_addons: false,
    })

    expect(defaultPlanFeatures('pro')).toMatchObject({
      integrations_enabled: true,
      valuation_synthesis: true,
      valuation_download: true,
      live_benelux_sector_multiples: true,
      team_seat_addons: false,
    })
  })

  it('keeps Pro+ aliases on the integration-enabled side of the split', () => {
    expect(defaultPlanFeatures('pro').integrations_enabled).toBe(true)
    expect(defaultPlanFeatures('accountant_expert').integrations_enabled).toBe(true)
    expect(defaultPlanFeatures('accountant_enterprise').integrations_enabled).toBe(true)
  })

  it('keeps owner Grow aligned with advisor Pro valuation capabilities', () => {
    expect(defaultPlanFeatures('owner_grow')).toEqual(defaultPlanFeatures('pro'))
  })

  it('fills omitted optional feature keys from the Grow baseline instead of downgrading them', () => {
    expect(
      resolvePlanFeatures('owner_grow', {
        ebitda_normalization: true,
        tax_latencies: true,
        version_control: true,
        audit_trail: true,
        integrations_enabled: true,
      })
    ).toMatchObject({
      valuation_synthesis: true,
      valuation_download: true,
      live_benelux_sector_multiples: true,
      team_seat_addons: false,
    })
  })

  it('keeps free aliases integration-disabled and paid features locked', () => {
    expect(defaultPlanFeatures('accountant_free')).toMatchObject({
      ebitda_normalization: false,
      tax_latencies: true,
      version_control: false,
      audit_trail: false,
      integrations_enabled: false,
      valuation_synthesis: false,
      valuation_download: false,
    })
  })
})
