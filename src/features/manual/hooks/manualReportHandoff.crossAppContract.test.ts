/**
 * Regression guards for Mercury → Venus existing-report handoff load path.
 * Source-level pins for the blur overlay / nav-spinner loop fixes (2026-05).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const manualHooksRoot = '.'
const manualComponentsRoot = '../components'
const venusAppRoot = join(__dirname, '../../../..')

function readVenusApp(pathFromApp: string): string {
  return readFileSync(join(venusAppRoot, pathFromApp), 'utf8')
}

describe('manual report handoff load contract', () => {
  it('useValuationPersistenceCoordinator stabilizes its public API with useMemo', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useValuationPersistenceCoordinator.ts'),
      'utf8'
    )
    expect(source).toMatch(
      /return useMemo\(\s*\(\) => \(\{ enqueueMethod, enqueuePreparer, setBaseline, isPersisting \}\)/
    )
    expect(source).toMatch(/intent\.signature === lastSignatureRef\.current/)
  })

  it('useManualMethodPersistenceController gates enqueue on restorationComplete and seeds baseline without mount persist', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useManualMethodPersistenceController.ts'),
      'utf8'
    )
    expect(source).toMatch(/if \(!persistedReportLookupId \|\| !restorationComplete\) return/)
    expect(source).toMatch(/lastEnqueuedSelectedMethodRef\.current === null/)
    expect(source).toMatch(/userInitiatedMethodChangeRef/)
    expect(source).toMatch(/userInitiatedAtEffectStart/)
    expect(source).toMatch(
      /serverMethod && selectedMethod !== serverMethod && !userInitiatedAtEffectStart/
    )
    expect(source).not.toMatch(/persistCoordinator/)
    expect(source).toMatch(/enqueueMethodRef/)
    expect(source).toMatch(/currentSignature === serverSignature/)
    expect(source).toMatch(/lastEnqueuedSelectedMethodRef\.current = intent\.previousMethod/)
    expect(source).toMatch(
      /togglePreSelectedMethodWithPlanGate = useCallback[\s\S]*methodActions\.togglePreSelectedMethodWithPlanGate\(methodKey\)/
    )
    expect(source).not.toMatch(
      /togglePreSelectedMethodWithPlanGate[\s\S]{0,200}markUserMethodChange\(\)/
    )
  })

  it('ManualLayoutNav forwards sign, approve, and preview affordances to CalculatorNav', () => {
    const source = readFileSync(
      join(__dirname, manualComponentsRoot, 'ManualLayoutNav.tsx'),
      'utf8'
    )
    expect(source).toMatch(/showSignAttest=\{showSignAttest\}/)
    expect(source).toMatch(/showApproveValuation=\{showApproveValuation\}/)
    expect(source).toMatch(/onPreview=\{handlePreview\}/)
  })

  it('ManualLayoutNav does not map method persist spinner onto overflow-menu isExporting', () => {
    const source = readFileSync(
      join(__dirname, manualComponentsRoot, 'ManualLayoutNav.tsx'),
      'utf8'
    )
    expect(source).toMatch(/isExporting=\{isExporting\}/)
    expect(source).not.toMatch(/isExporting=\{isExporting \|\| isMethodSwitchRendering\}/)
  })

  it('useResultToReportBridge skips background PDF when fresh and dedupes poll fingerprint churn', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useResultToReportBridge.ts'),
      'utf8'
    )
    expect(source).toMatch(/isPdfLikelyStaleVenus\(mappedReport\)/)
    expect(source).toMatch(/lastPdfTriggerFingerprintRef/)
    expect(source).toMatch(/resultPdfTriggerFingerprint/)
    expect(source).toMatch(/isPdfGeneratingRef/)
  })

  it('useManualReportApproval retries review load and approve through fetchBffJsonWithTransientRetry', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useManualReportApproval.ts'),
      'utf8'
    )
    expect(source).toMatch(/fetchBffJsonWithTransientRetry/)
    expect(source).toMatch(/REVIEW_STATE_BACKGROUND_RETRY_MS/)
    expect(source).toMatch(/REVIEW_STATE_PENDING_REPORT_RETRY_MS/)
    expect(source).toMatch(/isReviewPendingReportFailure/)
    expect(source).toMatch(/allowApproveWithoutReviewState/)
    expect(source).toMatch(/setAllowApproveWithoutReviewState\(true\)/)
    expect(source).toMatch(/isTransientUpstreamFailure/)
  })

  it('attestation BFF routes resolve Titan host from the incoming request', () => {
    expect(readVenusApp('app/api/attestations/readiness/route.ts')).toMatch(
      /getTitanApiUrl\(request\)/
    )
    expect(readVenusApp('app/api/attestations/route.ts')).toMatch(/getTitanApiUrl\(request\)/)
  })

  it('review BFF routes resolve Titan host from the incoming request', () => {
    expect(readVenusApp('app/api/valuations/[id]/review/route.ts')).toMatch(
      /getTitanApiUrl\(request\)/
    )
    expect(readVenusApp('app/api/valuations/[id]/review/approve/route.ts')).toMatch(
      /getTitanApiUrl\(request\)/
    )
  })

  it('useManualPdfExportController surfaces transient download degradation softly', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useManualPdfExportController.ts'),
      'utf8'
    )
    expect(source).toMatch(/transientDownloadHint/)
    expect(source).toMatch(/isPdfTransientUpstreamStatus/)
    expect(source).toMatch(/isPdfGenerating/)
  })

  it('useManualReportRefreshAfterEdit respects PDF staleness before regenerate', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useManualReportRefreshAfterEdit.ts'),
      'utf8'
    )
    expect(source).toMatch(/isPdfLikelyStaleVenus/)
    expect(source).toMatch(/forceRegenerate/)
    expect(source).toMatch(/isPdfGenerating/)
  })

  it('usePreSelectedMethodSessionSync skips autosave when session snapshot already matches store', () => {
    const source = readFileSync(
      join(__dirname, '../../../hooks/usePreSelectedMethodSessionSync.ts'),
      'utf8'
    )
    expect(source).toMatch(/methodFieldMatch && methodsMatch && weightsMatch && justificationMatch/)
    expect(source).toMatch(/manualMethodPrefs\.preSelectedMethods/)
  })

  it('useFormSessionSync defers Mercury delegated autosave during post-restoration settle window', () => {
    const source = readFileSync(join(__dirname, '../../../hooks/useFormSessionSync.ts'), 'utf8')
    expect(source).toMatch(/getSessionAutosaveDeferRemainingMs/)
    expect(source).toMatch(/observeMercuryDelegatedRestoration/)
    expect(source).toMatch(/deferRetryTimerRef/)
    expect(source).toMatch(/reportIdRef/)
    expect(source).toMatch(/formDataRef/)
    expect(source).toMatch(/clearTimeout\(deferRetryTimerRef\.current\)/)
  })

  it('usePreSelectedMethodSessionSync shares Mercury delegated autosave defer', () => {
    const source = readFileSync(
      join(__dirname, '../../../hooks/usePreSelectedMethodSessionSync.ts'),
      'utf8'
    )
    expect(source).toMatch(/getSessionAutosaveDeferRemainingMs/)
    expect(source).toMatch(/observeMercuryDelegatedRestoration/)
    expect(source).toMatch(/persistRetryTimerRef/)
    expect(source).toMatch(/reportKeyRef/)
    expect(source).toMatch(/session\.reportId !== activeReportKey/)
  })

  it('formSessionAutosaveDefer only applies to existing report ids', () => {
    const source = readFileSync(
      join(__dirname, '../../../hooks/formSessionAutosaveDefer.ts'),
      'utf8'
    )
    expect(source).toMatch(/looksLikeExistingReportId/)
  })

  it('useResultToReportBridge uses stable generatePdf ref', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useResultToReportBridge.ts'),
      'utf8'
    )
    expect(source).toMatch(/generatePdfRef/)
    expect(source).not.toMatch(/generatePdf,\n {4}isMobile/)
  })

  it('ManualLayout wires PDF staleness lifecycle with generation state', () => {
    const source = readFileSync(join(__dirname, manualComponentsRoot, 'ManualLayout.tsx'), 'utf8')
    expect(source).toMatch(/isPdfGenerating/)
    expect(source).toMatch(/usePdfStalenessLifecycle/)
    expect(source).toMatch(/isPdfReady/)
    expect(source).toMatch(/pdfStalePollLookupId/)
    expect(source).toMatch(/persistedReportLookupId: pdfStalePollLookupId/)
  })

  it('useManualReportIdentifiers exposes pdfStalePollLookupId fallback for val_* routes', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'useManualReportIdentifiers.ts'),
      'utf8'
    )
    expect(source).toMatch(/pdfStalePollLookupId/)
    expect(source).toMatch(/persistedReportLookupId \?\? reportHydrationLookupId/)
  })

  it('usePdfStalenessLifecycle recovers after generation and forwards poll freshness', () => {
    const source = readFileSync(
      join(__dirname, manualHooksRoot, 'usePdfStalenessLifecycle.ts'),
      'utf8'
    )
    expect(source).toMatch(/isPdfGenerating/)
    expect(source).toMatch(/runStalePollOnce/)
    expect(source).toMatch(/pdfIsFresh/)
    expect(source).toMatch(/wasPdfGeneratingRef/)
    expect(source).toMatch(/lastPolledPdfGeneratedAtMsRef/)
    expect(source).toMatch(/void runStalePollOnce\(persistedReportLookupId/)
    expect(source).toMatch(/pdfStillStaleAfterRetry/)
    expect(source).toMatch(/isTransientPollError\(err\)/)
  })

  it('integration test covers re-render storm with real persistence coordinator', () => {
    const source = readFileSync(
      join(__dirname, 'useManualMethodPersistenceController.integration.test.tsx'),
      'utf8'
    )
    expect(source).toMatch(/re-render storm on open/)
    expect(source).not.toMatch(/vi\.mock\('\.\/useValuationPersistenceCoordinator'/)
  })
})
