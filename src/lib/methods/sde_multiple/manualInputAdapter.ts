import type { OwnerCompensationManualInputMethodAdapter } from '../manualInputAdapterTypes'
import { SDE_MULTIPLE_METHOD_KEY, sdeMultipleMethodSpec } from './spec'

/**
 * SDE's manual-input adapter owns the owner-compensation section eligibility.
 * The prefill effect itself lives beside this adapter in
 * `useSdeOwnerCompensationPrefill`.
 */
export const sdeManualInputAdapter = {
  key: SDE_MULTIPLE_METHOD_KEY,
  deriveOwnerCompensationSectionActive(activeMethods) {
    return (
      sdeMultipleMethodSpec.requiresOwnerCompensation &&
      activeMethods.includes(SDE_MULTIPLE_METHOD_KEY)
    )
  },
} satisfies OwnerCompensationManualInputMethodAdapter
