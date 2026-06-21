import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { useClientContext } from '../../stores/clientContext'
import { generalLogger } from '../../utils/logger'
import { useAuthStore } from '../auth'
import { refreshDelegatedClientContextIfNeeded } from '../auth/delegatedClientContextRefresh'
import {
  isDelegatedClientContextReadyForBootstrap,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../mercury/sessionReadiness'
import { clearScopedGlobalBootstrapResult } from './BootstrapProviderCache'
import { getBootstrapContextCacheKey } from './contextCacheKey'
import { bootstrapService } from './SessionBootstrapService'
import type { BootstrapContext as BootstrapContextShape } from './types'

type DelegatedBootstrapReadiness = {
  authSettled: boolean
  delegatedReady: boolean
  needsDelegatedContext: boolean
}

type UseBootstrapDelegationReadinessParams = {
  activeContext: BootstrapContextShape
  bootstrapCompletedRef: MutableRefObject<boolean>
  bootstrapStartedRef: MutableRefObject<boolean>
  setBootstrapError: Dispatch<SetStateAction<string | null>>
  setIsBootstrapping: Dispatch<SetStateAction<boolean>>
}

export function resolveDelegatedBootstrapReadiness(
  activeContext: BootstrapContextShape
): DelegatedBootstrapReadiness {
  const authState = useAuthStore.getState()
  const authSettled = !authState.loading && !authState.isInitializing && !authState.isRefreshing
  const needsDelegatedContext = shouldWaitForMercuryClientContextBeforeBootstrap({
    sourceApp: activeContext.sourceApp,
    reportId: activeContext.reportId,
    clientId: activeContext.clientId,
    clientToken: activeContext.clientToken,
    mercuryPersonaMode: activeContext.mercuryPersonaMode,
    url: activeContext.url,
    hasClientTokenHint: !!activeContext.clientToken?.trim(),
  })

  if (!authSettled) {
    return { authSettled, delegatedReady: false, needsDelegatedContext }
  }

  if (!needsDelegatedContext) {
    return { authSettled, delegatedReady: true, needsDelegatedContext }
  }

  const ctx = useClientContext.getState()
  const delegatedReady = isDelegatedClientContextReadyForBootstrap({
    needsMercuryClientContext: true,
    contextGateResolved: ctx.contextGateResolved,
    clientId: activeContext.clientId,
    isActingAsClient: ctx.isActingAsClient,
    accountantId: ctx.accountant?.id ?? null,
    relationshipId: ctx.relationshipId,
  })

  return { authSettled, delegatedReady, needsDelegatedContext }
}

export function useBootstrapDelegationReadiness({
  activeContext,
  bootstrapCompletedRef,
  bootstrapStartedRef,
  setBootstrapError,
  setIsBootstrapping,
}: UseBootstrapDelegationReadinessParams): {
  authReady: boolean
  needsMercuryClientContext: boolean
} {
  const prevDelegationCacheKeyRef = useRef<string | null>(null)
  const delegationCacheKey = useMemo(
    () => getBootstrapContextCacheKey(activeContext),
    [activeContext]
  )

  const needsMercuryClientContext = useMemo(
    () =>
      shouldWaitForMercuryClientContextBeforeBootstrap({
        sourceApp: activeContext.sourceApp,
        reportId: activeContext.reportId,
        clientId: activeContext.clientId,
        clientToken: activeContext.clientToken,
        mercuryPersonaMode: activeContext.mercuryPersonaMode,
        url: activeContext.url,
        hasClientTokenHint: !!activeContext.clientToken?.trim(),
      }),
    [
      activeContext.sourceApp,
      activeContext.reportId,
      activeContext.clientId,
      activeContext.clientToken,
      activeContext.mercuryPersonaMode,
      activeContext.url,
    ]
  )

  useEffect(() => {
    if (!needsMercuryClientContext) return
    if (prevDelegationCacheKeyRef.current === null) {
      prevDelegationCacheKeyRef.current = delegationCacheKey
      return
    }
    if (prevDelegationCacheKeyRef.current === delegationCacheKey) return

    prevDelegationCacheKeyRef.current = delegationCacheKey
    bootstrapStartedRef.current = false
    bootstrapCompletedRef.current = false
    clearScopedGlobalBootstrapResult()
    bootstrapService.clearCache()
    bootstrapService.clearInflightCache()

    void refreshDelegatedClientContextIfNeeded({
      clientId: activeContext.clientId,
      reportId: activeContext.reportId,
      sourceApp: activeContext.sourceApp,
      mercuryPersonaMode: activeContext.mercuryPersonaMode,
      clientToken: activeContext.clientToken,
      url: activeContext.url,
    })
  }, [
    delegationCacheKey,
    needsMercuryClientContext,
    activeContext.clientId,
    activeContext.reportId,
    activeContext.sourceApp,
    activeContext.mercuryPersonaMode,
    activeContext.clientToken,
    activeContext.url,
    bootstrapCompletedRef,
    bootstrapStartedRef,
  ])

  const mercuryClientContextReady = useClientContext((s) =>
    isDelegatedClientContextReadyForBootstrap({
      needsMercuryClientContext,
      contextGateResolved: s.contextGateResolved,
      clientId: activeContext.clientId,
      isActingAsClient: s.isActingAsClient,
      accountantId: s.accountant?.id ?? null,
      relationshipId: s.relationshipId,
    })
  )

  const authStoreReady = useAuthStore((s) => !s.loading && !s.isInitializing && !s.isRefreshing)
  const authError = useAuthStore((s) => s.error)
  const authReady = authStoreReady && mercuryClientContextReady

  useEffect(() => {
    if (!needsMercuryClientContext || mercuryClientContextReady || !authStoreReady) return
    const message = authError?.trim()
    if (!message || bootstrapCompletedRef.current) return

    generalLogger.warn('[BootstrapProvider] Mercury client context failed — surfacing error', {
      reportId: activeContext.reportId?.substring(0, 30),
      hasClientId: !!activeContext.clientId?.trim(),
    })
    setBootstrapError(message)
    setIsBootstrapping(false)
  }, [
    needsMercuryClientContext,
    mercuryClientContextReady,
    authStoreReady,
    authError,
    activeContext.reportId,
    activeContext.clientId,
    bootstrapCompletedRef,
    setBootstrapError,
    setIsBootstrapping,
  ])

  return { authReady, needsMercuryClientContext }
}
