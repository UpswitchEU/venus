import { describe, expect, it } from 'vitest'
import {
  MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT,
  MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT,
  isManualAgentNextRunValuation,
  stripAgentNextFromHref,
} from './manualAgentNextHandoff'

describe('manualAgentNextHandoff', () => {
  it('recognizes only the run valuation handoff intent', () => {
    expect(isManualAgentNextRunValuation('run_valuation')).toBe(true)
    expect(isManualAgentNextRunValuation(' run_valuation ')).toBe(true)
    expect(isManualAgentNextRunValuation('start_valuation')).toBe(false)
    expect(isManualAgentNextRunValuation(undefined)).toBe(false)
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

  it('strips only agent_next from the current URL while preserving the rest', () => {
    expect(
      stripAgentNextFromHref(
        'https://valuation.upswitch.app/en/reports/val_123?flow=manual&agent_next=run_valuation&drawer=open#ready'
      )
    ).toBe('/en/reports/val_123?flow=manual&drawer=open#ready')
  })
})
