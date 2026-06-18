import { isAccountantTierRole } from '../../constants/accountantPlanMethods'
import { fetchWithBySession404Retry } from '../../utils/fetchWithBySession404Retry'
import { isSessionKey, isUuid, looksLikeExistingReportId } from '../../utils/identifiers'
import { generalLogger } from '../../utils/logger'
import { isMercuryAdvisorModeParam } from '../../utils/reportMode'
import { createRandomId } from '../../utils/secureRandom'
import { authMetrics, logAuthError, trackAuthFailure, trackAuthSuccess } from '../authLogger'
import { isSafeMercuryReturnUrlInput } from '../return-url'
import {
  initClientContextPromise,
  rejectClientContext,
  resolveClientContext,
} from './clientContextGate'
import { API_URL } from './config'
import { isReloadLooping, markInitSuccess, wasRecentlyInitialized } from './initGuards'
import {
  getInitPromise,
  isInitCompleted,
  setInitCompleted,
  setInitPromise,
  setInitTraceId,
} from './initRuntime'
import {
  clearDelegatedClientContext,
  clearPersistedClientContextStorage,
  isPersistedContextStaleForUrl,
} from './persistedClientContext'
import { getCachedRequest } from './requestCache'
import { useAuthStore } from './store'
import { sanitizeUrl } from './urlSecurity'

function generateTraceId(): string {
  return createRandomId('init', 8)
}

