import { useCallback, useEffect, useRef, useState } from 'react'
import { useReportAssetSaveFailure } from '../../../hooks/useReportAssetSaveFailure'
import { useAuthStore } from '../../../lib/auth/store'
import { reportAssetService } from '../../../services'
import { resumeReportRecovery, useReportRecoveryStore } from '../../../store/reportRecoveryStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useClientContext } from '../../../stores/clientContext'
import { generalLogger } from '../../../utils/logger'
import {
  persistenceFailure,
  requirePersistenceAcknowledgement,
} from '../../../utils/persistenceOutcome'
import { reportAccessScope, watchReportAccessScope } from '../../../utils/reportAccessScope'

export const REPORT_RECOVERY_DELAYS = [8_000, 16_000, 32_000] as const

/** Sole owner of save retries; transport layers may report a longer Retry-After. */
export function useReportRecovery(reportId: string, workInProgress = false) {
  useAuthStore((s) => s.user)
  useClientContext((s) => s.relationshipId)
  useClientContext((s) => s.accountant)
  useClientContext((s) => s.isActingAsClient)
  const scope = reportAccessScope()
  const sessionFailure = useSessionStore((s) => s.saveFailure)
  const sessionSaving = useSessionStore((s) => s.isSaving)
  const sessionDirty = useSessionStore((s) => s.hasUnsavedChanges)
  const mutations = useNormalizationStore((s) => s.pendingMutations)
  const buffered = useNormalizationStore((s) => s.recoveryBuffered)
  const normSaving = useNormalizationStore((s) => s.isSaving)
  const step = useReportRecoveryStore((s) => s.step)
  const assetFailure = useReportAssetSaveFailure(reportId)
  const activeStep = step?.reportId === reportId && step.scope === scope ? step : null
  const hasActiveStep = !!activeStep
  const pending = mutations.filter((p) => p.reportId === reportId && p.scope === scope)
  const failure =
    sessionFailure ??
    pending.find((p) => p.failure)?.failure ??
    activeStep?.failure ??
    (assetFailure
      ? persistenceFailure(assetFailure.cause ?? new Error(assetFailure.error))
      : pending.length || buffered
        ? { kind: 'temporary' as const, message: 'Pending adjustments need to sync' }
        : null)
  const [attempts, setAttempts] = useState(0)
  const [scheduled, setScheduled] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const busy = useRef(false)
  const context = `${scope}:${reportId}`
  const contextRef = useRef(context)
  contextRef.current = context
  const retry = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRecovering(true)
    const access = watchReportAccessScope()
    const current = () =>
      contextRef.current === context &&
      access.isCurrent() &&
      useSessionStore.getState().session?.reportId === reportId
    try {
      if (!current()) return
      const state = useSessionStore.getState()
      if (state.hasUnsavedChanges || state.saveFailure) {
        requirePersistenceAcknowledgement(await state.saveSession('user'))
      }
      if (!current()) return
      requirePersistenceAcknowledgement(
        await useNormalizationStore.getState().retryPersist(reportId)
      )
      if (!current()) return
      if (useNormalizationStore.getState().recoveryBuffered) {
        requirePersistenceAcknowledgement(
          await useNormalizationStore.getState().persistToSession(reportId)
        )
      }
      if (!current()) return
      const continuation = useReportRecoveryStore.getState().step
      if (continuation?.reportId === reportId && continuation.scope === reportAccessScope()) {
        await resumeReportRecovery(reportId)
      } else {
        await reportAssetService.retryFailedSave(reportId)
      }
      if (current()) generalLogger.info('report_save_recovery_completed', { reportId })
    } catch (error) {
      if (current())
        generalLogger.warn('report_save_recovery_deferred', {
          reportId,
          code: persistenceFailure(error).code,
          status: persistenceFailure(error).status,
        })
      /* Stores retain structured failures; a manual retry remains available. */
    } finally {
      access.dispose()
      busy.current = false
      setRecovering(false)
    }
  }, [reportId, context])
  useEffect(() => {
    void context
    setAttempts(0)
    setScheduled(false)
  }, [context])
  const previousContext = useRef({ reportId, scope })
  useEffect(() => {
    const previous = previousContext.current
    previousContext.current = { reportId, scope }
    if (previous.reportId === reportId && previous.scope === scope) return
    const obsolete = useReportRecoveryStore.getState().step
    if (obsolete?.reportId === previous.reportId && obsolete.scope === previous.scope)
      useReportRecoveryStore.setState({ step: null })
  }, [reportId, scope])
  const retryable = failure?.kind === 'temporary' || failure?.kind === 'conflict'
  const hasFailure = !!failure
  const retryAfterMs = failure?.retryAfterMs ?? 0
  const saving = sessionSaving || normSaving || recovering || workInProgress
  useEffect(() => {
    if (!hasFailure && !pending.length && !buffered && !hasActiveStep && !sessionDirty)
      setAttempts(0)
    if (!retryable || saving || attempts >= REPORT_RECOVERY_DELAYS.length) {
      setScheduled(false)
      return
    }
    setScheduled(true)
    const timer = setTimeout(
      () => {
        setScheduled(false)
        setAttempts((n) => n + 1)
        void retry()
      },
      Math.max(REPORT_RECOVERY_DELAYS[attempts], retryAfterMs)
    )
    return () => clearTimeout(timer)
  }, [
    retryable,
    saving,
    attempts,
    retryAfterMs,
    retry,
    pending.length,
    buffered,
    sessionDirty,
    hasActiveStep,
    hasFailure,
  ])
  useEffect(() => {
    if (failure?.kind !== 'subscription') return
    const focus = () => {
      void retry()
    }
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [failure?.kind, retry])
  return {
    failure,
    saving,
    scheduled,
    retry,
    blocked: Boolean(failure || saving || pending.length || buffered || activeStep || sessionDirty),
  }
}
