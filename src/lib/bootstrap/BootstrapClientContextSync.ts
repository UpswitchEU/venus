import type { IdentityState } from './types'

type BootstrapClientContextLogger = Pick<Console, 'info' | 'warn'>

export async function syncBootstrapClientContext(
  identity: IdentityState,
  logger: BootstrapClientContextLogger
): Promise<void> {
  try {
    const { useClientContext } = await import('../../stores/clientContext')
    const contextStore = useClientContext.getState()

    if (identity.type === 'accountant_for_client' && identity.clientContext) {
      const bootstrapContext = identity.clientContext
      const storedClientId = contextStore.client?.id
      const storedRelationshipId = contextStore.relationshipId

      if (
        (storedClientId ?? null) !== (bootstrapContext.clientUserId ?? null) ||
        storedRelationshipId !== bootstrapContext.relationshipId
      ) {
        logger.info('[Bootstrap] Syncing client context from bootstrap response', {
          oldClientId: storedClientId?.substring(0, 8) || 'none',
          newClientId: bootstrapContext.clientUserId?.substring(0, 8) ?? 'null',
          oldRelationshipId: storedRelationshipId?.substring(0, 8) || 'none',
          newRelationshipId: bootstrapContext.relationshipId.substring(0, 8),
        })

        const clientUserId = bootstrapContext.clientUserId
        contextStore.setClientContext({
          accountantUser: {
            id: bootstrapContext.accountantUserId,
            email: bootstrapContext.accountantEmail || '',
            full_name: '',
          },
          clientUser: clientUserId
            ? {
                id: clientUserId,
                email: bootstrapContext.clientEmail || '',
                full_name: bootstrapContext.clientCompanyName || '',
                avatar_url: null,
              }
            : null,
          relationship: {
            id: bootstrapContext.relationshipId,
            customer_name: bootstrapContext.clientCompanyName || '',
          },
        })

        const { resolveDelegatedContextGateIfBootstrapSynced } = await import(
          '../auth/clientContextGate'
        )
        resolveDelegatedContextGateIfBootstrapSynced(bootstrapContext.relationshipId)
      }
    } else if (identity.type === 'authenticated' && contextStore.isActingAsClient) {
      logger.warn('[Bootstrap] Clearing stale client context', {
        storedClientId: contextStore.client?.id?.substring(0, 8) || 'none',
        identityType: identity.type,
        note: 'Bootstrap returned authenticated identity but store had client context',
      })

      const { clearDelegatedClientContext } = await import('../auth/persistedClientContext')
      clearDelegatedClientContext(() => contextStore.clearClientContext())
    }
  } catch (error) {
    logger.warn('[Bootstrap] Failed to sync client context (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
