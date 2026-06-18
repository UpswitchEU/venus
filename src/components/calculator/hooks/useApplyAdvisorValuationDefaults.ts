'use client'

/**
 * useApplyAdvisorValuationDefaults
 *
 * Reads the calling advisor's saved Venus step 4a defaults (Mercury settings
 * → Titan `accountant_settings`) once per panel mount and seeds the form
 * with them — but ONLY for fields the user has not yet touched. The
 * per-deal calibration controls remain editable in the wizard; this hook
 * supplies the *starting point*, not the *decision*.
 *
 * Three guarantees:
 *  1. Never overwrites a value already present on `formData`. The wizard
 *     is the source of truth for per-deal judgment; defaults bow out the
 *     moment a value exists.
 *  2. Applies at most once per mount, tracked by a ref. Re-fetches caused
 *     by tab focus or stale revalidation do not re-seed.
 *  3. No-ops for non-accountant users — sellers and buyers never call the
 *     endpoint.
 *
 * Returns the resolved defaults so the panel can surface a small
 * "prefilled from settings" hint near step 4a; null while loading, error,
 * or when no defaults are saved.
 */

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import type { AccountantValuationDefaults } from '../../../services/api/profile/AccountantSettingsAPI'
import { backendAPI } from '../../../services/backendApi'
import type { ManualValuationFormData } from '../../../types/valuation'
import { apiLogger } from '../../../utils/logger'

interface UseApplyAdvisorValuationDefaultsArgs {
  /**
   * True when the resolved user is an accountant. Caller decides — Venus
   * already reads `user.role` / `user.plan_type` upstream; we avoid
   * duplicating that policy here.
   */
  enabled: boolean
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
}

export function useApplyAdvisorValuationDefaults({
  enabled,
  formData,
  setFormData,
}: UseApplyAdvisorValuationDefaultsArgs): {
  defaults: AccountantValuationDefaults | null
  appliedFields: ReadonlyArray<
    | 'multiple_calibration_adjustment'
    | 'historical_ebitda_weighting_mode'
    | 'show_enterprise_to_equity_bridge'
  >
} {
  const [defaults, setDefaults] = useState<AccountantValuationDefaults | null>(null)
  const [appliedFields, setAppliedFields] = useState<
    ReadonlyArray<
      | 'multiple_calibration_adjustment'
      | 'historical_ebitda_weighting_mode'
      | 'show_enterprise_to_equity_bridge'
    >
  >([])
  const seedAppliedRef = useRef(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    let cancelled = false
    void backendAPI
      .getAccountantValuationDefaults()
      .then((resolved: AccountantValuationDefaults) => {
        if (cancelled) return
        const hasAny =
          resolved.default_multiple_calibration_adjustment != null ||
          resolved.default_historical_ebitda_weighting_mode != null ||
          resolved.default_show_enterprise_to_equity_bridge != null
        setDefaults(hasAny ? resolved : null)
      })
      .catch((error: unknown) => {
        apiLogger.warn('advisor valuation defaults: load failed (non-fatal)', { error })
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (seedAppliedRef.current) return
    if (!defaults) return

    const updates: Partial<ManualValuationFormData> = {}
    const fields: Array<
      | 'multiple_calibration_adjustment'
      | 'historical_ebitda_weighting_mode'
      | 'show_enterprise_to_equity_bridge'
    > = []

    if (
      defaults.default_multiple_calibration_adjustment != null &&
      formData.multiple_calibration_adjustment === undefined
    ) {
      updates.multiple_calibration_adjustment = defaults.default_multiple_calibration_adjustment
      fields.push('multiple_calibration_adjustment')
    }
    if (
      defaults.default_historical_ebitda_weighting_mode != null &&
      formData.historical_ebitda_weighting_mode === undefined
    ) {
      updates.historical_ebitda_weighting_mode = defaults.default_historical_ebitda_weighting_mode
      fields.push('historical_ebitda_weighting_mode')
    }
    if (
      defaults.default_show_enterprise_to_equity_bridge != null &&
      formData.show_enterprise_to_equity_bridge === undefined
    ) {
      updates.show_enterprise_to_equity_bridge = defaults.default_show_enterprise_to_equity_bridge
      fields.push('show_enterprise_to_equity_bridge')
    }

    seedAppliedRef.current = true

    if (fields.length === 0) return
    setAppliedFields(fields)
    setFormData((prev) => ({ ...prev, ...updates }))
  }, [
    enabled,
    defaults,
    formData.multiple_calibration_adjustment,
    formData.historical_ebitda_weighting_mode,
    formData.show_enterprise_to_equity_bridge,
    setFormData,
  ])

  return { defaults, appliedFields }
}
