import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { deepEqual } from '../../../utils/deepEqual'
import { canonicalizeTaxLatencyWireArray } from '../../../utils/taxLatencyWire'

/** Titan's restore replaces session inputs, including inputs autosaved during the request. */
export async function persistManualVersionRestoreEdits({
  flushForm,
  isCurrent,
}: {
  flushForm: () => Promise<void>
  isCurrent: () => boolean
}): Promise<void> {
  const target = useSessionStore.getState()
  const stillTarget = () => {
    const state = useSessionStore.getState()
    return (
      isCurrent() &&
      target.engine &&
      target.session &&
      state.engine === target.engine &&
      state.engineRevision === target.engineRevision &&
      state.session?.reportId === target.session.reportId
    )
  }
  const check = () => {
    if (!stillTarget()) {
      throw new Error('The restored workspace changed')
    }
  }
  check()
  const form = useManualFormStore.getState().formData
  // Do not let a pre-restore acknowledgement count as confirmation of these edits.
  target.markUnsaved()
  try {
    await flushForm()
    check()
    const normalizations = useNormalizationStore.getState().items
    const taxItems = useTaxLatencyStore.getState().items
    await useSessionStore.getState().updateSessionData({
      _normalizations: normalizations,
      _taxLatencies: taxItems,
      tax_latencies: canonicalizeTaxLatencyWireArray(taxItems),
    })
    check()
    // Explicit user saves bypass the unchanged-autosave fingerprint. Result and PDF
    // fields are excluded by the session engine, so the restored report stays intact.
    await useSessionStore.getState().saveSession('user')
    check()
    const saved = useSessionStore.getState()
    if (
      saved.hasUnsavedChanges ||
      saved.isSaving ||
      saved.saveErrorMessage ||
      !deepEqual(form, useManualFormStore.getState().formData) ||
      !deepEqual(normalizations, useNormalizationStore.getState().items) ||
      !deepEqual(taxItems, useTaxLatencyStore.getState().items)
    ) {
      throw new Error('Newer edits are not yet confirmed saved')
    }
  } catch (error) {
    // A successful form flush can clear dirty status before an adjustment save fails.
    if (stillTarget()) useSessionStore.getState().markUnsaved()
    throw error
  }
}
