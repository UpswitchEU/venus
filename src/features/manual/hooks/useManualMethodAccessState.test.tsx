import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlanFeatureFlags } from '../../../hooks/useCredits'
import { useManualMethodAccessState } from './useManualMethodAccessState'

const unlockedFeatures: PlanFeatureFlags = {
  ebitda_normalization: true,
  tax_latencies: true,
  version_control: true,
  audit_trail: true,
  integrations_enabled: true,
  valuation_synthesis: true,
  valuation_download: true,
  live_benelux_sector_multiples: true,
  team_seat_addons: false,
}

function renderAccess(overrides: Partial<Parameters<typeof useManualMethodAccessState>[0]> = {}) {
  return renderHook(() =>
    useManualMethodAccessState({
      allowedMethodKeys: null,
      formStoreData: {},
      isAccountantFlow: false,
      isAccountantMode: false,
      planFeatures: null,
      planType: null,
      selectedMethod: 'dcf',
      userRole: 'seller',
      ...overrides,
    })
  )
}

describe('useManualMethodAccessState plan gates', () => {
  it('fails closed for PDF download while plan features are unresolved', () => {
    const { result } = renderAccess({ planFeatures: null })
    expect(result.current.canDownloadPdf).toBe(false)
  })

  it('locks PDF download when the resolved plan explicitly disables valuation_download', () => {
    const { result } = renderAccess({
      planFeatures: { ...unlockedFeatures, valuation_download: false },
    })
    expect(result.current.canDownloadPdf).toBe(false)
  })

  it('unlocks PDF download when the resolved plan enables valuation_download', () => {
    const { result } = renderAccess({ planFeatures: unlockedFeatures })
    expect(result.current.canDownloadPdf).toBe(true)
  })

  it('keeps the seller startup valuation carve-out explicit', () => {
    const { result } = renderAccess({
      planFeatures: null,
      selectedMethod: 'startup_valuation',
      userRole: 'seller',
    })
    expect(result.current.canDownloadPdf).toBe(true)
  })

  it('keeps Free business owners on the founder method surface', () => {
    const { result } = renderAccess({ planType: 'free', userRole: 'seller' })
    expect(result.current.showFullAdvisorMethodNav).toBe(false)
    expect(result.current.isAdvisorAudience).toBe(false)
    expect(result.current.preSelectableMethodsForNav).toEqual([
      'upswitch_adaptive',
      'arr_multiple',
      'startup_valuation',
    ])
  })

  it('unlocks the full advisor valuation surface for Grow business owners', () => {
    const { result } = renderAccess({
      planFeatures: unlockedFeatures,
      planType: 'owner_grow',
      userRole: 'seller',
    })
    expect(result.current.showFullAdvisorMethodNav).toBe(true)
    expect(result.current.isAdvisorAudience).toBe(false)
    expect(result.current.showPreparerMultiplePanel).toBe(true)
    expect(result.current.preSelectableMethodsForNav).toEqual(
      expect.arrayContaining([
        'upswitch_adaptive',
        'omzet_multiple',
        'arr_multiple',
        'ebitda_multiple',
        'dcf',
        'sde_multiple',
        'adjusted_nav',
        'fiscal_4x',
        'startup_valuation',
        'liquidation_analysis',
      ])
    )
  })
})
