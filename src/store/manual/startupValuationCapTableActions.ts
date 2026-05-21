import { normalizePreMoneyTarget } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import type { StartupValuationSet } from './startupValuationActionTypes'
import type { StartupCapTableState } from './startupValuationDomain'
import type { StartupValuationActions } from './startupValuationStoreTypes'

type StartupValuationCapTableActions = Pick<
  StartupValuationActions,
  'setCapField' | 'addSafeNote' | 'updateSafeNote' | 'removeSafeNote'
>

function generateSafeNoteId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `safe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export function createStartupValuationCapTableActions(
  set: StartupValuationSet
): StartupValuationCapTableActions {
  return {
    setCapField: <K extends keyof StartupCapTableState>(key: K, value: StartupCapTableState[K]) =>
      set((state) => ({
        cap_table: {
          ...state.cap_table,
          [key]:
            key === 'pre_money_target'
              ? (normalizePreMoneyTarget(value as number | null) as StartupCapTableState[K])
              : value,
        },
      })),

    addSafeNote: () =>
      set((state) => ({
        cap_table: {
          ...state.cap_table,
          safe_notes: [
            ...state.cap_table.safe_notes,
            {
              id: generateSafeNoteId(),
              amount: null,
              valuation_cap: null,
              discount_pct: 20,
              holder_label: '',
            },
          ],
        },
      })),

    updateSafeNote: (id, patch) =>
      set((state) => ({
        cap_table: {
          ...state.cap_table,
          safe_notes: state.cap_table.safe_notes.map((note) =>
            note.id === id ? { ...note, ...patch } : note
          ),
        },
      })),

    removeSafeNote: (id) =>
      set((state) => ({
        cap_table: {
          ...state.cap_table,
          safe_notes: state.cap_table.safe_notes.filter((note) => note.id !== id),
        },
      })),
  }
}
