import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { type ImportQualityPerYear, useImportQualityStore } from '../../store/useImportQualityStore'
import {
  recoverPendingNormalizations,
  useNormalizationStore,
} from '../../store/useNormalizationStore'
import { recoverPendingTaxLatencies, useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import {
  buildNormalizationItemsFromImportedLedgerAnalysis,
  buildReportedEbitdaByYearFromFormRecords,
  type ImportedLedgerAnalysisLike,
  normalizeImportedLedgerReviewStatuses,
} from '../../utils/importedLedgerNormalization'
import {
  buildTaxLatencyCandidatesFromImportedLedgerAnalysis,
  type ImportedLedgerTaxLatencyAnalysisLike,
} from '../../utils/importedLedgerTaxLatencies'
import { generalLogger } from '../../utils/logger'
import {
  canonicalTaxLatenciesToStoreItems,
  TaxLatencyBoundaryError,
} from '../../utils/taxLatencyWire'
import {
  asImportedLedgerAnalysis,
  asImportQuality,
  asNormalizationItems,
  asRecord,
  type UnknownRecord,
} from './SessionRestorationCoercion'

type AuxiliaryArtifactSource = 'restore' | 'package'

export interface SessionAuxiliaryArtifactHydrationOptions {
  reportId: string
  formData: UnknownRecord | null | undefined
  source: AuxiliaryArtifactSource
  loadNormalizationsFromTitan?: boolean
  shouldContinue?: (phase: string) => boolean
}

export interface SessionAuxiliaryArtifactHydrationResult {
  restoredEbitdaNormalizations: boolean
  stopped: boolean
}

function shouldContinue(options: SessionAuxiliaryArtifactHydrationOptions, phase: string): boolean {
  return options.shouldContinue?.(phase) !== false
}

function getBusinessContext(formData: UnknownRecord): UnknownRecord | null {
  return asRecord(formData.business_context ?? formData.businessContext)
}

function getImportedLedgerAnalysis(formData: UnknownRecord) {
  const businessContext = getBusinessContext(formData)
  return asImportedLedgerAnalysis(
    businessContext?._imported_ledger_analysis ?? formData._imported_ledger_analysis
  )
}

function buildReportedEbitdaByYear(
  formData: UnknownRecord,
  fallbackYear?: number
): Record<number, number> {
  const currentYearData = asRecord(formData.current_year_data ?? formData.currentYearData) as {
    year?: number
    ebitda?: number
  } | null
  const historicalYearsData = formData.historical_years_data ?? formData.historicalYearsData
  const yearlyFinancials = formData.yearlyFinancials ?? formData.yearly_financials
  const yearData = asRecord(formData.year_data ?? formData.yearData) as Record<
    string | number,
    { ebitda?: number }
  > | null

  return buildReportedEbitdaByYearFromFormRecords({
    currentYearData: currentYearData ?? undefined,
    historicalYearsData: Array.isArray(historicalYearsData)
      ? (historicalYearsData as Array<{ year?: number; ebitda?: number }>)
      : undefined,
    yearlyFinancials: Array.isArray(yearlyFinancials)
      ? (yearlyFinancials as Array<{
          year?: number | string
          ebitda?: number
          isForecast?: boolean
        }>)
      : undefined,
    yearData: yearData ?? undefined,
    fallbackYear,
    fallbackEbitda: Number(formData.ebitda),
  })
}

function hydrateNormalizationsFromRecoveryOrMetadata(
  options: SessionAuxiliaryArtifactHydrationOptions,
  formData: UnknownRecord,
  reportedEbitdaByYear: Record<number, number>
): SessionAuxiliaryArtifactHydrationResult {
  let restoredEbitdaNormalizations = false

  try {
    if (!shouldContinue(options, 'normalizations')) {
      return { restoredEbitdaNormalizations, stopped: true }
    }

    const normStore = useNormalizationStore.getState()
    const recovered = recoverPendingNormalizations(options.reportId)
    if (recovered && recovered.length > 0) {
      normStore.setItems(normalizeImportedLedgerReviewStatuses(recovered, reportedEbitdaByYear))
      generalLogger.info('[SessionRestoration] Normalizations recovered from localStorage', {
        count: recovered.length,
      })
      return { restoredEbitdaNormalizations: true, stopped: false }
    }

    const rawMeta = asNormalizationItems(formData._normalizations ?? formData.normalizations)
    if (rawMeta.length > 0) {
      normStore.setItems(normalizeImportedLedgerReviewStatuses(rawMeta, reportedEbitdaByYear))
      generalLogger.info('[SessionRestoration] Normalizations hydrated from session metadata', {
        count: rawMeta.length,
      })
      return { restoredEbitdaNormalizations: true, stopped: false }
    }
  } catch (error) {
    generalLogger.warn('[SessionRestoration] Normalization hydration failed (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
      source: options.source,
    })
  }

  return { restoredEbitdaNormalizations, stopped: false }
}

