import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData } from '../../../types/valuation'
import { useApplyAdvisorValuationDefaults } from './useApplyAdvisorValuationDefaults'

const mockGet = vi.fn()

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    getAccountantValuationDefaults: () => mockGet(),
  },
}))

vi.mock('../../../utils/logger', () => ({
  apiLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

function useHarness({
  enabled = true,
  initial = {} as Partial<ManualValuationFormData>,
}: {
  enabled?: boolean
  initial?: Partial<ManualValuationFormData>
} = {}) {
  const [formData, setFormData] = useState<ManualValuationFormData>(
    initial as ManualValuationFormData
  )
  const result = useApplyAdvisorValuationDefaults({
    enabled,
    formData,
    setFormData,
  })
  return { formData, ...result }
}

describe('useApplyAdvisorValuationDefaults', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not fetch when disabled (non-accountant viewer)', async () => {
    mockGet.mockResolvedValue({
      default_multiple_calibration_adjustment: 1.5,
      default_historical_ebitda_weighting_mode: 'weighted',
      default_show_enterprise_to_equity_bridge: false,
    })

    renderHook(() => useHarness({ enabled: false }))

    await new Promise((r) => setTimeout(r, 0))
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('applies saved defaults to undefined fields and reports which fields were seeded', async () => {
    mockGet.mockResolvedValue({
      default_multiple_calibration_adjustment: -0.5,
      default_historical_ebitda_weighting_mode: 'weighted',
      default_show_enterprise_to_equity_bridge: false,
    })

    const { result } = renderHook(() => useHarness({ enabled: true }))

    await waitFor(() => {
      expect(result.current.appliedFields.length).toBe(3)
    })
    expect(result.current.formData.multiple_calibration_adjustment).toBe(-0.5)
    expect(result.current.formData.historical_ebitda_weighting_mode).toBe('weighted')
    expect(result.current.formData.show_enterprise_to_equity_bridge).toBe(false)
    expect(result.current.appliedFields).toContain('multiple_calibration_adjustment')
    expect(result.current.appliedFields).toContain('historical_ebitda_weighting_mode')
    expect(result.current.appliedFields).toContain('show_enterprise_to_equity_bridge')
  })

  it('never overwrites a field that already has a value (per-deal decision wins)', async () => {
    mockGet.mockResolvedValue({
      default_multiple_calibration_adjustment: 2,
      default_historical_ebitda_weighting_mode: 'weighted',
      default_show_enterprise_to_equity_bridge: false,
    })

    const { result } = renderHook(() =>
      useHarness({
        enabled: true,
        initial: {
          multiple_calibration_adjustment: 1.1,
          historical_ebitda_weighting_mode: 'standard',
        },
      })
    )

    await waitFor(() => {
      expect(result.current.appliedFields.length).toBe(1)
    })
    expect(result.current.formData.multiple_calibration_adjustment).toBe(1.1)
    expect(result.current.formData.historical_ebitda_weighting_mode).toBe('standard')
    expect(result.current.formData.show_enterprise_to_equity_bridge).toBe(false)
    expect(result.current.appliedFields).toEqual(['show_enterprise_to_equity_bridge'])
  })

  it('treats an all-nulls response as "no defaults saved" and applies nothing', async () => {
    mockGet.mockResolvedValue({
      default_multiple_calibration_adjustment: null,
      default_historical_ebitda_weighting_mode: null,
      default_show_enterprise_to_equity_bridge: null,
    })

    const { result } = renderHook(() => useHarness({ enabled: true }))

    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.appliedFields).toEqual([])
    expect(result.current.formData.multiple_calibration_adjustment).toBeUndefined()
  })

  it('swallows a failed fetch — must never break the wizard', async () => {
    mockGet.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useHarness({ enabled: true }))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(result.current.appliedFields).toEqual([])
    expect(result.current.defaults).toBeNull()
  })
})
