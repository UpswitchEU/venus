import { create } from 'zustand'

/** Ephemeral projection of a server-saved assessment. No financial browser persistence. */
export const usePartialAssessmentStore = create<{
  entry: { reportId: string; saved: Record<string, unknown> } | null
  setSaved: (reportId: string, saved: Record<string, unknown>) => void
  clear: () => void
}>((set) => ({
  entry: null,
  setSaved: (reportId, saved) => set({ entry: { reportId, saved } }),
  clear: () => set({ entry: null }),
}))
