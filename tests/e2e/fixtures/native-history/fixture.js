import { create } from 'zustand'
export const useManualFormStore = create(() => ({ formData: {} }))
export const useTaxLatencyStore = create(() => ({ items: [] }))
export const useNormalizationStore = create(() => ({ items: [] }))
export const generalLogger = { debug() {}, warn() {}, error() {}, info() {} }
export const reportAccessScope = () => 'isolated-user'
export const watchReportAccessScope = () => ({ isCurrent: () => true, dispose() {} })
export const reportAssetService = { retryFailedSave: async () => {} }
export const failedReportAssetSave = () => false
export const pendingReportAssetSave = () => false
export const useSessionStore = create((set, get) => ({
  session: null,
  engine: {},
  engineRevision: 0,
  status: 'idle',
  restorationComplete: false,
  hasUnsavedChanges: false,
  isSaving: false,
  saveErrorMessage: null,
  updateSessionData: async (data) =>
    set((s) => ({
      session: { ...s.session, sessionData: { ...s.session.sessionData, ...data } },
      hasUnsavedChanges: true,
    })),
  updateSession: (data) =>
    set((s) => ({ session: { ...s.session, ...data }, hasUnsavedChanges: true })),
  saveSession: async () => {
    const session = get().session
    set({ isSaving: true })
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.reportId, data: session.sessionData }),
      })
      if (!response.ok) throw Error('Local save failed')
      if (get().session === session) set({ hasUnsavedChanges: false, saveErrorMessage: null })
    } catch (error) {
      set({ hasUnsavedChanges: true, saveErrorMessage: error.message })
      throw error
    } finally {
      set({ isSaving: false })
    }
  },
}))
export async function loadReport(id) {
  const response = await fetch('/api/reports?id=' + id)
  const data = await response.json()
  useManualFormStore.setState({ formData: data })
  useSessionStore.setState((s) => ({
    session: { reportId: id, sessionData: data, name: 'Custom name' },
    engine: {},
    engineRevision: s.engineRevision + 1,
    status: 'loaded',
    restorationComplete: true,
    hasUnsavedChanges: false,
    isSaving: false,
    saveErrorMessage: null,
  }))
}