export async function initializeAuth(): Promise<void> {
  if (isInitCompleted()) {
    return
  }

  if (typeof window !== 'undefined' && window.__isLoggingOut) {
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setIsInitializing(false)
    return
  }

  if (isReloadLooping()) {
    generalLogger.error('[Auth] Reload loop detected — breaking cycle')
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setIsInitializing(false)
    useAuthStore
      .getState()
      .setError(
        'Unable to sign in. The page kept reloading. Please close this tab, reopen it, and try again.'
      )
    setInitCompleted(true)
    return
  }

  const hasClientToken =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('clientToken')

  if (!hasClientToken && wasRecentlyInitialized()) {
    const existing = useAuthStore.getState().user
    if (existing) {
      generalLogger.debug('[Auth] Skipping init — recently succeeded (sessionStorage throttle)')
      setInitCompleted(true)
      useAuthStore.getState().setLoading(false)
      useAuthStore.getState().setIsInitializing(false)
      return
    }

    generalLogger.debug(
      '[Auth] SessionStorage throttle active but Zustand user is null (page reload)'
    )
  }

  const existingInitPromise = getInitPromise()
  if (existingInitPromise) {
    return existingInitPromise
  }

  const traceId = generateTraceId()
  setInitTraceId(traceId)

  const initPromise = (async () => {
    const { setLoading, checkSession, exchangeToken, setUser, setIsInitializing } =
      useAuthStore.getState()

    generalLogger.info(`[Auth:${traceId}] Starting initialization flow`)

    try {
      setLoading(true)
      setIsInitializing(true)

      const params = new URLSearchParams(window.location.search)
      const clientToken = params.get('clientToken')

      const returnUrl = params.get('return_url')
      const sourceApp = params.get('source')

      if (isSafeMercuryReturnUrlInput(returnUrl)) {
        sessionStorage.setItem('upswitch_return_url', returnUrl.trim())
        if (sourceApp) {
          sessionStorage.setItem('upswitch_source', sourceApp)
        }
        if (process.env.NODE_ENV === 'development') {
          generalLogger.debug('[Auth] Return URL captured', {
            returnUrl,
            source: sourceApp,
          })
        }
      } else {
        sessionStorage.removeItem('upswitch_return_url')
        sessionStorage.removeItem('upswitch_source')
      }

      if (clientToken) {
        generalLogger.info(`[Auth:${traceId}] Client token detected - starting context exchange`)
        const clientContextExchange = initClientContextPromise()

        if (clientToken.length < 20 || !/^[A-Za-z0-9._-]+$/.test(clientToken)) {
          generalLogger.warn(`[Auth:${traceId}] Invalid client token format - skipping exchange`)
          sanitizeUrl(['clientToken', 'client_id', 'prefilledQuery', 'autoSend'])
          const { useClientContext } = await import('../../stores/clientContext')
          clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
          const message =
            'Invalid valuation link. Please create a new valuation from the client page.'
          rejectClientContext(new Error(message))
          useAuthStore.getState().setError(message)
        } else {
          clearPersistedClientContextStorage()

          void (async () => {
            try {
              const tokenForExchange = clientToken

              sanitizeUrl(['clientToken', 'client_id', 'prefilledQuery', 'autoSend'])

              let lastError: Error | null = null
              const maxRetries = 3
              const baseDelay = 500

              for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                  const cacheKey = `exchange-client-context:${tokenForExchange.substring(0, 20)}`

                  const response = await getCachedRequest(cacheKey, async () => {
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 5000)

                    try {
                      return await fetch(`${API_URL}/api/v2/auth/exchange-client-context`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ token: tokenForExchange }),
                        signal: controller.signal,
                      })
                    } finally {
                      clearTimeout(timeoutId)
                    }
                  })

                  if (response.ok) {
                    const context = await response.json()

                    if (!context.accountantUser || !context.relationship) {
                      throw new Error('Invalid client context structure received')
                    }

                    const user = await checkSession()
                    if (!user) {
                      throw new Error('Failed to authenticate after client context exchange')
                    }

                    setUser(user)

                    const { useClientContext } = await import('../../stores/clientContext')
                    useClientContext.getState().setClientContext(context)

                    const url = new URL(window.location.href)
                    url.searchParams.delete('clientToken')
                    url.searchParams.delete('client_id')
                    url.searchParams.delete('prefilledQuery')
                    window.history.replaceState({}, '', url.pathname + (url.search || ''))

                    generalLogger.info(`[Auth:${traceId}] Client context exchange successful`)
                    resolveClientContext()

                    return
                  }

                  const errorData = await response.json().catch(() => ({}))
                  const status = response.status

                  if (status === 401 || status === 403) {
                    throw new Error(
                      errorData.message ||
                        'Client context token expired or invalid. Please try creating a new valuation.'
                    )
                  }

                  if (status >= 500 && attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt)
                    await new Promise((resolve) => setTimeout(resolve, delay))
                    continue
                  }

                  throw new Error(
                    errorData.message || `Failed to exchange client context token (${status})`
                  )
                } catch (error) {
                  lastError = error instanceof Error ? error : new Error(String(error))

                  if (
                    lastError.message.includes('expired') ||
                    lastError.message.includes('invalid') ||
                    lastError.message.includes('Invalid client context')
                  ) {
                    break
                  }

                  if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt)
                    if (process.env.NODE_ENV === 'development') {
                      generalLogger.warn(
                        `[Auth] Client context exchange failed, retrying in ${delay}ms...`,
                        {
                          attempt: attempt + 1,
                          maxRetries,
                          error: lastError.message,
                        }
                      )
                    }
                    await new Promise((resolve) => setTimeout(resolve, delay))
                  }
                }
              }

              if (lastError) {
                throw lastError
              }
            } catch (error) {
              rejectClientContext(error instanceof Error ? error : new Error(String(error)))
              throw error
            }
          })().catch(() => undefined)

          try {
            await clientContextExchange
            return
          } catch (error) {
            const lastError = error instanceof Error ? error : new Error(String(error))
            generalLogger.error(`[Auth:${traceId}] Client context exchange failed`, {
              message: lastError.message,
            })

            const errorMessage = lastError.message.includes('expired')
              ? 'The valuation link has expired. Please create a new valuation from the client page.'
              : lastError.message.includes('invalid')
                ? 'Invalid valuation link. Please create a new valuation from the client page.'
                : 'Unable to load client context. Please try again or create a new valuation.'

            useAuthStore.getState().setError(errorMessage)

            const { useClientContext } = await import('../../stores/clientContext')
            clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())

            const url = new URL(window.location.href)
            url.searchParams.delete('clientToken')
            url.searchParams.delete('client_id')
            url.searchParams.delete('prefilledQuery')
            window.history.replaceState({}, '', url.pathname + (url.search || ''))

            return
          }
        }
      }

      if (!clientToken) {
        const user = await checkSession()

        if (user) {
          trackAuthSuccess(user.id, 'cookie')
          authMetrics.recordSuccess()

          const clientIdParam = params.get('clientId')?.trim() || null

          // Any advisor-tier open with `?clientId=` needs delegated context — not only
          // when `mode=accountant` is present (CalculatorRedirect always sets both, but
          // bootstrap waits on clientId alone and would race if we gated on mode here).
          if (clientIdParam && isAccountantTierRole(user.role)) {
            generalLogger.info(
              `[Auth:${traceId}] Advisor-tier clientId in URL — fetching client context`,
              { clientId: clientIdParam.substring(0, 8) }
            )

            initClientContextPromise()

            const { useClientContext } = await import('../../stores/clientContext')
            const persistedContext = useClientContext.getState()
            if (isPersistedContextStaleForUrl(persistedContext.relationshipId, clientIdParam)) {
              generalLogger.warn(
                `[Auth:${traceId}] Clearing stale client context before get-client-context`,
                {
                  storedRelationshipId: persistedContext.relationshipId?.substring(0, 8) ?? null,
                  urlClientId: clientIdParam.substring(0, 8),
                }
              )
              clearDelegatedClientContext(() => persistedContext.clearClientContext())
            } else if (
              persistedContext.isActingAsClient &&
              persistedContext.accountant?.id &&
              persistedContext.relationshipId === clientIdParam
            ) {
              generalLogger.debug(
                `[Auth:${traceId}] Persisted client context matches URL — unblocking gate while refreshing`
              )
              resolveClientContext()
            }

            try {
              const ctxAbort = new AbortController()
              const ctxTimeout = setTimeout(() => ctxAbort.abort(), 8000)
              const response = await fetch(`${API_URL}/api/v2/auth/get-client-context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ clientId: clientIdParam }),
                signal: ctxAbort.signal,
              })
              clearTimeout(ctxTimeout)

              if (response.ok) {
                const context = await response.json()

                if (!context.accountantUser || !context.relationship) {
                  throw new Error('Invalid client context structure received')
                }

                const { useClientContext } = await import('../../stores/clientContext')
                useClientContext.getState().setClientContext(context)

                generalLogger.info(`[Auth:${traceId}] Client context established via clientId`)
                resolveClientContext()
              } else {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(
                  errorData.message || `Failed to fetch client context (${response.status})`
                )
              }
            } catch (error) {
              generalLogger.error(`[Auth:${traceId}] Failed to fetch client context`, {
                error: error instanceof Error ? error.message : String(error),
              })
              rejectClientContext(error instanceof Error ? error : new Error(String(error)))

              clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())

              const errorMessage =
                error instanceof Error ? error.message : 'Failed to establish client context'
              useAuthStore.getState().setError(errorMessage)
            }
          }

          if (!clientIdParam && isAccountantTierRole(user.role)) {
            const reportIdMatch = window.location.pathname.match(/\/reports\/([^/]+)/)
            const reportId = reportIdMatch ? reportIdMatch[1] : null
            const mercuryDelegatedExisting =
              params.get('source') === 'mercury' &&
              isMercuryAdvisorModeParam(params.get('mode')) &&
              !!reportId &&
              looksLikeExistingReportId(reportId)

            if (reportId && (isSessionKey(reportId) || isUuid(reportId))) {
              const { useClientContext } = await import('../../stores/clientContext')
              const contextState = useClientContext.getState()
              const shouldRestoreFromReport =
                mercuryDelegatedExisting || !contextState.isActingAsClient

              if (shouldRestoreFromReport) {
                generalLogger.debug(
                  `[Auth:${traceId}] Checking report for accountant_customer_id to restore context`,
                  {
                    mercuryDelegatedExisting,
                    hasActingContext: contextState.isActingAsClient,
                    storedRelationshipId: contextState.relationshipId?.substring(0, 8) ?? null,
                  }
                )

                if (mercuryDelegatedExisting) {
                  initClientContextPromise()
                }

                const failDelegatedRestore = (message: string) => {
                  if (!mercuryDelegatedExisting) return
                  rejectClientContext(new Error(message))
                  clearDelegatedClientContext(() =>
                    useClientContext.getState().clearClientContext()
                  )
                  useAuthStore.getState().setError(message)
                }

                try {
                  const reportEndpoint = isSessionKey(reportId)
                    ? `${API_URL}/api/v2/valuations/reports/by-session/${reportId}`
                    : `${API_URL}/api/v2/valuations/reports/${reportId}`

                  const reportResponse = await fetchWithBySession404Retry(
                    reportEndpoint,
                    {
                      method: 'GET',
                      credentials: 'include',
                      headers: { Accept: 'application/json' },
                    },
                    {
                      perAttemptTimeoutMs: 8000,
                      log: (message, context) =>
                        generalLogger.debug(`[Auth:${traceId}] ${message}`, context),
                    }
                  )

                  if (reportResponse.ok) {
                    const reportData = await reportResponse.json()
                    const report = reportData.data || reportData
                    const accountantCustomerId = report.accountant_customer_id

                    if (accountantCustomerId) {
                      const latestContext = useClientContext.getState()
                      const alreadyMatchesReport =
                        latestContext.isActingAsClient &&
                        latestContext.accountant?.id &&
                        latestContext.relationshipId === accountantCustomerId

                      if (alreadyMatchesReport) {
                        generalLogger.debug(
                          `[Auth:${traceId}] Client context already matches report accountant_customer_id`
                        )
                        if (mercuryDelegatedExisting) {
                          resolveClientContext()
                        }
                      } else {
                        if (
                          latestContext.relationshipId &&
                          latestContext.relationshipId !== accountantCustomerId
                        ) {
                          generalLogger.warn(
                            `[Auth:${traceId}] Clearing stale client context before report restore`,
                            {
                              storedRelationshipId: latestContext.relationshipId.substring(0, 8),
                              reportCustomerId: accountantCustomerId.substring(0, 8),
                            }
                          )
                          clearDelegatedClientContext(() =>
                            useClientContext.getState().clearClientContext()
                          )
                        }

                        generalLogger.info(
                          `[Auth:${traceId}] Found accountant_customer_id in report, restoring client context`
                        )

                        initClientContextPromise()

                        const ctxAbort2 = new AbortController()
                        const ctxTimeout2 = setTimeout(() => ctxAbort2.abort(), 5000)
                        const contextResponse = await fetch(
                          `${API_URL}/api/v2/auth/get-client-context`,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ clientId: accountantCustomerId }),
                            signal: ctxAbort2.signal,
                          }
                        )
                        clearTimeout(ctxTimeout2)

                        if (contextResponse.ok) {
                          const context = await contextResponse.json()

                          if (context.accountantUser && context.relationship) {
                            useClientContext.getState().setClientContext(context)

                            generalLogger.info(
                              `[Auth:${traceId}] Client context restored from report`
                            )
                            resolveClientContext()
                          } else {
                            const message = 'Invalid client context structure received'
                            generalLogger.warn(`[Auth:${traceId}] ${message} (from report)`)
                            failDelegatedRestore(message)
                          }
                        } else {
                          const errorData = await contextResponse.json().catch(() => ({}))
                          const message =
                            errorData.message ||
                            `Failed to fetch client context (${contextResponse.status})`
                          generalLogger.warn(
                            `[Auth:${traceId}] Failed to fetch client context from report`,
                            { message }
                          )
                          failDelegatedRestore(message)
                        }
                      }
                    } else if (mercuryDelegatedExisting) {
                      const message =
                        'This report is not linked to a client — delegated advisor context is unavailable'
                      generalLogger.warn(`[Auth:${traceId}] ${message}`)
                      failDelegatedRestore(message)
                    } else {
                      generalLogger.debug(
                        `[Auth:${traceId}] Report has no accountant_customer_id - not an accountant-client report`
                      )
                    }
                  } else if (mercuryDelegatedExisting) {
                    const message = `Report not accessible (${reportResponse.status})`
                    generalLogger.warn(`[Auth:${traceId}] ${message}`)
                    failDelegatedRestore(message)
                  } else {
                    generalLogger.debug(
                      `[Auth:${traceId}] Report not found or inaccessible (${reportResponse.status}) - may be new report`
                    )
                  }
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : 'Failed to restore client context from report'
                  generalLogger.warn(
                    `[Auth:${traceId}] Failed to restore client context from report`,
                    { error: message, mercuryDelegatedExisting }
                  )
                  failDelegatedRestore(message)
                }
              }
            }
          }

          return
        }
      }

      const token = params.get('token')

      if (token) {
        try {
          const user = await exchangeToken(token)

          if (user) {
            trackAuthSuccess(user.id, 'token')
            authMetrics.recordSuccess()
          }
        } catch (tokenError) {
          generalLogger.error('[Auth] Token exchange failed', {
            error: tokenError instanceof Error ? tokenError.message : String(tokenError),
          })
          trackAuthFailure(
            tokenError instanceof Error ? tokenError.message : 'Token exchange failed',
            { method: 'token-exchange' }
          )
          authMetrics.recordFailure()
        }

        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url.toString())

        return
      }

      setUser(null)
    } catch (error) {
      generalLogger.error(`[Auth:${traceId}] Initialization failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      logAuthError('Auth initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      trackAuthFailure(error instanceof Error ? error.message : 'Initialization failed', {
        method: 'init',
      })
      authMetrics.recordFailure()

      setUser(null)
    } finally {
      generalLogger.info(`[Auth:${traceId}] Initialization complete`)
      setLoading(false)
      setIsInitializing(false)
      setInitCompleted(true)
      setInitPromise(null)
      if (useAuthStore.getState().user) {
        markInitSuccess()
      }
    }
  })()

  setInitPromise(initPromise)
  return initPromise
}
