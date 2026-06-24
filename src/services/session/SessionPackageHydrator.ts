import {
  SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  sanitizePreSelectedValuationMethod,
  sessionHasStoredPreSelectedMethod,
} from '../../constants/sessionUiKeys'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import type { BuyerReadinessPackage } from '../../types/buyerReadiness'
import type { ValuationFormData, ValuationResponse, ValuationSession } from '../../types/valuation'
import {
  type FormSnapshotForRevenueNav,
  parseCurrentYearRevenueForMethodNav,
} from '../../utils/currentYearRevenueForMethodNav'
import { hydrateClientValuationResultsMap } from '../../utils/extractValuationResultsMap'
import { generalLogger } from '../../utils/logger'
import {
  buildOptionalSessionGapFillPatch,
  mergeSessionSurfaceForOptionalPrefill,
} from '../../utils/mergeOptionalSessionPrefillFields'
import { markMercurySessionPrefillSuppressed } from '../../utils/prefillRestorationGate'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { hydrateSessionAuxiliaryArtifactsSync } from './SessionAuxiliaryArtifactHydrator'
import { seedNbbPrefillFromFormData } from './SessionNbbPrefillHydrator'
import { mapPackageFormData } from './SessionPackageFormDataMapper'

export interface SessionHydrationPackage {
  htmlReport: string | null
  pricingRange: { min: number; mid: number; max: number; currency: string } | null
  versions: {
    current: number
    total: number
    history?: Array<{
      version: number
      createdAt: Date
      summary: string | null
      createdBy: string | null
    }>
  }
  pdf: { url: string | null; status: 'ready' | 'generating' | 'none' }
  formData?: Record<string, unknown>
  buyerReadiness?: BuyerReadinessPackage
}

interface VersionStub {
  id: string
  reportId: string
  versionNumber: number
  versionLabel: string
  createdAt: Date
  createdBy: string | null
  formData: Record<string, unknown>
  valuationResult: null
  htmlReport: null
  changesSummary: { totalChanges: number; sections: never[]; fields: never[] }
  isActive: boolean
  isPinned: boolean
  notes: string | null
}

interface PackageHydrationOptions {
  reportId: string
  pkg: SessionHydrationPackage
  flow?: 'manual' | 'conversational'
  onRestored: (reportId: string) => void
}

function hydrateFormStoresFromPackage(reportId: string, formData: Record<string, unknown>): void {
  const { updateFormData } = useManualFormStore.getState()
  const raw = mergeSessionSurfaceForOptionalPrefill(formData)
  const mapped = mapPackageFormData(raw)

  updateFormData(mapped as Partial<ValuationFormData>)
  const gapPatch = buildOptionalSessionGapFillPatch(
    formData,
    useManualFormStore.getState().formData
  )
  if (Object.keys(gapPatch).length > 0) {
    updateFormData(gapPatch as Partial<ValuationFormData>)
    generalLogger.debug('[SessionRestoration] Package envelope gap-fill after map', {
      reportId: reportId.substring(0, 30),
      keys: Object.keys(gapPatch),
    })
  }

  seedNbbPrefillFromFormData(
    useManualFormStore.getState().formData as unknown as Record<string, unknown>,
    reportId,
    'package'
  )
  markMercurySessionPrefillSuppressed(reportId)

  hydrateSessionAuxiliaryArtifactsSync({
    reportId,
    formData: raw,
    source: 'package',
  })

  generalLogger.info('[SessionRestoration] Form data hydrated from package', {
    reportId: reportId.substring(0, 30),
    fieldCount: Object.keys(mapped).length,
  })
}

function hydrateManualResultFromPackage(
  reportId: string,
  pkg: SessionHydrationPackage,
  pricingResult: Record<string, unknown>
): void {
  const manualStore = useManualResultsStore.getState()
  const existingResult = manualStore.result || {}
  const pkgRenderableHtml = getFirstRenderableReportHtml(pkg.htmlReport)
  const fullResult = {
    valuation_id: reportId,
    ...pricingResult,
    html_report: pkgRenderableHtml,
    valuation_results: hydrateClientValuationResultsMap(existingResult) ?? undefined,
  }
  manualStore.setResult({
    ...existingResult,
    ...fullResult,
  } as ValuationResponse)
  if (pkgRenderableHtml) manualStore.setHtmlReport(pkgRenderableHtml)

  const mergedAfterSet = useManualResultsStore.getState().result as Record<string, unknown> | null
  if (
    mergedAfterSet &&
    !(mergedAfterSet as { selected_valuation_method?: string }).selected_valuation_method &&
    pkg.formData &&
    typeof pkg.formData === 'object'
  ) {
    const rawPkg = pkg.formData as Record<string, unknown>
    if (sessionHasStoredPreSelectedMethod(rawPkg)) {
      const v =
        rawPkg[SESSION_PRE_SELECTED_VALUATION_METHOD_KEY] ??
        rawPkg[SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY]
      if (v === null) {
        useManualResultsStore.getState().setPreSelectedMethod(null)
      } else if (typeof v === 'string') {
        const revFromForm = parseCurrentYearRevenueForMethodNav(
          pkg.formData as FormSnapshotForRevenueNav
        )
        const parsed = sanitizePreSelectedValuationMethod(v, null, revFromForm)
        useManualResultsStore.getState().setPreSelectedMethod(parsed)
      }
    }
  }

  try {
    if (typeof window !== 'undefined') {
      const session = useSessionStore.getState().session
      if (session) {
        const sessionDataPatch = {
          ...(session.sessionData || {}),
          pdfUrl: pkg.pdf?.url || undefined,
          ...(pkg.buyerReadiness ? { _buyerReadiness: pkg.buyerReadiness } : {}),
        } as Partial<ValuationSession>['sessionData']

        useSessionStore.getState().hydrateSession({
          htmlReport: getFirstRenderableReportHtml(pkg.htmlReport) || undefined,
          valuationResult: { ...existingResult, ...fullResult } as ValuationResponse,
          ...(pkg.buyerReadiness ? { buyerReadiness: pkg.buyerReadiness } : {}),
          sessionData: sessionDataPatch,
        } satisfies Partial<ValuationSession>)
      }
    }
  } catch {
    // Non-critical: session may not be loaded yet
  }
}

