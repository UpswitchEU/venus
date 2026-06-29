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
})
