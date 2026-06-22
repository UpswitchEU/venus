/**
 * Locks Mercury → Venus report URL shapes to delegated-handoff detection.
 * Regression guard for preview crash: advisor opens existing report while
 * bootstrap is in flight (React #185 when optimistic shell collides).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildMercuryDelegatedHandoffSignals,
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  isDelegatedClientContextReadyForUrl,
  isDelegatedMercuryAccountantHandoff,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../../lib/mercury/sessionReadiness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mercuryRootFromVenusTests = '../../../../../apps/mercury'

/** Production preview incident (2026-05-27). */
const PREVIEW_INCIDENT_SEARCH =
  'flow=manual&mode=accountant&locale=nl&return_url=https%3A%2F%2Fpreview.upswitch.app%2Fnl%2Fadvisor%2Fclients%2Fe25ce3b7-2e1e-4c6d-890d-eb826d527afd&source=mercury&benchmark_contribution=1&clientId=e25ce3b7-2e1e-4c6d-890d-eb826d527afd'

const PREVIEW_REPORT_ID = 'dba236f5-31eb-4ab9-b995-e52c64dce70c'

/** Shorter handoff URL shape observed on preview.valuation.upswitch.app (2026-05-28). */
const PREVIEW_VALUATION_HOST_SEARCH =
  'flow=manual&mode=accountant&source=mercury&benchmark_contribution=1&clientId=e25ce3b7-2e1e-4c6d-890d-eb826d527afd'

const PREVIEW_VALUATION_HOST_REPORT_ID = '35a422c3-028f-4d46-88e5-27ac5519826c'

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
}