async function hydrateNormalizations(
  options: SessionAuxiliaryArtifactHydrationOptions,
  formData: UnknownRecord,
  reportedEbitdaByYear: Record<number, number>
): Promise<SessionAuxiliaryArtifactHydrationResult> {
  const localResult = hydrateNormalizationsFromRecoveryOrMetadata(
    options,
    formData,
    reportedEbitdaByYear
  )
  if (
    localResult.stopped ||
    localResult.restoredEbitdaNormalizations ||
    !options.loadNormalizationsFromTitan
  ) {
    return localResult
  }

  try {
    const normStore = useNormalizationStore.getState()
    await normStore.loadFromTitan(options.reportId)
    if (!shouldContinue(options, 'normalizations-loaded')) {
      return { restoredEbitdaNormalizations: false, stopped: true }
    }
    const titanItems = useNormalizationStore.getState().items
    normStore.setItems(normalizeImportedLedgerReviewStatuses(titanItems, reportedEbitdaByYear))
    const restoredEbitdaNormalizations = useNormalizationStore.getState().items.length > 0
    generalLogger.info('[SessionRestoration] Normalizations loaded from Titan API', {
      count: useNormalizationStore.getState().items.length,
    })
    return { restoredEbitdaNormalizations, stopped: false }
  } catch (error) {
    generalLogger.warn('[SessionRestoration] Normalization hydration failed (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
      source: options.source,
    })
    return { restoredEbitdaNormalizations: false, stopped: false }
  }
}

function hydrateTaxLatencies(
  options: SessionAuxiliaryArtifactHydrationOptions,
  formData: UnknownRecord
): SessionAuxiliaryArtifactHydrationResult {
  try {
    if (!shouldContinue(options, 'tax-latencies')) {
      return { restoredEbitdaNormalizations: false, stopped: true }
    }

    const taxLatStore = useTaxLatencyStore.getState()
    const recoveredTL = recoverPendingTaxLatencies(options.reportId)
    if (recoveredTL && recoveredTL.length > 0) {
      taxLatStore.setItems(recoveredTL, { source: 'system' })
      generalLogger.info('[SessionRestoration] Tax latencies recovered from localStorage', {
        count: recoveredTL.length,
      })
      return { restoredEbitdaNormalizations: false, stopped: false }
    }

    const rawTL = formData.tax_latencies ?? formData.taxLatencies ?? formData._taxLatencies
    const taxLatencies = canonicalTaxLatenciesToStoreItems(rawTL, formData._taxLatencies)
    if (taxLatencies.length > 0) {
      taxLatStore.setItems(taxLatencies, { source: 'system' })
      generalLogger.info('[SessionRestoration] Tax latencies hydrated from session metadata', {
        count: taxLatencies.length,
      })
    }
  } catch (error) {
    useTaxLatencyStore.getState().clear({ source: 'system' })
    const currentErrors = useManualFormStore.getState().validationErrors
    useManualFormStore.getState().setValidationErrors({
      ...currentErrors,
      tax_latencies:
        error instanceof TaxLatencyBoundaryError
          ? error.message
          : 'Stored tax-latency values must be reviewed.',
    })
    generalLogger.warn('[SessionRestoration] Tax latency hydration failed (non-blocking)', {
      error:
        error instanceof TaxLatencyBoundaryError
          ? error.boundaryCode
          : error instanceof Error
            ? error.message
            : String(error),
      issueCount: error instanceof TaxLatencyBoundaryError ? error.issues.length : undefined,
      source: options.source,
    })
  }

  return { restoredEbitdaNormalizations: false, stopped: false }
}

function hydrateImportQuality(
  options: SessionAuxiliaryArtifactHydrationOptions,
  formData: UnknownRecord
): SessionAuxiliaryArtifactHydrationResult {
  try {
    if (!shouldContinue(options, 'import-quality')) {
      return { restoredEbitdaNormalizations: false, stopped: true }
    }

    const rawIQ = formData._import_quality ?? formData.import_quality ?? formData.importQuality
    const importQuality = asImportQuality(rawIQ)
    if (importQuality) {
      const importedLedgerProvenance = asRecord(
        getBusinessContext(formData)?._imported_ledger_provenance
      )
      const provenanceProvider = importedLedgerProvenance?.provider
      useImportQualityStore.getState().setImportQuality(importQuality, {
        provider: typeof provenanceProvider === 'string' ? provenanceProvider : null,
      })
      generalLogger.info('[SessionRestoration] Import quality hydrated', {
        years: Object.keys(importQuality).length,
      })
    }
  } catch (error) {
    generalLogger.warn('[SessionRestoration] Import quality hydration failed (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
      source: options.source,
    })
  }

  return { restoredEbitdaNormalizations: false, stopped: false }
}

