'use client'

/**
 * Shared open-state for the Advanced Advisor Controls modal.
 *
 * Two surfaces drive the same modal:
 *   1. The "Calibratie & weging" button at step 4a in the wizard
 *      (ManualInputMethodSections → AdvisorControlsTrigger).
 *   2. The per-valuation kebab item next to the active valuation
 *      (CalculatorNav recent-valuations dropdown).
 *
 * They live in disconnected trees. Lifting state to ManualLayout would
 * thread three props through six components for one modal — a Zustand atom
 * is the right size for "shared open boolean."
 *
 * The store does *not* hold any form data. The modal still reads the
 * authoritative formData from ManualFormStore via the trigger's props; this
 * store only mediates `open`/`close`.
 */

import { create } from 'zustand'

interface AdvisorControlsModalState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useAdvisorControlsModalStore = create<AdvisorControlsModalState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
