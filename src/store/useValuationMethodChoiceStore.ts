/**
 * Session-scoped valuation methodology choice (after firm-default confirmation modal).
 * Keyed by report id, session key, or stable fallback for the current valuation session.
 */

import { create } from 'zustand'

export type ValuationMethodSessionChoice = 'firm_default' | 'adaptive'

interface ValuationMethodChoiceState {
  byKey: Record<string, ValuationMethodSessionChoice>
  getChoice: (sessionKey: string) => ValuationMethodSessionChoice | undefined
  setChoice: (sessionKey: string, choice: ValuationMethodSessionChoice) => void
}

export const useValuationMethodChoiceStore = create<ValuationMethodChoiceState>((set, get) => ({
  byKey: {},
  getChoice: (sessionKey: string) => get().byKey[sessionKey],
  setChoice: (sessionKey: string, choice: ValuationMethodSessionChoice) =>
    set((s) => ({
      byKey: { ...s.byKey, [sessionKey]: choice },
    })),
}))
