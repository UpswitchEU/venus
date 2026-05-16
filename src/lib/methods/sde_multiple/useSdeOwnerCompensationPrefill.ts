/**
 * useSdeOwnerCompensationPrefill — owns the panel-side SDE prefill effect.
 *
 * When the SDE multiple is active in the current method selection and the
 * normalization store carries a defensible `category: 'salary'` signal
 * (account 620 / 618 from an imported trial balance), this hook prefills
 * `owner_salary_addback` exactly once per "user has not typed a value"
 * lifecycle. Idempotency is keyed on `(sourceYear, suggestedValue)` so
 * normalising the same imported ledger twice does not re-apply.
 *
 * Also exposes `doubleCountRisk` — true when the user has both a positive
 * `owner_salary_addback` AND an accepted salary normalization. The panel
 * surfaces this as a warning badge.
 *
 * Domain math (`computeSdeOwnerSalaryPrefill`) lives in `@/lib/sde/`;
 * this hook is the React-state machinery wrapper.
 */

import { useEffect, useMemo, useRef } from 'react'
import {
  computeSdeOwnerSalaryPrefill,
  type SdeSalaryPrefillNormalizationItem,
  type SdeSalaryPrefillResult,
} from '@/lib/sde'

export interface UseSdeOwnerCompensationPrefillParams {
  /**
   * `true` when at least one active method requires owner-compensation
   * input. Derived by the SDE manual-input adapter in the caller — this
   * hook does not assume how the caller computed it.
   */
  sdeSectionActive: boolean
  /** Normalization items pulled from `useNormalizationStore`. */
  normalizationItems: ReadonlyArray<SdeSalaryPrefillNormalizationItem>
  /** Current value of the `owner_salary_addback` field, or null/undefined. */
  ownerSalaryAddback: number | null | undefined
  /**
   * Form-write callback. The hook only ever calls
   * `onAnyFieldChange('owner_salary_addback', value)`; passing `undefined`
   * disables the prefill (used when the panel runs in a read-only context).
   */
  onAnyFieldChange?: (field: 'owner_salary_addback', value: number) => void
}

export interface UseSdeOwnerCompensationPrefillResult {
  /** Latest prefill suggestion + provenance (memoised). */
  prefill: SdeSalaryPrefillResult
  /**
   * `true` when a salary normalization is accepted AND `owner_salary_addback`
   * is also positive — adding both adds the salary back twice.
   */
  doubleCountRisk: boolean
  /**
   * Returns the (year, value) pair the hook most recently applied via
   * `onAnyFieldChange`, or `null` when no prefill has fired. Read at render
   * time so the panel can compare against the current form value to decide
   * whether to surface the "Prefilled" badge.
   */
  getAppliedPrefill: () => { year: number; value: number } | null
}

export function useSdeOwnerCompensationPrefill({
  sdeSectionActive,
  normalizationItems,
  ownerSalaryAddback,
  onAnyFieldChange,
}: UseSdeOwnerCompensationPrefillParams): UseSdeOwnerCompensationPrefillResult {
  const prefill = useMemo(
    () => computeSdeOwnerSalaryPrefill(normalizationItems),
    [normalizationItems]
  )

  const doubleCountRisk = useMemo(() => {
    if (ownerSalaryAddback == null || ownerSalaryAddback <= 0) return false
    return normalizationItems.some(
      (n) =>
        n.status === 'accepted' &&
        n.category === 'salary' &&
        Math.abs((n as { adjustment?: number }).adjustment ?? 0) > 0
    )
  }, [ownerSalaryAddback, normalizationItems])

  // Track applied prefill so we never re-apply after the user clears the field.
  const appliedRef = useRef<{ year: number; value: number } | null>(null)

  useEffect(() => {
    if (!sdeSectionActive) return
    if (!onAnyFieldChange) return
    if (prefill.suggestedValue == null) return
    // Never overwrite a value the user has typed (or that already differs
    // from the suggestion via prior session restore).
    if (ownerSalaryAddback != null && Number(ownerSalaryAddback) > 0) return
    // Idempotency — only apply each suggestion once per session.
    const last = appliedRef.current
    if (last && last.year === prefill.sourceYear && last.value === prefill.suggestedValue) {
      return
    }
    onAnyFieldChange('owner_salary_addback', prefill.suggestedValue)
    appliedRef.current = {
      year: prefill.sourceYear ?? 0,
      value: prefill.suggestedValue,
    }
  }, [
    sdeSectionActive,
    prefill.suggestedValue,
    prefill.sourceYear,
    ownerSalaryAddback,
    onAnyFieldChange,
  ])

  return {
    prefill,
    doubleCountRisk,
    getAppliedPrefill: () => appliedRef.current,
  }
}
