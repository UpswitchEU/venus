/**
 * useSdeOwnerCompensationPrefill — behaviour pins for the extracted SDE
 * prefill effect. Before Phase 4b this effect lived inline in `ManualInputPanel`
 * (5,178 LOC) and could not be tested in isolation.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SdeSalaryPrefillNormalizationItem } from '@/lib/sde'
import {
  useSdeOwnerCompensationPrefill,
  type UseSdeOwnerCompensationPrefillParams,
} from './useSdeOwnerCompensationPrefill'

function item(
  partial: Partial<SdeSalaryPrefillNormalizationItem> = {}
): SdeSalaryPrefillNormalizationItem {
  return {
    category: 'salary',
    status: 'accepted',
    value: 80_000,
    year: 2024,
    ...partial,
  }
}

const defaultParams: UseSdeOwnerCompensationPrefillParams = {
  sdeSectionActive: false,
  normalizationItems: [],
  ownerSalaryAddback: null,
  onAnyFieldChange: vi.fn(),
}

describe('useSdeOwnerCompensationPrefill', () => {
  describe('prefill gating', () => {
    it('does nothing when sdeSectionActive is false', () => {
      const onAnyFieldChange = vi.fn()
      renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: false,
          normalizationItems: [item()],
          onAnyFieldChange,
        })
      )
      expect(onAnyFieldChange).not.toHaveBeenCalled()
    })

    it('does nothing when onAnyFieldChange is undefined', () => {
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item()],
          onAnyFieldChange: undefined,
        })
      )
      // No crash; prefill is still returned for read-only consumers.
      expect(result.current.prefill.suggestedValue).toBe(80_000)
    })

    it('does nothing when the user already typed a positive owner_salary_addback', () => {
      const onAnyFieldChange = vi.fn()
      renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ value: 80_000 })],
          ownerSalaryAddback: 60_000,
          onAnyFieldChange,
        })
      )
      expect(onAnyFieldChange).not.toHaveBeenCalled()
    })

    it('does nothing when no salary signal exists in the store', () => {
      const onAnyFieldChange = vi.fn()
      renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [],
          onAnyFieldChange,
        })
      )
      expect(onAnyFieldChange).not.toHaveBeenCalled()
    })
  })

  describe('prefill application', () => {
    it('applies the suggested value when the section is active and the field is empty', () => {
      const onAnyFieldChange = vi.fn()
      renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ value: 90_000, year: 2024 })],
          ownerSalaryAddback: null,
          onAnyFieldChange,
        })
      )
      expect(onAnyFieldChange).toHaveBeenCalledTimes(1)
      expect(onAnyFieldChange).toHaveBeenCalledWith('owner_salary_addback', 90_000)
    })

    it('treats zero as "empty" and applies the prefill', () => {
      const onAnyFieldChange = vi.fn()
      renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ value: 90_000 })],
          ownerSalaryAddback: 0,
          onAnyFieldChange,
        })
      )
      expect(onAnyFieldChange).toHaveBeenCalledTimes(1)
    })

    it('is idempotent across rerenders with the same (sourceYear, suggestedValue)', () => {
      const onAnyFieldChange = vi.fn()
      const initialParams = {
        ...defaultParams,
        sdeSectionActive: true,
        normalizationItems: [item({ value: 90_000, year: 2024 })],
        ownerSalaryAddback: null,
        onAnyFieldChange,
      }
      const { rerender } = renderHook(
        (p: UseSdeOwnerCompensationPrefillParams) => useSdeOwnerCompensationPrefill(p),
        { initialProps: initialParams }
      )
      act(() => rerender(initialParams))
      act(() => rerender(initialParams))
      expect(onAnyFieldChange).toHaveBeenCalledTimes(1)
    })

    it('re-applies when the suggested value changes (e.g. new accepted salary item)', () => {
      const onAnyFieldChange = vi.fn()
      const baseParams = {
        ...defaultParams,
        sdeSectionActive: true,
        normalizationItems: [item({ value: 80_000, year: 2024 })],
        ownerSalaryAddback: null,
        onAnyFieldChange,
      }
      const { rerender } = renderHook(
        (p: UseSdeOwnerCompensationPrefillParams) => useSdeOwnerCompensationPrefill(p),
        { initialProps: baseParams }
      )
      expect(onAnyFieldChange).toHaveBeenCalledWith('owner_salary_addback', 80_000)

      act(() =>
        rerender({
          ...baseParams,
          normalizationItems: [item({ value: 95_000, year: 2024 })],
        })
      )
      expect(onAnyFieldChange).toHaveBeenLastCalledWith('owner_salary_addback', 95_000)
      expect(onAnyFieldChange).toHaveBeenCalledTimes(2)
    })
  })

  describe('doubleCountRisk', () => {
    it('is false when owner_salary_addback is empty', () => {
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ adjustment: 30_000 })],
          ownerSalaryAddback: null,
        })
      )
      expect(result.current.doubleCountRisk).toBe(false)
    })

    it('is false when no accepted salary normalization with a non-zero adjustment exists', () => {
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ status: 'pending', adjustment: 30_000 })],
          ownerSalaryAddback: 60_000,
        })
      )
      expect(result.current.doubleCountRisk).toBe(false)
    })

    it('is true when both a positive addback AND an accepted salary normalization are present', () => {
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ adjustment: 30_000 })],
          ownerSalaryAddback: 60_000,
        })
      )
      expect(result.current.doubleCountRisk).toBe(true)
    })
  })

  describe('getAppliedPrefill', () => {
    it('returns null when no prefill has fired', () => {
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [],
          ownerSalaryAddback: null,
          onAnyFieldChange: vi.fn(),
        })
      )
      expect(result.current.getAppliedPrefill()).toBeNull()
    })

    it('returns the (year, value) the hook most recently applied', () => {
      const onAnyFieldChange = vi.fn()
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: true,
          normalizationItems: [item({ value: 88_000, year: 2024 })],
          ownerSalaryAddback: null,
          onAnyFieldChange,
        })
      )
      expect(onAnyFieldChange).toHaveBeenCalledWith('owner_salary_addback', 88_000)
      expect(result.current.getAppliedPrefill()).toEqual({ year: 2024, value: 88_000 })
    })

    it('lets the caller compare the applied value against the current field for badge display', () => {
      const onAnyFieldChange = vi.fn()
      const baseParams = {
        ...defaultParams,
        sdeSectionActive: true,
        normalizationItems: [item({ value: 88_000, year: 2024 })],
        ownerSalaryAddback: null,
        onAnyFieldChange,
      }
      const { result, rerender } = renderHook(
        (p: UseSdeOwnerCompensationPrefillParams) => useSdeOwnerCompensationPrefill(p),
        { initialProps: baseParams }
      )

      // Hook applied 88_000; the badge should be visible because field matches applied value.
      const applied = result.current.getAppliedPrefill()
      expect(applied).not.toBeNull()
      // Simulate the parent reading the freshly applied value:
      const fieldStillMatchesApplied = Number(88_000) === (applied?.value ?? -1)
      expect(fieldStillMatchesApplied).toBe(true)

      // User types a different value — caller's comparison now hides the badge.
      act(() => rerender({ ...baseParams, ownerSalaryAddback: 99_000 }))
      const afterUserEdit = result.current.getAppliedPrefill()
      const fieldDifferentNow = Number(99_000) === (afterUserEdit?.value ?? -1)
      expect(fieldDifferentNow).toBe(false)
    })
  })

  describe('prefill return value', () => {
    it('is exposed even when sdeSectionActive is false (read-only consumers)', () => {
      const { result } = renderHook(() =>
        useSdeOwnerCompensationPrefill({
          ...defaultParams,
          sdeSectionActive: false,
          normalizationItems: [item({ value: 75_000, year: 2024 })],
        })
      )
      expect(result.current.prefill.suggestedValue).toBe(75_000)
      expect(result.current.prefill.sourceYear).toBe(2024)
    })
  })
})