function seedImportedLedgerAnalysis(
  options: SessionAuxiliaryArtifactHydrationOptions,
  formData: UnknownRecord,
  analysis: (ImportedLedgerAnalysisLike & ImportedLedgerTaxLatencyAnalysisLike) | null,
  reportedEbitdaByYear: Record<number, number>
): SessionAuxiliaryArtifactHydrationResult {
  let restoredEbitdaNormalizations = false

  try {
    if (!shouldContinue(options, 'imported-ledger-analysis')) {
      return { restoredEbitdaNormalizations, stopped: true }
    }

    const normStore = useNormalizationStore.getState()
    useTaxLatencyStore.getState().setCandidates([], { source: 'system' })

    if (analysis) {
      if (normStore.items.length === 0) {
        const items = buildNormalizationItemsFromImportedLedgerAnalysis({
          ...analysis,
          reported_ebitda_by_year: reportedEbitdaByYear,
        })
        if (items.length > 0) {
          normStore.addItems(items)
          restoredEbitdaNormalizations = true
          generalLogger.info(
            '[SessionRestoration] SDE drafts seeded from persisted imported ledger analysis',
            { count: items.length }
          )
        }
      }

      const taxLatencyCandidates = buildTaxLatencyCandidatesFromImportedLedgerAnalysis(analysis)
      useTaxLatencyStore.getState().setCandidates(taxLatencyCandidates, { source: 'system' })
    }
  } catch (error) {
    generalLogger.warn(
      '[SessionRestoration] Imported ledger normalization seed failed (non-blocking)',
      {
        error: error instanceof Error ? error.message : String(error),
        source: options.source,
        formKeys: Object.keys(formData),
      }
    )
  }

  return { restoredEbitdaNormalizations, stopped: false }
}

export async function hydrateSessionAuxiliaryArtifacts(
  options: SessionAuxiliaryArtifactHydrationOptions
): Promise<SessionAuxiliaryArtifactHydrationResult> {
  let restoredEbitdaNormalizations = false
  const formData = asRecord(options.formData) ?? {}
  const analysis = getImportedLedgerAnalysis(formData)
  const reportedEbitdaByYear = buildReportedEbitdaByYear(formData, analysis?.latest_fiscal_year)

  const normalizations = await hydrateNormalizations(options, formData, reportedEbitdaByYear)
  restoredEbitdaNormalizations ||= normalizations.restoredEbitdaNormalizations
  if (normalizations.stopped) return { restoredEbitdaNormalizations, stopped: true }

  const taxLatencies = hydrateTaxLatencies(options, formData)
  if (taxLatencies.stopped) return { restoredEbitdaNormalizations, stopped: true }

  const importQuality = hydrateImportQuality(options, formData)
  if (importQuality.stopped) return { restoredEbitdaNormalizations, stopped: true }

  const importedLedger = seedImportedLedgerAnalysis(
    options,
    formData,
    analysis,
    reportedEbitdaByYear
  )
  restoredEbitdaNormalizations ||= importedLedger.restoredEbitdaNormalizations
  if (importedLedger.stopped) return { restoredEbitdaNormalizations, stopped: true }

  return { restoredEbitdaNormalizations, stopped: false }
}

export function hydrateSessionAuxiliaryArtifactsSync(
  options: Omit<SessionAuxiliaryArtifactHydrationOptions, 'loadNormalizationsFromTitan'>
): SessionAuxiliaryArtifactHydrationResult {
  let restoredEbitdaNormalizations = false
  const formData = asRecord(options.formData) ?? {}
  const analysis = getImportedLedgerAnalysis(formData)
  const reportedEbitdaByYear = buildReportedEbitdaByYear(formData, analysis?.latest_fiscal_year)

  const normalizations = hydrateNormalizationsFromRecoveryOrMetadata(
    options,
    formData,
    reportedEbitdaByYear
  )
  restoredEbitdaNormalizations ||= normalizations.restoredEbitdaNormalizations
  if (normalizations.stopped) return { restoredEbitdaNormalizations, stopped: true }

  const taxLatencies = hydrateTaxLatencies(options, formData)
  if (taxLatencies.stopped) return { restoredEbitdaNormalizations, stopped: true }

  const importQuality = hydrateImportQuality(options, formData)
  if (importQuality.stopped) return { restoredEbitdaNormalizations, stopped: true }

  const importedLedger = seedImportedLedgerAnalysis(
    options,
    formData,
    analysis,
    reportedEbitdaByYear
  )
  restoredEbitdaNormalizations ||= importedLedger.restoredEbitdaNormalizations
  if (importedLedger.stopped) return { restoredEbitdaNormalizations, stopped: true }

  return { restoredEbitdaNormalizations, stopped: false }
}