function hydrateVersionHistoryFromPackage(reportId: string, pkg: SessionHydrationPackage): void {
  if (!pkg.versions.history || pkg.versions.history.length === 0) return

  const versionStore = useVersionHistoryStore.getState()
  const versions: VersionStub[] = pkg.versions.history.map((version) => ({
    id: `pkg-${reportId}-v${version.version}`,
    reportId,
    versionNumber: version.version,
    versionLabel: `Version ${version.version}`,
    createdAt: new Date(version.createdAt),
    createdBy: version.createdBy,
    formData: {},
    valuationResult: null,
    htmlReport: null,
    changesSummary: { totalChanges: 0, sections: [], fields: [] },
    isActive: version.version === pkg.versions.current,
    isPinned: false,
    notes: version.summary,
  }))

  const existingVersions = versionStore.versions[reportId] || []
  const mergedVersions: VersionStub[] = [...versions]

  existingVersions.forEach((version) => {
    if (
      !mergedVersions.find(
        (packageVersion) => packageVersion.versionNumber === version.versionNumber
      )
    ) {
      mergedVersions.push(version as unknown as VersionStub)
    }
  })

  mergedVersions.sort((a, b) => b.versionNumber - a.versionNumber)
  versionStore.versions[reportId] = mergedVersions as unknown as typeof existingVersions

  generalLogger.debug('[SessionRestoration] Hydrated version history from package', {
    reportId: reportId.substring(0, 30),
    versionCount: versions.length,
    total: pkg.versions.total,
  })
}

export function hydrateSessionFromPackage({
  reportId,
  pkg,
  flow = 'manual',
  onRestored,
}: PackageHydrationOptions): void {
  const startTime = performance.now()

  generalLogger.info('[SessionRestoration] WORLD-CLASS: Instant hydration from package', {
    reportId: reportId.substring(0, 30),
    hasHtmlReport: !!pkg.htmlReport,
    hasPricing: !!pkg.pricingRange,
    formFieldCount: pkg.formData ? Object.keys(pkg.formData).length : 0,
    versionCount: pkg.versions.total,
    pdfStatus: pkg.pdf.status,
    hasBuyerReadiness: !!pkg.buyerReadiness,
  })

  try {
    if (flow === 'manual' && pkg.formData && Object.keys(pkg.formData).length > 0) {
      try {
        hydrateFormStoresFromPackage(reportId, pkg.formData)
      } catch (formError) {
        generalLogger.warn(
          '[SessionRestoration] Form hydration from package failed (non-critical)',
          {
            error: formError instanceof Error ? formError.message : String(formError),
          }
        )
      }
    }

    const pricingResult = pkg.pricingRange
      ? {
          equity_value_low: pkg.pricingRange.min,
          equity_value_mid: pkg.pricingRange.mid,
          equity_value_high: pkg.pricingRange.max,
          currency: pkg.pricingRange.currency,
        }
      : {}

    if (flow === 'manual') {
      hydrateManualResultFromPackage(reportId, pkg, pricingResult)
    } else {
      generalLogger.debug(
        '[SessionRestoration] Skipping conversational hydration - stores removed',
        {
          reportId: reportId.substring(0, 30),
        }
      )
    }

    hydrateVersionHistoryFromPackage(reportId, pkg)

    onRestored(reportId)
    useSessionStore.getState().setRestorationComplete(true)

    const durationMs = performance.now() - startTime
    generalLogger.info('[SessionRestoration] WORLD-CLASS: Instant hydration complete', {
      reportId: reportId.substring(0, 30),
      durationMs: Math.round(durationMs),
    })
  } catch (error) {
    generalLogger.error('[SessionRestoration] Package hydration failed', {
      reportId: reportId.substring(0, 30),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
