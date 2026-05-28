import { describe, expect, it } from 'vitest'
import {
  isManualAgentNextCheckIntegrations,
  isManualAgentNextDeepenReport,
  isManualAgentNextPrepareListing,
  isManualAgentNextProfileBuyers,
  isManualAgentNextRunValuation,
  MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT,
  MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT,
  MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT,
  MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT,
  MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT,
  resolveManualAgentNextPrompt,
  stripAgentNextFromHref,
} from './manualAgentNextHandoff'

describe('manualAgentNextHandoff', () => {
  it('recognizes only the run valuation handoff intent', () => {
    expect(isManualAgentNextRunValuation('run_valuation')).toBe(true)
    expect(isManualAgentNextRunValuation(' run_valuation ')).toBe(true)
    expect(isManualAgentNextRunValuation('start_valuation')).toBe(false)
    expect(isManualAgentNextRunValuation(undefined)).toBe(false)
  })

  it('recognizes the buyer-profiling handoff intent and assistant action alias', () => {
    expect(isManualAgentNextProfileBuyers('profile_buyers')).toBe(true)
    expect(isManualAgentNextProfileBuyers(' profile-buyers ')).toBe(true)
    expect(isManualAgentNextProfileBuyers('profileBuyers')).toBe(true)
    expect(isManualAgentNextProfileBuyers('run_valuation')).toBe(false)
    expect(isManualAgentNextProfileBuyers(undefined)).toBe(false)
  })

  it('recognizes the post-valuation listing-prep handoff intent', () => {
    expect(isManualAgentNextPrepareListing('prepare_listing')).toBe(true)
    expect(isManualAgentNextPrepareListing(' prepare-listing ')).toBe(true)
    expect(isManualAgentNextPrepareListing('prepareListing')).toBe(true)
    expect(isManualAgentNextPrepareListing('profile_buyers')).toBe(false)
    expect(isManualAgentNextPrepareListing(undefined)).toBe(false)
  })

  it('recognizes report-deepening and integration-check handoff intents', () => {
    expect(isManualAgentNextDeepenReport('deepen_report')).toBe(true)
    expect(isManualAgentNextDeepenReport('deepen-report')).toBe(true)
    expect(isManualAgentNextDeepenReport('deepenReport')).toBe(true)
    expect(isManualAgentNextDeepenReport('prepare_listing')).toBe(false)
    expect(isManualAgentNextCheckIntegrations('check_integrations')).toBe(true)
    expect(isManualAgentNextCheckIntegrations('check-integrations')).toBe(true)
    expect(isManualAgentNextCheckIntegrations('checkIntegrations')).toBe(true)
    expect(isManualAgentNextCheckIntegrations('deepen_report')).toBe(false)
  })

  it('uses a stable prompt for the Venus assistant handoff', () => {
    expect(MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT).toBe('Run the valuation for this client.')
  })

  it('uses an explicit buyer-profiling prompt after an AI-approved valuation run', () => {
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('Profile likely buyers')
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('listing preview')
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('buyer profile')
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('until I ask to publish')
  })

  it('uses a listing-prep prompt that keeps publication approval explicit', () => {
    expect(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT).toContain('Profile likely buyers')
    expect(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT).toContain('listing preview')
    expect(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT).toContain('buyer profile')
    expect(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT).toContain('private draft')
    expect(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT).toContain('Do not publish')
  })

  it('uses broad M&A copilot prompts for report deepening and integrations', () => {
    expect(MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT).toContain('registry context')
    expect(MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT).toContain('buyer-readiness')
    expect(MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT).toContain('Propose approvals')
    expect(MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT).toContain('Silverfin')
    expect(MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT).toContain('Yuki')
    expect(MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT).toContain('Exact')
    expect(MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT).toContain('Octopus')
  })

  it('resolves URL handoff intents to the prompt sent into the assistant drawer', () => {
    expect(resolveManualAgentNextPrompt('run_valuation')).toBe(
      MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT
    )
    expect(resolveManualAgentNextPrompt('profile_buyers')).toBe(
      MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT
    )
    expect(resolveManualAgentNextPrompt('profileBuyers')).toBe(
      MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT
    )
    expect(resolveManualAgentNextPrompt('prepare_listing')).toBe(
      MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT
    )
    expect(resolveManualAgentNextPrompt('deepen_report')).toBe(
      MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT
    )
    expect(resolveManualAgentNextPrompt('check_integrations')).toBe(
      MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT
    )
    expect(resolveManualAgentNextPrompt('unknown')).toBeNull()
  })

  it('strips only agent_next from the current URL while preserving the rest', () => {
    expect(
      stripAgentNextFromHref(
        'https://valuation.upswitch.app/en/reports/val_123?flow=manual&agent_next=run_valuation&drawer=open#ready'
      )
    ).toBe('/en/reports/val_123?flow=manual&drawer=open#ready')
  })

  it('also strips the assistant handoff alias after consumption', () => {
    expect(
      stripAgentNextFromHref(
        'https://valuation.upswitch.app/en/reports/val_123?source=mercury&ai_next=profileBuyers&drawer=open'
      )
    ).toBe('/en/reports/val_123?source=mercury&drawer=open')
  })
})
