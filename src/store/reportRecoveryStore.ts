import { create } from 'zustand'
import { type PersistenceFailure, persistenceFailure } from '../utils/persistenceOutcome'
import { reportAccessScope, watchReportAccessScope } from '../utils/reportAccessScope'

type RecoveryStep = {
  reportId: string
  scope: string
  stage: 'inputs' | 'result'
  resume: () => Promise<unknown>
  failure: PersistenceFailure
}
export const useReportRecoveryStore = create<{ step: RecoveryStep | null }>(() => ({ step: null }))
const running = new WeakMap<RecoveryStep, Promise<void>>()

/** Mounted-tab continuation. A completed calculation is retained by its result-save closure. */
export function deferReportRecovery(
  reportId: string,
  stage: RecoveryStep['stage'],
  error: unknown,
  resume: RecoveryStep['resume']
) {
  useReportRecoveryStore.setState({
    step: {
      reportId,
      scope: reportAccessScope(),
      stage,
      resume,
      failure: persistenceFailure(error),
    },
  })
}

export function clearReportRecovery(reportId: string) {
  const step = useReportRecoveryStore.getState().step
  if (step?.reportId === reportId && step.scope === reportAccessScope())
    useReportRecoveryStore.setState({ step: null })
}

export function resumeReportRecovery(reportId: string): Promise<void> {
  const step = useReportRecoveryStore.getState().step
  if (!step || step.reportId !== reportId || step.scope !== reportAccessScope())
    return Promise.resolve()
  const existing = running.get(step)
  if (existing) return existing
  const access = watchReportAccessScope()
  const promise = Promise.resolve()
    .then(async () => {
      if (!access.isCurrent() || useReportRecoveryStore.getState().step !== step) return
      const completed = await step.resume()
      if (completed === false && useReportRecoveryStore.getState().step === step)
        throw new Error('Report recovery has not completed')
      if (access.isCurrent() && useReportRecoveryStore.getState().step === step)
        clearReportRecovery(reportId)
    })
    .catch((error) => {
      if (access.isCurrent() && useReportRecoveryStore.getState().step === step) {
        useReportRecoveryStore.setState({ step: { ...step, failure: persistenceFailure(error) } })
      }
      throw error
    })
    .finally(() => {
      access.dispose()
      running.delete(step)
    })
  running.set(step, promise)
  return promise
}
