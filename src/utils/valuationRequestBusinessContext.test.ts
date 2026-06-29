// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import {
  isExplicitUserDcfIntent,
  resolveDcfTerminalAssumptions,
} from './valuationRequestBusinessContext'

describe('isExplicitUserDcfIntent', () => {
  it('returns true when user_weights include DCF', () => {
    expect(
      isExplicitUserDcfIntent(
        {},
        { user_weights: { dcf: 70, ebitda_multiple: 30 } } as ValuationFormData,
        0
      )
    ).toBe(true)
  })

  it('returns false for auto-seeded WACC alone', () => {
    expect(isExplicitUserDcfIntent({ dcf_wacc_pct: 10.5 }, {} as ValuationFormData, 0)).toBe(false)
  })

  it('returns true for FCFF-only mode', () => {
    expect(
      isExplicitUserDcfIntent({ dcf_input_mode: 'fcff_only' }, {} as ValuationFormData, 0)
    ).toBe(true)
  })

  it('returns true when session JSONB pre-selected methods include DCF', () => {
    expect(
      isExplicitUserDcfIntent(
        {},
        {
          _pre_selected_valuation_methods: ['ebitda_multiple', 'dcf'],
        } as ValuationFormData,
        0
      )
    ).toBe(true)
  })
})

describe('resolveDcfTerminalAssumptions', () => {
  it('omits a stale non-DCF WACC placeholder instead of blocking the request', () => {
    expect(resolveDcfTerminalAssumptions({ dcf_wacc_pct: 0 })).toEqual({
      method: 'perpetual_growth',
      terminalGrowthPct: undefined,
      exitMultiple: undefined,
      hasTerminalInput: false,
    })
  })

  it('rejects non-positive WACC when DCF terminal assumptions are present', () => {
    expect(() =>
      resolveDcfTerminalAssumptions({
        dcf_wacc_pct: 0,
        dcf_terminal_growth_pct: 2,
      })
    ).toThrow('DCF WACC must be greater than 0%')
  })

  it('rejects perpetual-growth terminal assumptions when terminal growth is not below WACC', () => {
    expect(() =>
      resolveDcfTerminalAssumptions({
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 9,
      })
    ).toThrow('Terminal growth must be lower than WACC')
  })

  it('forces perpetual growth for FCFF-only mode even when an exit multiple is restored', () => {
    expect(
      resolveDcfTerminalAssumptions({
        dcf_input_mode: 'fcff_only',
        dcf_wacc_pct: '10,5',
        dcf_terminal_growth_pct: '2,25',
        dcf_exit_multiple: '7,0',
        dcf_terminal_value_method: 'exit_multiple',
      })
    ).toEqual({
      method: 'perpetual_growth',
      waccPct: 10.5,
      terminalGrowthPct: 2.25,
      hasTerminalInput: true,
    })
  })

  it('uses exit multiple only for exit-multiple terminal value', () => {
    expect(
      resolveDcfTerminalAssumptions({
        dcf_terminal_value_method: 'exit_multiple',
        dcf_wacc_pct: 11,
        dcf_terminal_growth_pct: 4,
        dcf_exit_multiple: 6.5,
      })
    ).toEqual({
      method: 'exit_multiple',
      waccPct: 11,
      exitMultiple: 6.5,
      hasTerminalInput: true,
    })
  })
})
