import { describe, expect, it } from 'vitest'
import {
  isManualAgentNextProfileBuyers,
  isManualAgentNextRunValuation,
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

  it('uses a stable prompt for the Venus assistant handoff', () => {
    expect(MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT).toBe('Run the valuation for this client.')
  })

  it('uses an explicit buyer-profiling prompt after an AI-approved valuation run', () => {
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('Profile likely buyers')
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('listing preview')
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('buyer profile')
    expect(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT).toContain('until I ask to publish')
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
