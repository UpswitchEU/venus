/**
 * Pure-function tests for the prefill helpers.  The full hook is
 * integration-tested via panel mounting; this suite pins the
 * defensive parsing primitives so a regression in one of them can't
 * silently let bad URL/KBO data into the store.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBootstrapSafe } from '@/lib/bootstrap/BootstrapProvider'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { useStartupPrefill } from './useStartupPrefill'
import {
  parseFoundingYear,
  parseRoundSize,
  ROUND_SIZE_MAX,
  ROUND_SIZE_MIN,
} from './useStartupPrefill.helpers'
import { resetStartupPrefilledKeys } from './useStartupPrefilledKeys'

vi.mock('@/lib/bootstrap/BootstrapProvider', () => ({
  useBootstrapSafe: vi.fn(),
}))

const mockUseBootstrapSafe = vi.mocked(useBootstrapSafe)
type BootstrapSafeValue = Exclude<ReturnType<typeof useBootstrapSafe>, null | undefined>
type ManualFormPatch = Parameters<
  ReturnType<typeof useManualFormStore.getState>['updateFormData']
>[0]

beforeEach(() => {
  useManualFormStore.getState().resetForm()
  useStartupValuationStore.getState().reset()
  resetStartupPrefilledKeys()
  mockUseBootstrapSafe.mockReset()
})

describe('parseFoundingYear', () => {
  it('extracts the year from an ISO yyyy-mm-dd', () => {
    expect(parseFoundingYear('2018-04-12')).toBe(2018)
  })

  it('accepts a bare yyyy', () => {
    expect(parseFoundingYear('2018')).toBe(2018)
  })

  it('returns null on missing or empty input', () => {
    expect(parseFoundingYear(undefined)).toBeNull()
    expect(parseFoundingYear(null)).toBeNull()
    expect(parseFoundingYear('')).toBeNull()
    expect(parseFoundingYear('   ')).toBeNull()
  })

  it('returns null when the year is outside the defensible range', () => {
    expect(parseFoundingYear('1899-01-01')).toBeNull()
    expect(parseFoundingYear('2200-01-01')).toBeNull()
  })

  it('returns null when the prefix is not a valid 4-digit year', () => {
    expect(parseFoundingYear('founded-2020')).toBeNull()
    expect(parseFoundingYear('20-01-2018')).toBeNull()
  })
})

describe('parseRoundSize', () => {
  it('returns null on missing or empty input', () => {
    expect(parseRoundSize(null)).toBeNull()
    expect(parseRoundSize(undefined)).toBeNull()
    expect(parseRoundSize('')).toBeNull()
  })

  it('returns null on non-numeric input', () => {
    expect(parseRoundSize('not-a-number')).toBeNull()
    expect(parseRoundSize('1M')).toBeNull()
  })

  it('returns null below the floor (typo / test value defence)', () => {
    expect(parseRoundSize(String(ROUND_SIZE_MIN - 1))).toBeNull()
    expect(parseRoundSize('100')).toBeNull()
  })

  it('clamps above the ceiling instead of rejecting (founder still gets the cap)', () => {
    expect(parseRoundSize(String(ROUND_SIZE_MAX + 1))).toBe(ROUND_SIZE_MAX)
    expect(parseRoundSize('999999999')).toBe(ROUND_SIZE_MAX)
  })

  it('passes through a defensible mid-range value', () => {
    expect(parseRoundSize('500000')).toBe(500_000)
    expect(parseRoundSize('1500000')).toBe(1_500_000)
  })

  it('accepts the exact min and max bounds', () => {
    expect(parseRoundSize(String(ROUND_SIZE_MIN))).toBe(ROUND_SIZE_MIN)
    expect(parseRoundSize(String(ROUND_SIZE_MAX))).toBe(ROUND_SIZE_MAX)
  })
})

describe('useStartupPrefill', () => {
  it('replaces a legal-form business_type_id with the registry-enriched business type', async () => {
    useManualFormStore.getState().updateFormData({
      business_type_id: 'company',
      business_type: 'company',
    } as unknown as ManualFormPatch)

    mockUseBootstrapSafe.mockReturnValue({
      prefillData: {
        companyInfo: {
          companyName: 'Upswitch BV',
          countryCode: 'BE',
          businessTypeId: 'fintech_lending_credit',
        },
        kboData: {
          kboNumber: '1012345678',
          businessTypeId: 'fintech_lending_credit',
          naceCode: '63.9',
        },
        businessType: {
          id: 'fintech_lending_credit',
          title: 'Fintech — Lending & Credit',
          industry: 'financial_services',
          category: 'fintech',
        },
      },
    } as unknown as BootstrapSafeValue)

    renderHook(() => useStartupPrefill())

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.business_type_id).toBe('fintech-lending')
    })
    expect(useManualFormStore.getState().formData.industry).toBe('financial_services')
    expect(useManualFormStore.getState().formData.business_type).toBe('company')
  })
})
