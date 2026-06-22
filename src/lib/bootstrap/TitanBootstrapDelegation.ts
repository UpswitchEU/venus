import {
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  isDelegatedClientContextReadyForBootstrap,
  isDelegatedMercuryAccountantHandoff,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../mercury/sessionReadiness'
import { waitForBootstrapAuthReadiness } from './BootstrapReadinessGate'
import type { TitanBootstrapClientContextSnapshot } from './TitanBootstrapRequestPolicy'
import type { BootstrapContext, BootstrapHints } from './types'

type BootstrapLogger = Pick<Console, 'error' | 'info' | 'warn'>

export interface TitanBootstrapDelegationState {
  authReady: boolean
  authWaitMs: number
  delegatedHandoff: boolean
  needsClientContext: boolean
}

export function resolveTitanBootstrapDelegationState(
  context: BootstrapContext,
  hints: BootstrapHints
): Pick<TitanBootstrapDelegationState, 'delegatedHandoff' | 'needsClientContext'> {
  return {
    needsClientContext: shouldWaitForMercuryClientContextBeforeBootstrap({
      sourceApp: context.sourceApp,
      reportId: context.reportId,
      clientId: context.clientId,
      clientToken: context.clientToken,
      mercuryPersonaMode: context.mercuryPersonaMode,
      url: context.url,
      hasClientTokenHint: hints.hasClientToken,
    }),
    delegatedHandoff: isDelegatedMercuryAccountantHandoff(
      buildMercuryDelegatedHandoffSignalsFromBootstrapContext(context)
    ),
  }
}

async function getAuthErrorMessage(fallback: string): Promise<string> {
  const { useAuthStore } = await import('../auth')
  return useAuthStore.getState().error?.trim() || fallback
}

export async function waitForTitanBootstrapDelegatedReadiness({
  context,
  hints,
  logger,
  traceId,
}: {
  context: BootstrapContext
  hints: BootstrapHints
  logger: BootstrapLogger
  traceId: string
}): Promise<TitanBootstrapDelegationState> {
  const { delegatedHandoff, needsClientContext } = resolveTitanBootstrapDelegationState(
    context,
    hints
  )

  if (needsClientContext) {
    logger.info(`[Bootstrap:${traceId}] Mercury delegated flow — waiting for client context`, {
      reportId: context.reportId?.substring(0, 30),
      hasClientId: !!context.clientId?.trim(),
      hasClientToken: !!context.clientToken?.trim(),
      mercuryPersonaMode: context.mercuryPersonaMode,
      delegatedHandoff,
    })
  }

  const authWaitStart = performance.now()
  const authReady = await waitForBootstrapAuthReadiness({
    maxWaitMs: 2500,
    needsClientContext,
    urlClientId: context.clientId,
  })
  const authWaitMs = Math.round(performance.now() - authWaitStart)
  logger.info(`[Bootstrap:${traceId}] Auth wait complete`, {
    durationMs: authWaitMs,
    ready: authReady,
    needsClientContext,
  })

  if (!authReady) {
    if (needsClientContext) {
      const message = await getAuthErrorMessage(
        'Delegated client context was not ready before valuation bootstrap'
      )
      logger.error(`[Bootstrap:${traceId}] Aborting Titan bootstrap — delegated context required`, {
        durationMs: authWaitMs,
        hasClientId: !!context.clientId?.trim(),
      })
      throw new Error(message)
    }
    logger.warn(`[Bootstrap:${traceId}] Auth not ready after timeout, proceeding anyway`)
  }

  if (needsClientContext) {
    const { useClientContext } = await import('../../stores/clientContext')
    const ctx = useClientContext.getState()
    if (
      !isDelegatedClientContextReadyForBootstrap({
        needsMercuryClientContext: true,
        contextGateResolved: ctx.contextGateResolved,
        clientId: context.clientId,
        isActingAsClient: ctx.isActingAsClient,
        accountantId: ctx.accountant?.id ?? null,
        relationshipId: ctx.relationshipId,
      })
    ) {
      const message = await getAuthErrorMessage(
        'Delegated client context does not match the requested client'
      )
      logger.error(`[Bootstrap:${traceId}] Aborting Titan bootstrap — delegated context mismatch`, {
        urlClientId: context.clientId?.substring(0, 8) ?? null,
        storedRelationshipId: ctx.relationshipId?.substring(0, 8) ?? null,
      })
      throw new Error(message)
    }
  }

  return {
    authReady,
    authWaitMs,
    delegatedHandoff,
    needsClientContext,
  }
}

export async function readTitanBootstrapClientContextSnapshot(
  logger: BootstrapLogger
): Promise<TitanBootstrapClientContextSnapshot | null> {
  try {
    const { useClientContext } = await import('../../stores/clientContext')
    const contextState = useClientContext.getState()
    return {
      contextHeaders: contextState.getContextHeaders(),
      relationshipId: contextState.relationshipId,
    }
  } catch (error) {
    logger.warn('[Bootstrap] Failed to get client context headers (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
