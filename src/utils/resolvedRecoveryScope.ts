import { urlRequiresDelegatedClientContext } from '../lib/auth/persistedClientContext'
import { useAuthStore } from '../lib/auth/store'
import { useClientContext } from '../stores/clientContext'
import { reportAccessScope } from './reportAccessScope'

/** Do not consume or overwrite recovery while the owning identity is unresolved. */
export function resolvedRecoveryScope(): string | null {
  const auth = useAuthStore.getState()
  if (auth.loading || auth.isInitializing) return null
  if (urlRequiresDelegatedClientContext() && !useClientContext.getState().contextGateResolved) {
    return null
  }
  return reportAccessScope()
}
