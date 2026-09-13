import { useAuthStore } from '../lib/auth'
import { useClientContext } from '../stores/clientContext'

/** Browser-local identity only. Never use this key as server authorization. */
export function reportAccessScope(): string {
  const client = useClientContext.getState()
  return JSON.stringify([
    useAuthStore.getState().user?.id ?? null,
    client.isActingAsClient ? client.accountant?.id ?? null : null,
    client.isActingAsClient ? client.relationshipId ?? null : null,
  ])
}
