import {
  failedReportAssetSave,
  pendingReportAssetSave,
  reportAssetService,
} from '../../../services/report/ReportAssetService'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { resumeReportRecovery, useReportRecoveryStore } from '../../../store/reportRecoveryStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { deepEqual } from '../../../utils/deepEqual'
import { requirePersistenceAcknowledgement } from '../../../utils/persistenceOutcome'
import { reportAccessScope } from '../../../utils/reportAccessScope'
import { isSameReportIdentity } from '../../../utils/reportIdentityPromotion'
import { canonicalizeTaxLatencyWireArray } from '../../../utils/taxLatencyWire'

export class WorkspaceSaveNotReadyError extends Error {}

/** Save while the current workspace still owns its form and delegated identity. */
export async function saveManualWorkspaceBeforeNavigation({
  flushForm,
  isCurrent,
  isBusy,
}: {
  flushForm: () => Promise<void>
  isCurrent: () => boolean
  isBusy: () => boolean
}): Promise<void> {
  const target = useSessionStore.getState()
  const reportId = target.session?.reportId
  if (!reportId) throw new Error('There is no active report to save')
  const check = () => {
    const current = useSessionStore.getState()
    if (
      !isCurrent() ||
      !target.engine ||
      !reportId ||
      current.engine !== target.engine ||
      current.engineRevision !== target.engineRevision ||
      !isSameReportIdentity(current.session?.reportId, reportId)
    ) {
      throw new Error('The active report changed')
    }
    if (isBusy()) throw new WorkspaceSaveNotReadyError('Valuation work is still in progress')
  }
  // Let an active calculation or method save finish behind the same notice.
  // The caller's deadline invalidates isCurrent if that work never settles.
  while (isBusy()) {
    if (!isCurrent()) throw new Error('The active report changed')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  check()

  // A failed result may contain an older input snapshot. Persist/recover it
  // first, then flush the current form so newer edits remain authoritative.
  const recovery = () => {
    const step = useReportRecoveryStore.getState().step
    return step?.reportId === reportId && step.scope === reportAccessScope() ? step : null
  }
  if (recovery()?.stage === 'result') await resumeReportRecovery(reportId)
  else await reportAssetService.retryFailedSave(reportId)
  check()
  await flushForm()
  check()

  const form = useManualFormStore.getState().formData
  const normalizations = useNormalizationStore.getState().items
  const taxItems = useTaxLatencyStore.getState().items
  const state = useSessionStore.getState()
  const sessionData = (state.session?.sessionData ?? {}) as Record<string, unknown>
  const taxLatencies = canonicalizeTaxLatencyWireArray(taxItems)
  if (
    !deepEqual(sessionData._normalizations ?? [], normalizations) ||
    !deepEqual(sessionData._taxLatencies ?? [], taxItems) ||
    !deepEqual(sessionData.tax_latencies ?? [], taxLatencies)
  ) {
    await state.updateSessionData({
      _normalizations: normalizations,
      _taxLatencies: taxItems,
      tax_latencies: taxLatencies,
    })
    check()
  }
  requirePersistenceAcknowledgement(await useNormalizationStore.getState().retryPersist(reportId))
  check()
  const pending = useSessionStore.getState()
  if (pending.hasUnsavedChanges || pending.isSaving || pending.saveErrorMessage) {
    requirePersistenceAcknowledgement(await pending.saveSession('user'))
    check()
  }
  if (recovery()?.stage === 'inputs') {
    await resumeReportRecovery(reportId)
    check()
  }
  const saved = useSessionStore.getState()
  if (
    saved.hasUnsavedChanges ||
    saved.isSaving ||
    saved.saveErrorMessage ||
    failedReportAssetSave(reportId) ||
    pendingReportAssetSave(reportId) ||
    recovery() ||
    !deepEqual(form, useManualFormStore.getState().formData) ||
    !deepEqual(normalizations, useNormalizationStore.getState().items) ||
    !deepEqual(taxItems, useTaxLatencyStore.getState().items)
  ) {
    throw new Error('The latest workspace edits have not been confirmed saved')
  }
}