describe('sessionReadiness Mercury report URL contract', () => {
  it('preview incident query is a delegated accountant handoff on an existing report', () => {
    const params = parseSearchParams(PREVIEW_INCIDENT_SEARCH)
    expect(params.get('source')).toBe('mercury')
    expect(params.get('mode')).toBe('accountant')
    expect(params.get('clientId')).toBe('e25ce3b7-2e1e-4c6d-890d-eb826d527afd')

    const signals = buildMercuryDelegatedHandoffSignals({
      isFromMercury: params.get('source') === 'mercury',
      reportId: PREVIEW_REPORT_ID,
      clientId: params.get('clientId'),
      clientToken: params.get('clientToken'),
      mode: params.get('mode'),
    })
    expect(signals.urlIndicatesExisting).toBe(true)
    expect(isDelegatedMercuryAccountantHandoff(signals)).toBe(true)
  })

  it('preview.valuation host handoff query is a delegated accountant handoff on an existing report', () => {
    const params = parseSearchParams(PREVIEW_VALUATION_HOST_SEARCH)
    expect(params.get('source')).toBe('mercury')
    expect(params.get('mode')).toBe('accountant')
    expect(params.get('benchmark_contribution')).toBe('1')

    const signals = buildMercuryDelegatedHandoffSignals({
      isFromMercury: params.get('source') === 'mercury',
      reportId: PREVIEW_VALUATION_HOST_REPORT_ID,
      clientId: params.get('clientId'),
      mode: params.get('mode'),
    })
    expect(signals.urlIndicatesExisting).toBe(true)
    expect(isDelegatedMercuryAccountantHandoff(signals)).toBe(true)
  })

  it('preview incident clientId must match stored relationshipId before bootstrap', () => {
    const params = parseSearchParams(PREVIEW_INCIDENT_SEARCH)
    const clientId = params.get('clientId')
    expect(clientId).toBe('e25ce3b7-2e1e-4c6d-890d-eb826d527afd')

    expect(
      isDelegatedClientContextReadyForUrl({
        clientId,
        isActingAsClient: true,
        accountantId: 'acc-1',
        relationshipId: clientId,
      })
    ).toBe(true)

    expect(
      isDelegatedClientContextReadyForUrl({
        clientId,
        isActingAsClient: true,
        accountantId: 'acc-1',
        relationshipId: '5c5bfc87-13f3-48c2-be7f-506e7f4748e7',
      })
    ).toBe(false)
  })

  it('matches CalculatorRedirectClient existing-report Venus URL shape', () => {
    const params = new URLSearchParams()
    params.set('flow', 'manual')
    params.set('mode', 'accountant')
    params.set('locale', 'nl')
    params.set('return_url', 'https://preview.upswitch.app/nl/advisor/clients/client-1')
    params.set('source', 'mercury')
    params.set('clientId', 'client-1')

    const signals = buildMercuryDelegatedHandoffSignals({
      isFromMercury: true,
      reportId: PREVIEW_REPORT_ID,
      clientId: params.get('clientId'),
      mode: params.get('mode'),
    })
    expect(isDelegatedMercuryAccountantHandoff(signals)).toBe(true)
  })

  it('matches ValuationModal embedded iframe shape', () => {
    const signals = buildMercuryDelegatedHandoffSignals({
      isFromMercury: true,
      reportId: PREVIEW_REPORT_ID,
      clientId: 'client-1',
      mode: 'accountant',
    })
    expect(isDelegatedMercuryAccountantHandoff(signals)).toBe(true)
  })

  it('BootstrapProvider runBootstrap defers Titan when delegated context is not ready', () => {
    const providerPath = join(__dirname, '../../lib/bootstrap/BootstrapProvider.tsx')
    const delegationPath = join(__dirname, '../../lib/bootstrap/BootstrapProviderDelegation.ts')
    const providerSource = readFileSync(providerPath, 'utf8')
    const delegationSource = readFileSync(delegationPath, 'utf8')
    expect(providerSource).toMatch(/Delegated client context not ready — deferring Titan bootstrap/)
    expect(providerSource).toMatch(/resolveDelegatedBootstrapReadiness\(activeContext\)/)
    expect(delegationSource).toMatch(/needsDelegatedContext[\s\S]*useClientContext\.getState\(\)/)
  })

  it('bootstrap session sync gap-fill uses hydrateSessionAndComplete not bare hydrateSession', () => {
    const hookPath = join(__dirname, '../../hooks/useBootstrapSync.ts')
    const hookSource = readFileSync(hookPath, 'utf8')
    expect(hookSource).toMatch(/syncBootstrapSession\(state\)/)

    const path = join(__dirname, '../../hooks/bootstrapSyncSession.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/sessionStore\.hydrateSessionAndComplete\(\{/)
    const gapFillBlock = source.slice(
      source.indexOf('Session already in store, checking for prefill updates'),
      source.indexOf("} else if (report.mode === 'new')")
    )
    expect(gapFillBlock).toMatch(/hydrateSessionAndComplete/)
    expect(gapFillBlock).not.toMatch(/sessionStore\.hydrateSession\(/)
  })

  it('SessionBootstrapService aborts Titan POST when delegated context is missing after wait', () => {
    const path = join(__dirname, '../../lib/bootstrap/SessionBootstrapService.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/Aborting Titan bootstrap — delegated context required/)
    expect(source).toMatch(/isDelegatedClientContextReadyForBootstrap/)
    expect(source).toMatch(/Aborting Titan bootstrap — delegated context mismatch/)
  })

  it('clientContextGate waits when URL has clientId, clientToken, or Mercury accountant existing report', () => {
    const gatePath = join(__dirname, '../../lib/auth/clientContextGate.ts')
    const gateSource = readFileSync(gatePath, 'utf8')
    expect(gateSource).toMatch(/urlRequiresDelegatedClientContext/)

    const persistPath = join(__dirname, '../../lib/auth/persistedClientContext.ts')
    const persistSource = readFileSync(persistPath, 'utf8')
    expect(persistSource).toMatch(/params\.get\('clientToken'\)/)
    expect(persistSource).toMatch(/params\.get\('clientId'\)/)
    expect(persistSource).toMatch(/isMercuryAdvisorModeParam/)
    expect(persistSource).toMatch(/looksLikeExistingReportId/)
  })

  it('useBootstrapSync dedupes across hook instances (ValuationReport + ManualValuationWorkspace)', () => {
    const syncPath = join(__dirname, '../../hooks/useBootstrapSync.ts')
    const source = readFileSync(syncPath, 'utf8')
    expect(source).toMatch(/globalBootstrapSyncScheduledKey/)
    expect(source).toMatch(/globalBootstrapSyncSignature/)

    const workspacePath = join(
      __dirname,
      '../../features/manual/components/ManualValuationWorkspace.tsx'
    )
    const workspaceSource = readFileSync(workspacePath, 'utf8')
    expect(workspaceSource).not.toMatch(/useBootstrapSync\(/)
  })

  it('useValuationSessionLoader defers loadSession until bootstrap sync writes session', () => {
    const path = join(__dirname, '../useValuationSessionLoader.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/Session load DEFERRED: waiting for bootstrap→store sync/)
    expect(source).toMatch(/bootstrapHasExistingSession/)
  })

  it('BootstrapProvider defers valuationPackage hydration synchronously in a microtask', () => {
    const providerPath = join(__dirname, '../../lib/bootstrap/BootstrapProvider.tsx')
    const providerSource = readFileSync(providerPath, 'utf8')
    const runBootstrapBlock = providerSource.slice(
      providerSource.indexOf('const runBootstrap = useCallback'),
      providerSource.indexOf('const forceRefreshBootstrap = useCallback')
    )
    expect(runBootstrapBlock).toMatch(/applyBootstrapPackageHydration\(result\)/)
    expect(runBootstrapBlock).not.toMatch(/queueMicrotask[\s\S]*await import/)

    const hydrationPath = join(__dirname, '../../lib/bootstrap/packageHydration.ts')
    const hydrationSource = readFileSync(hydrationPath, 'utf8')
    expect(hydrationSource).toMatch(/export function applyBootstrapPackageHydration/)
    expect(hydrationSource).toMatch(/SessionRestorationService\.hydrateFromPackage/)
    expect(hydrationSource).not.toMatch(/await import/)
  })

  it('useBootstrapSync owns setEngine after Titan bootstrap (not synchronous in BootstrapProvider)', () => {
    const providerPath = join(__dirname, '../../lib/bootstrap/BootstrapProvider.tsx')
    const providerSource = readFileSync(providerPath, 'utf8')
    const runBootstrapBlock = providerSource.slice(
      providerSource.indexOf('const runBootstrap = useCallback'),
      providerSource.indexOf('const forceRefreshBootstrap = useCallback')
    )
    expect(runBootstrapBlock).not.toMatch(
      /useSessionStore\.getState\(\)\.setEngine\(result\.identity\)/
    )

    const syncPath = join(__dirname, '../../hooks/useBootstrapSync.ts')
    const syncSource = readFileSync(syncPath, 'utf8')
    expect(syncSource).toMatch(/function syncEngine\(/)
    expect(syncSource).toMatch(/syncEngine\(state\)/)
  })

  it('useBootstrapPrefill defers existing-report prefill to useBootstrapSync', () => {
    const path = join(__dirname, '../../hooks/useBootstrapPrefill.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/useBootstrapSync owns existing-report bootstrap data/)
    expect(source).toMatch(
      /bootstrap\.report\.mode === 'existing' && bootstrap\.report\.hasExistingData/
    )
  })

  it('useValuationSessionLoader exits idle when package hydration marked restored', () => {
    const path = join(__dirname, '../useValuationSessionLoader.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(
      /isRestored\(reportId\)[\s\S]*status !== 'loaded'[\s\S]*completeInitialization/
    )
  })

  it('initializeAuth rejects delegated context when report restore fails on Mercury accountant URL', () => {
    const path = join(__dirname, '../../lib/auth/initializeAuth.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/mercuryDelegatedExisting/)
    expect(source).toMatch(/rejectClientContext/)
  })

  it('initializeAuth fetches client context on clientId without requiring mode=accountant in URL', () => {
    const path = join(__dirname, '../../lib/auth/initializeAuth.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/clientIdParam && isAccountantTierRole\(user\.role\)/)
    expect(source).not.toMatch(/mode === MERCURY_ADVISOR_URL_MODE &&\s*\n\s*clientIdParam/)
  })

  it('initializeAuth rejects invalid clientToken without resolving the context gate', () => {
    const path = join(__dirname, '../../lib/auth/initializeAuth.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/Invalid client token format/)
    expect(source).toMatch(/rejectClientContext/)
    expect(source).not.toMatch(/Invalid client token format[\s\S]{0,200}resolveClientContext\(\)/)
  })

  it('initializeAuth clears stale persisted context when URL clientId mismatches', () => {
    const path = join(__dirname, '../../lib/auth/initializeAuth.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/isPersistedContextStaleForUrl/)
    expect(source).toMatch(/clearDelegatedClientContext/)
  })

  it('initializeAuth restores report context even when stale isActingAsClient is set', () => {
    const path = join(__dirname, '../../lib/auth/initializeAuth.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/shouldRestoreFromReport/)
    expect(source).toMatch(/alreadyMatchesReport/)
    expect(source).toMatch(/Clearing stale client context before report restore/)
  })

  it('clientContext store discards stale relationshipId on persist rehydrate', () => {
    const path = join(__dirname, '../../stores/clientContext.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/onRehydrateStorage/)
    expect(source).toMatch(/discardStalePersistedClientContextOnRehydrate/)
    expect(source).toMatch(/isPersistedContextStaleForUrl/)
  })

  it('SessionBootstrapService skips cache when delegated gate is unresolved', () => {
    const servicePath = join(__dirname, '../../lib/bootstrap/SessionBootstrapService.ts')
    const readinessGatePath = join(__dirname, '../../lib/bootstrap/BootstrapReadinessGate.ts')
    const serviceSource = readFileSync(servicePath, 'utf8')
    const readinessGateSource = readFileSync(readinessGatePath, 'utf8')
    expect(serviceSource).toMatch(/isDelegatedBootstrapCacheAllowed/)
    expect(serviceSource).toMatch(/inflight && \(await isDelegatedBootstrapCacheAllowed/)
    expect(readinessGateSource).toMatch(/isDelegatedClientContextReadyForBootstrap/)
    expect(readinessGateSource).toMatch(/shouldWaitForMercuryClientContextBeforeBootstrap/)
  })

  it('BootstrapProvider runBootstrap uses URL-matched delegated context gate', () => {
    const path = join(__dirname, '../../lib/bootstrap/BootstrapProviderDelegation.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/isDelegatedClientContextReadyForBootstrap/)
    expect(source).toMatch(/contextGateResolved/)
    expect(source).not.toMatch(
      /!ctx\.isActingAsClient \|\| !ctx\.accountant \|\| !ctx\.relationshipId/
    )
  })

  it('clientContextGate syncs contextGateResolved into the client context store', () => {
    const path = join(__dirname, '../../lib/auth/clientContextGate.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/contextGateResolved/)
    expect(source).toMatch(/syncContextGateResolvedToStore/)
    expect(source).toMatch(/resetDelegatedClientContextGate/)
  })

  it('getContextHeaders blocks until contextGateResolved on delegated URLs', () => {
    const path = join(__dirname, '../../stores/clientContext.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/urlRequiresDelegatedClientContext/)
    expect(source).toMatch(/contextGateResolved/)
    expect(source).toMatch(/clearDelegatedClientContext/)
    expect(source).not.toMatch(/get\(\)\.clearClientContext\(\)\s*\n\s*return \{\} as Record/)
  })

  it('clientContext validateContext uses full delegated teardown', () => {
    const path = join(__dirname, '../../stores/clientContext.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/validateContext:[\s\S]*clearDelegatedClientContext/)
  })

  it('AuthGate waits for contextGateResolved on clientToken handoffs', () => {
    const path = join(__dirname, '../AuthGate.tsx')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/contextGateResolved/)
    expect(source).not.toMatch(
      /needsClientContext \|\| \(s\.isActingAsClient && !!s\.accountant && !!s\.relationshipId\)/
    )
  })

  it('PDF BFF routes and usePdfGeneration forward delegated client context', () => {
    const pdfRoute = readFileSync(
      join(__dirname, '../../../app/api/valuations/[id]/pdf/route.ts'),
      'utf8'
    )
    const pdfGen = readFileSync(join(__dirname, '../../hooks/usePdfGeneration.ts'), 'utf8')
    expect(pdfRoute).toMatch(/getTitanClientContextHeaders/)
    expect(pdfGen).toMatch(/getContextHeaders/)
    expect(pdfGen).toMatch(/pdfFetchHeaders/)
  })

  it('HttpClient waits for delegated client context before attaching headers', () => {
    const path = join(__dirname, '../../services/api/HttpClient.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/waitForClientContext/)
    expect(source).toMatch(/getContextHeaders/)
  })

  it('clearDelegatedClientContext resets gate and refresh dedupe state', () => {
    const path = join(__dirname, '../../lib/auth/persistedClientContext.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/resetDelegatedClientContextGate/)
    expect(source).toMatch(/resetDelegatedClientContextRefreshState/)
  })

  it('waitForClientContext requires store contextGateResolved on delegated URLs', () => {
    const path = join(__dirname, '../../lib/auth/clientContextGate.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/isDelegatedGateSatisfied/)
    expect(source).toMatch(/contextGateResolved/)
  })

  it('BootstrapProvider refreshes delegated context on in-session handoff changes', () => {
    const providerPath = join(__dirname, '../../lib/bootstrap/BootstrapProvider.tsx')
    const delegationPath = join(__dirname, '../../lib/bootstrap/BootstrapProviderDelegation.ts')
    const providerSource = readFileSync(providerPath, 'utf8')
    const delegationSource = readFileSync(delegationPath, 'utf8')
    expect(providerSource).toMatch(/useBootstrapDelegationReadiness\(\{/)
    expect(delegationSource).toMatch(/refreshDelegatedClientContextIfNeeded/)
    expect(delegationSource).toMatch(/bootstrapService\.clearCache\(\)/)
    expect(delegationSource).toMatch(/resolveDelegatedBootstrapReadiness/)
    expect(delegationSource).toMatch(/delegationCacheKey/)
  })

  it('preview incident: bootstrap wait and delegated handoff agree', () => {
    const ctx = {
      sourceApp: 'mercury' as const,
      reportId: PREVIEW_REPORT_ID,
      clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
      mercuryPersonaMode: 'accountant',
    }
    expect(shouldWaitForMercuryClientContextBeforeBootstrap(ctx)).toBe(true)
    expect(
      isDelegatedMercuryAccountantHandoff(
        buildMercuryDelegatedHandoffSignalsFromBootstrapContext(ctx)
      )
    ).toBe(true)
  })

  it('bootstrap wait aligns with bootstrap context (preview incident)', () => {
    expect(
      shouldWaitForMercuryClientContextBeforeBootstrap({
        sourceApp: 'mercury',
        reportId: PREVIEW_REPORT_ID,
        clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
        mercuryPersonaMode: 'accountant',
      })
    ).toBe(true)
    expect(
      isDelegatedMercuryAccountantHandoff(
        buildMercuryDelegatedHandoffSignalsFromBootstrapContext({
          sourceApp: 'mercury',
          reportId: PREVIEW_REPORT_ID,
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          mercuryPersonaMode: 'accountant',
        })
      )
    ).toBe(true)
  })

  it('buildAdvisorClientValuationUrl always sets clientId, mode=accountant, and source=mercury', () => {
    const path = join(
      __dirname,
      mercuryRootFromVenusTests,
      'shared/utils/advisor-client-valuation-url.ts'
    )
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/query\.set\(\s*['"]clientId['"]/)
    expect(source).toMatch(/query\.set\(\s*['"]mode['"]\s*,\s*['"]accountant['"]\s*\)/)
    expect(source).toMatch(/query\.set\(\s*['"]source['"]\s*,\s*['"]mercury['"]\s*\)/)
  })

  it('VenusEmbeddedModal propagates clientId and mode for accountant iframe opens', () => {
    const path = join(
      __dirname,
      mercuryRootFromVenusTests,
      'shared/components/modals/VenusEmbeddedModal.tsx'
    )
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/mode === 'accountant' && clientId/)
    expect(source).toMatch(/url\.searchParams\.set\(\s*['"]clientId['"]/)
  })

  it('CalculatorRedirectClient propagates clientId when opening an existing report', () => {
    const path = join(
      __dirname,
      mercuryRootFromVenusTests,
      'app/[locale]/(fullscreen)/calculator/CalculatorRedirectClient.tsx'
    )
    const source = readFileSync(path, 'utf8')

    expect(source).toMatch(/if \(reportId\)/)
    expect(source).toMatch(/url\.searchParams\.set\(\s*['"]clientId['"]\s*,\s*clientId\s*\)/)
    expect(source).toMatch(/url\.searchParams\.set\(\s*['"]source['"]\s*,\s*['"]mercury['"]\s*\)/)
  })

  /** preview.valuation handoff (2026-05-28): report d3f4e162 + client f93ff269 */
  const PREVIEW_D3F4_REPORT_ID = 'd3f4e162-ecb2-4112-8be8-ba426e0d92fd'
  const PREVIEW_F93FF_CLIENT_ID = 'f93ff269-0e86-4053-9c64-717e85194401'

  it('preview.valuation host incident: delegated handoff for d3f4e162 / f93ff269', () => {
    const ctx = {
      sourceApp: 'mercury' as const,
      reportId: PREVIEW_D3F4_REPORT_ID,
      clientId: PREVIEW_F93FF_CLIENT_ID,
      mercuryPersonaMode: 'accountant',
    }
    expect(shouldWaitForMercuryClientContextBeforeBootstrap(ctx)).toBe(true)
    expect(
      isDelegatedMercuryAccountantHandoff(
        buildMercuryDelegatedHandoffSignalsFromBootstrapContext(ctx)
      )
    ).toBe(true)
  })

  it('SessionBootstrapService sends partial delegated headers (accountant + relationship)', () => {
    const policyPath = join(__dirname, '../../lib/bootstrap/TitanBootstrapRequestPolicy.ts')
    const servicePath = join(__dirname, '../../lib/bootstrap/SessionBootstrapService.ts')
    const policySource = readFileSync(policyPath, 'utf8')
    const serviceSource = readFileSync(servicePath, 'utf8')
    expect(policySource).toMatch(/partialDelegated/)
    expect(policySource).toMatch(/hasFullDelegatedHeaderSet \|\| partialDelegated/)
    expect(serviceSource).toMatch(/partialDelegated: titanRequest\.partialDelegated/)
    expect(serviceSource).not.toMatch(
      /Partial client context in store - skipping delegated headers for bootstrap/
    )
  })

  it('SessionBootstrapService does not retry Venus BFF 504', () => {
    const path = join(__dirname, '../../lib/bootstrap/SessionBootstrapService.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/504 from Venus BFF|503\/504/)
    expect(source).toMatch(/response\.status !== 503/)
    expect(source).toMatch(/response\.status !== 504/)
    expect(source).not.toMatch(/response\.status === 504\) && attempt/)
  })

  it('useValuationSessionLoader clears session store before bootstrap retry', () => {
    const path = join(__dirname, '../useValuationSessionLoader.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/bootstrapError && refreshBootstrap/)
    expect(source).toMatch(
      /bootstrapError && refreshBootstrap[\s\S]*useSessionStore\.setState\([\s\S]*status: 'idle'[\s\S]*errorMessage: null[\s\S]*await refreshBootstrap/
    )
    expect(source).toMatch(
      /} else {[\s\S]*useSessionStore\.setState\([\s\S]*status: 'idle'[\s\S]*loadSession\(reportId/
    )
  })

  it('useValuationSessionLoader skips loadSession when bootstrap failed', () => {
    const path = join(__dirname, '../useValuationSessionLoader.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/Session load SKIPPED: bootstrap failed/)
    expect(source).toMatch(/bootstrap\?\.bootstrapError/)
    expect(source).toMatch(/status === 'idle' \|\| status === 'loading' \|\| isInitializing/)
  })

  it('Venus bootstrap BFF timeout allows slow staging Titan bootstrap', () => {
    const routePath = join(__dirname, '../../../app/api/bootstrap/route.ts')
    const routeSource = readFileSync(routePath, 'utf8')
    expect(routeSource).toMatch(/bootstrapProxyTimeouts/)
    expect(routeSource).toMatch(/bootstrapTitanCallTimeoutMs/)

    const constantsPath = join(__dirname, '../../lib/bootstrap/bootstrapProxyTimeouts.ts')
    const constantsSource = readFileSync(constantsPath, 'utf8')
    expect(constantsSource).toMatch(/VENUS_BOOTSTRAP_BFF_TIMEOUT_MS = 28_000/)
  })

  it('SessionBootstrapService surfaces actionable message on BFF timeout', () => {
    const path = join(__dirname, '../../lib/bootstrap/SessionBootstrapService.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(
      /response\.status === 504 \|\| response\.status === 408 \|\| response\.status === 503/
    )
    expect(source).toMatch(/BOOTSTRAP_TIMEOUT_USER_MESSAGE/)
    expect(source).toMatch(/AbortError[\s\S]*BOOTSTRAP_TIMEOUT_USER_MESSAGE/)
    expect(source).toMatch(/Invalid response from bootstrap service/)
  })

  it('useSessionStore blocks loadSession without engine', () => {
    const path = join(__dirname, '../../store/useSessionStore.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/loadSession blocked — engine not initialized/)
  })

  it('useValuationSessionLoader session load timeout uses status and errorMessage', () => {
    const path = join(__dirname, '../useValuationSessionLoader.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/Session load timeout \(30 seconds\)/)
    expect(source).toMatch(/cancelActiveLoad\(reportId\)/)
    expect(source).toMatch(
      /Session load timeout[\s\S]*useSessionStore\.setState\([\s\S]*status: 'error'[\s\S]*errorMessage:/
    )
  })

  it('useValuationSessionLoader direct bootstrap restoration is cancellation-aware', () => {
    const path = join(__dirname, '../useValuationSessionLoader.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/restorationRunRef/)
    expect(source).toMatch(/shouldContinueRestore/)
    expect(source).toMatch(/SessionRestorationService\.restore\(reportId, session, \{/)
  })

  it('AdvisorAIDock delegates client detail resolution to a cache-first hook', () => {
    const dockPath = join(
      __dirname,
      mercuryRootFromVenusTests,
      'shared/components/ai-dock/AdvisorAIDock.tsx'
    )
    const hookPath = join(
      __dirname,
      mercuryRootFromVenusTests,
      'shared/components/ai-dock/useAdvisorDockResolvedClient.ts'
    )
    const dockSource = readFileSync(dockPath, 'utf8')
    const hookSource = readFileSync(hookPath, 'utf8')

    expect(dockSource).toMatch(/useAdvisorDockResolvedClient\(\{/)
    expect(hookSource).toMatch(/queryClient\.getQueryData/)
    expect(hookSource).toMatch(/accountantClientQueryKeys\.detail\(clientId\)/)
    expect(hookSource).toMatch(/queryFn:\s*\(\)\s*=>\s*fetchAccountantClientDetail\(clientId\)/)
    expect(hookSource).toMatch(/clientDetailRequestRef/)
  })

  it('BootstrapProvider force refresh shows loading immediately on retry', () => {
    const path = join(__dirname, '../../lib/bootstrap/BootstrapProvider.tsx')
    const source = readFileSync(path, 'utf8')
    const block = source.slice(
      source.indexOf('const forceRefreshBootstrap = useCallback'),
      source.indexOf('// Auth-readiness subscription.')
    )
    expect(block).toMatch(/setBootstrapError\(null\)/)
    expect(block).toMatch(/setIsBootstrapping\(true\)/)
    expect(block).toMatch(/resetBootstrapSyncGateForRetry\(\)/)
  })

  it('useBootstrapSync re-runs setEngine when global gate matches but engine is missing', () => {
    const path = join(__dirname, '../../hooks/useBootstrapSync.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/engineReady/)
    expect(source).toMatch(/useSessionStore\.getState\(\)\.engine/)
    expect(source).toMatch(/resetBootstrapSyncGateForRetry/)
    expect(source).toMatch(/bootstrap\.bootstrapError[\s\S]*resetBootstrapSyncGateForRetry/)
  })

  it('bootstrap route has integration tests for timeout and partial headers', () => {
    const path = join(__dirname, '../../../app/api/bootstrap/route.test.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/returns 504 when Titan bootstrap times out/)
    expect(source).toMatch(/forwards partial delegated headers/)
    expect(source).toMatch(/refreshes token and retries bootstrap/)
    expect(source).toMatch(/not JSON/)
  })

  it('SessionAPI does not retry 503/504 session PATCH failures', () => {
    const path = join(__dirname, '../../services/api/session/SessionAPI.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/503\/504 indicate upstream pool pressure/)
    expect(source).toMatch(/status === 503 \|\| status === 504/)
    expect(source).toMatch(/recordSessionPoolPressureFromHttpError/)
    expect(source).toMatch(/awaitSessionPoolPressureGate/)
  })

  it('AuthenticatedSessionEngine does not retry 503/504 autosave failures', () => {
    const enginePath = join(
      __dirname,
      '../../services/session/engines/AuthenticatedSessionEngine.ts'
    )
    const errorPolicyPath = join(
      __dirname,
      '../../services/session/engines/AuthenticatedSessionSaveErrorPolicy.ts'
    )
    const engineSource = readFileSync(enginePath, 'utf8')
    const errorPolicySource = readFileSync(errorPolicyPath, 'utf8')
    expect(errorPolicySource).toMatch(/Pool-pressure \/ BFF timeout/)
    expect(errorPolicySource).toMatch(/status === 503 \|\| status === 504/)
    expect(engineSource).toMatch(/awaitSessionPoolPressureGate/)
    expect(engineSource).toMatch(/recordSessionPoolPressureFromHttpError/)
    expect(engineSource).toMatch(/isRetryableSessionSaveError/)
  })

  it('HttpClient does not retry 503/504 by default', () => {
    const path = join(__dirname, '../../services/api/HttpClient.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/status === 503 \|\| status === 504/)
    expect(source).toMatch(/never retry/)
  })

  it('useTokenRefresh does not retry auth refresh on upstream pool pressure', () => {
    const path = join(__dirname, '../../hooks/useTokenRefresh.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/isUpstreamPoolPressureHttpStatus/)
    expect(source).toMatch(/Token refresh skipped during upstream pool pressure/)
  })

  it('normalization and tax stores route session persist through engine queue', () => {
    const normalizationPath = join(__dirname, '../../store/useNormalizationStore.ts')
    const taxPath = join(__dirname, '../../store/useTaxLatencyStore.ts')
    const normalizationSource = readFileSync(normalizationPath, 'utf8')
    const taxSource = readFileSync(taxPath, 'utf8')
    expect(normalizationSource).toMatch(/updateSessionData\(\{ _normalizations: items \}\)/)
    expect(normalizationSource).toMatch(/saveSession\('autosave'\)/)
    expect(normalizationSource).not.toMatch(/sessionService\.saveSession/)
    expect(taxSource).toMatch(/updateSessionData\(\{ _taxLatencies: items \}\)/)
    expect(taxSource).toMatch(/saveSession\('autosave'\)/)
    expect(taxSource).not.toMatch(/sessionService\.saveSession/)
  })
})
