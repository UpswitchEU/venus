import { useAuthStore } from '../lib/auth/store'
import { useClientContext } from '../stores/clientContext'

/** Browser-local identity only. Never use this key as server authorization. */
export function reportAccessScope(): string {
  const client = useClientContext.getState()
  return JSON.stringify([
    useAuthStore.getState().user?.id ?? null,
    client.isActingAsClient ? (client.accountant?.id ?? null) : null,
    client.isActingAsClient ? (client.relationshipId ?? null) : null,
  ])
}

/** Invalidate work even if the user switches away and back before it completes. */
export function watchReportAccessScope() {
  const scope = reportAccessScope()
  let invalidated = false
  const check = () => {
    if (reportAccessScope() !== scope) invalidated = true
  }
  const unsubscribeAuth = useAuthStore.subscribe(check)
  const unsubscribeClient = useClientContext.subscribe(check)
  return {
    isCurrent: () => !invalidated && reportAccessScope() === scope,
    dispose: () => {
      unsubscribeAuth()
      unsubscribeClient()
    },
  }
}
