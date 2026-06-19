import {
  isDelegatedClientContextReadyForBootstrap,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../mercury/sessionReadiness'
import type { BootstrapContext } from './types'

export async function isDelegatedBootstrapCacheAllowed(
  context: BootstrapContext,
  hasClientTokenHint = false
): Promise<boolean> {
  const needsClientContext = shouldWaitForMercuryClientContextBeforeBootstrap({
    sourceApp: context.sourceApp,
    reportId: context.reportId,
    clientId: context.clientId,
    clientToken: context.clientToken,
    mercuryPersonaMode: context.mercuryPersonaMode,
    url: context.url,
    hasClientTokenHint,
  })
  if (!needsClientContext) return true

  const { useClientContext } = await import('../../stores/clientContext')
  const ctx = useClientContext.getState()
  return isDelegatedClientContextReadyForBootstrap({
    needsMercuryClientContext: true,
    contextGateResolved: ctx.contextGateResolved,
    clientId: context.clientId,
    isActingAsClient: ctx.isActingAsClient,
    accountantId: ctx.accountant?.id ?? null,
    relationshipId: ctx.relationshipId,
  })
}

export async function waitForBootstrapAuthReadiness(input: {
  maxWaitMs: number
  needsClientContext?: boolean
  urlClientId?: string | null
}): Promise<boolean> {
  const { useAuthStore } = await import('../auth')
  const { useClientContext } = await import('../../stores/clientContext')
  const start = Date.now()
  // When clientToken/needs-context present, client context exchange must complete.
  // 3000ms is enough headroom: get-client-context is a single round-trip that
  // typically completes in 500-2000ms. The previous 5000ms cap routinely added
  // dead-air on Mercury->Venus accountant opens when context arrived in <1s.
  const effectiveMaxWait = input.needsClientContext ? 3000 : input.maxWaitMs

  const isAuthAndContextReady = (): boolean => {
    const authState = useAuthStore.getState()
    // Require user (not just error): bootstrap needs valid auth; error means unauthenticated.
    const authReady =
      !authState.loading && !authState.isInitializing && !authState.isRefreshing && !!authState.user
    if (!authReady) return false
    if (input.needsClientContext) {
      const ctx = useClientContext.getState()
      if (
        !isDelegatedClientContextReadyForBootstrap({
          needsMercuryClientContext: true,
          contextGateResolved: ctx.contextGateResolved,
          clientId: input.urlClientId,
          isActingAsClient: ctx.isActingAsClient,
          accountantId: ctx.accountant?.id ?? null,
          relationshipId: ctx.relationshipId,
        })
      ) {
        return false
      }
    }
    return true
  }

  if (isAuthAndContextReady()) {
    return true
  }

  while (Date.now() - start < effectiveMaxWait) {
    if (isAuthAndContextReady()) {
      return true
    }
    await new Promise((r) => setTimeout(r, 50))
  }

  return false
}
