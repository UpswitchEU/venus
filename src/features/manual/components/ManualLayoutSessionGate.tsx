import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useSessionStore } from '../../../store/useSessionStore'
import { manualSessionMatchesReport } from '../utils/manualSessionIdentifiers'
import { CalculatorShellSkeleton, ManualLayoutSessionError } from './ManualLayoutStatus'

export function ManualLayoutSessionGate({
  children,
  reportId,
}: {
  children: ReactNode
  reportId: string
}) {
  const tErrors = useTranslations('errors')
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const sessionError = useSessionStore((s) => s.errorMessage)
  const sessionMatchesReport = manualSessionMatchesReport(session, reportId)
  const isInitializing = status === 'idle' || status === 'loading'

  if (isInitializing || !session || !sessionMatchesReport) {
    return <CalculatorShellSkeleton />
  }

  if (sessionError) {
    return (
      <ManualLayoutSessionError
        message={sessionError}
        reloadLabel={tErrors('session.reloadPage')}
        title={tErrors('session.title')}
      />
    )
  }

  return children
}
