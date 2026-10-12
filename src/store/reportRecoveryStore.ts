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

export async function resumeReportRecovery(reportId: string) {
  const step = useReportRecoveryStore.getState().step
  if (!step || step.reportId !== reportId || step.scope !== reportAccessScope()) return
  const access = watchReportAccessScope()
  try {
    await step.resume()
    if (access.isCurrent() && useReportRecoveryStore.getState().step === step)
      clearReportRecovery(reportId)
  } catch (error) {
    if (access.isCurrent() && useReportRecoveryStore.getState().step === step) {
      useReportRecoveryStore.setState({ step: { ...step, failure: persistenceFailure(error) } })
    }
    throw error
  } finally {
    access.dispose()
  }
}
