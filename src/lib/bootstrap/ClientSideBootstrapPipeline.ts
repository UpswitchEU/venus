import { buildBootstrapFallbackState, buildBootstrapUIHints } from './BootstrapStateBuilders'
import type { AuthResolver } from './resolvers/AuthResolver'
import type { PrefillResolver } from './resolvers/PrefillResolver'
import type { SessionResolver } from './resolvers/SessionResolver'
import type {
  BootstrapContext,
  BootstrapHints,
  IdentityState,
  SessionBootstrapState,
} from './types'
import { BOOTSTRAP_VERSION, DEFAULT_IDENTITY } from './types'
import { parseBootstrapHints, truncateForLog } from './utils'

export interface ClientSideBootstrapOptions {
  /** Timeout for bootstrap process in ms. */
  timeout?: number
  /** Skip auth resolution for server-side or already-authenticated contexts. */
  skipAuth?: boolean
  /** Use cached bootstrap if available. */
  useCache?: boolean
}

type ClientSideBootstrapLogger = Pick<Console, 'error' | 'info'>

interface ClientSideBootstrapPipelineInput {
  authResolver: AuthResolver
  context: BootstrapContext
  logger: ClientSideBootstrapLogger
  options: ClientSideBootstrapOptions
  prefillResolver: PrefillResolver
  sessionResolver: SessionResolver
  startTime: number
}

interface ResolveClientSideBootstrapStateInput
  extends Pick<
    ClientSideBootstrapPipelineInput,
    'authResolver' | 'context' | 'logger' | 'options' | 'prefillResolver' | 'sessionResolver'
  > {
  hints: BootstrapHints
}

async function resolveClientSideBootstrapState({
  authResolver,
  context,
  hints,
  logger,
  options,
  prefillResolver,
  sessionResolver,
}: ResolveClientSideBootstrapStateInput): Promise<SessionBootstrapState> {
  const phaseStart = performance.now()

  let identity: IdentityState
  if (options.skipAuth) {
    identity = DEFAULT_IDENTITY
  } else {
    const authResult = await authResolver.resolve(context, hints)
    identity = authResult.data
  }
  const phase1Ms = Math.round(performance.now() - phaseStart)
  logger.info('[Bootstrap] Phase 1 (auth) complete', { durationMs: phase1Ms })

  const phase2Start = performance.now()
  const [sessionResult, prefillResult] = await Promise.all([
    sessionResolver.resolve(context, hints, identity),
    prefillResolver.resolve(context, hints, identity),
  ])
  const phase2Ms = Math.round(performance.now() - phase2Start)
  logger.info('[Bootstrap] Phase 2 (session+prefill) complete', { durationMs: phase2Ms })

  const report = sessionResult.data
  const prefillData = prefillResult.data
  const ui = buildBootstrapUIHints({ context, hints, identity, report, prefillData })
  const totalMs = Math.round(performance.now() - phaseStart)
  logger.info('[Bootstrap] Phase 3 (ui hints) complete', { totalDurationMs: totalMs })

  return {
    identity,
    report,
    prefillData,
    ui,
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
    bootstrapDurationMs: 0,
  }
}

export async function executeClientSideBootstrapPipeline({
  authResolver,
  context,
  logger,
  options,
  prefillResolver,
  sessionResolver,
  startTime,
}: ClientSideBootstrapPipelineInput): Promise<SessionBootstrapState> {
  const hints = parseBootstrapHints(context)

  logger.info('[Bootstrap] Starting bootstrap', {
    reportId: context.reportId ? truncateForLog(context.reportId) : 'new',
    hasClientToken: hints.hasClientToken,
    isEmbedded: hints.isEmbedded,
  })

  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Bootstrap timeout')), options.timeout ?? 10000)
    })

    const result = await Promise.race([
      resolveClientSideBootstrapState({
        authResolver,
        context,
        hints,
        logger,
        options,
        prefillResolver,
        sessionResolver,
      }),
      timeoutPromise,
    ])

    const durationMs = performance.now() - startTime

    logger.info('[Bootstrap] Bootstrap complete', {
      durationMs: Math.round(durationMs),
      identityType: result.identity.type,
      reportMode: result.report.mode,
      prefillConfidence: result.prefillData.confidence.toFixed(2),
      prefilledFields: result.prefillData.fieldsPopulated.length,
    })

    return {
      ...result,
      bootstrapDurationMs: durationMs,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('[Bootstrap] Bootstrap failed:', errorMessage)
    return buildBootstrapFallbackState({ context, hints, startTime })
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
