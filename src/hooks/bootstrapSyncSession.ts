import type { SessionBootstrapState } from '../lib/bootstrap/types'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationFormData, ValuationSession } from '../types/valuation'
import {
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { createContextLogger } from '../utils/logger'
import {
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
} from '../utils/mergeOptionalSessionPrefillFields'
import {
  buildIdentityFingerprint,
  readNewValuationPrefill,
} from '../utils/newValuationPrefillStorage'
import {
  isTrustedFinancialDataSource,
  shouldBlockUntrustedFinancialPrefill,
  stripUntrustedOperatingFinancialPrefill,
} from '../utils/officialValuationInputPolicy'
import { extractRenderableHtmlFromSessionPayload } from '../utils/reportHtmlRecovery'
import { getFirstRenderableReportHtml } from '../utils/safetyNetReportHtml'
import {
  buildGapFillPatch,
  buildPrefillFormFields,
  buildPrefillSessionFields,
  CORE_PREFILL_GAP_KEYS,
  mergeBusinessContextGapFill,
  PREFILL_METADATA_GAP_KEYS,
  resolveCountryCode,
} from './bootstrapSyncPrefillMapping'

const logger = createContextLogger('BootstrapSync')

type PrefillDataParam = SessionBootstrapState['prefillData']
type BootstrapMinimalSession = Partial<ValuationSession> & { pdfUrl?: string }
type BootstrapSessionData = NonNullable<ValuationSession['sessionData']> & Record<string, unknown>
type BootstrapPricingRange = NonNullable<SessionBootstrapState['valuationPackage']>['pricingRange']

function asFormPatch(value: Record<string, unknown>): Partial<ValuationFormData> {
  return value as unknown as Partial<ValuationFormData>
}

function asSessionData(value: Record<string, unknown>): BootstrapSessionData {
  return value as unknown as BootstrapSessionData
}

function pricingRangeToValuationResult(
  pricingRange: BootstrapPricingRange
): ValuationSession['valuationResult'] {
  if (!pricingRange) return undefined

  return {
    equity_value_low: pricingRange.min,
    equity_value_mid: pricingRange.mid,
    equity_value_high: pricingRange.max,
    currency: pricingRange.currency,
  } as unknown as ValuationSession['valuationResult']
}

function financialSourceFromSurface(surface: Record<string, unknown>): unknown {
  return surface._financial_data_source ?? surface.financial_data_source ?? surface.dataSource
}

function stripBlockedFinancialSurface(
  surface: Record<string, unknown>,
  blockUntrustedFinancialPrefill: boolean
): Record<string, unknown> {
  if (!blockUntrustedFinancialPrefill) return surface
  return isTrustedFinancialDataSource(financialSourceFromSurface(surface))
    ? surface
    : stripUntrustedOperatingFinancialPrefill(surface)
}

/** Country-only prefill can score below 0.05 confidence; still hydrate form store for new reports. */
function applyCountryPrefillIfNewReport(
  report: SessionBootstrapState['report'],
  prefillData: PrefillDataParam
): void {
  if (report.mode !== 'new') return
  const cc = resolveCountryCode(prefillData.companyInfo?.countryCode)
  if (!cc) return
  const cur = useManualFormStore.getState().formData.country_code?.trim().toUpperCase()
  if (cur === cc) return
  useManualFormStore.getState().updateFormData({ country_code: cc })
  logger.info('Applied country from bootstrap (syncBootstrapSession, no confidence gate)', {
    reportId: report.reportId.substring(0, 30),
    country_code: cc,
  })
}

function hasMeaningfulPrefill(prefillData: PrefillDataParam): boolean {
  if (prefillData.companyGraphContext) return true
  if ((prefillData.fieldsPopulated?.length ?? 0) > 0) return true
  if (prefillData.confidence >= 0.05) return true
  if (prefillData.companyInfo?.companyName?.trim()) return true
  if (prefillData.kboData?.companyName?.trim()) return true
  if (prefillData.companyInfo?.canonicalNaceCode?.trim()) return true
  if (prefillData.companyInfo?.taxonomy?.trim()) return true
  if (prefillData.businessType?.id) return true
  if (prefillData.businessType?.category) return true
  if (
    prefillData.financials?.revenue != null &&
    Number.isFinite(Number(prefillData.financials.revenue))
  ) {
    return true
  }
  if (
    prefillData.financials?.ebitda != null &&
    Number.isFinite(Number(prefillData.financials.ebitda))
  ) {
    return true
  }
  if (prefillData.financials?.yearData && Object.keys(prefillData.financials.yearData).length > 0) {
    return true
  }
  if (
    Array.isArray(prefillData.officialFinancials?.historicalYears) &&
    prefillData.officialFinancials.historicalYears.length > 0
  ) {
    return true
  }
  return false
}

/**
 * Hydrate existing Venus stores from bootstrap session state.
 *
 * This function owns the session/form mutation policy. The hook that calls it
 * owns scheduling and dedupe; keeping those responsibilities separate makes the
 * React #185/race-condition hardening easier to audit.
 */
export function syncBootstrapSession(state: SessionBootstrapState): void {
  try {
    const { report, prefillData, identity } = state
    const sessionStore = useSessionStore.getState()
    const blockUntrustedFinancialPrefill = shouldBlockUntrustedFinancialPrefill(
      prefillData.officialFinancials,
      prefillData.financials?.dataSource
    )

    const storeHasSession = sessionStore.session?.reportId === report.reportId

    if (storeHasSession) {
      logger.debug('Session already in store, checking for prefill updates', {
        reportId: report.reportId.substring(0, 30),
      })
      const currentSession = sessionStore.session
      if (!currentSession) return
      const currentSessionData = currentSession.sessionData || {}
      const hasPrefill = hasMeaningfulPrefill(prefillData)
      const prefillSessionFields = hasPrefill ? buildPrefillSessionFields(prefillData) : {}
      const prefillFormFields = hasPrefill ? buildPrefillFormFields(prefillData) : {}
      const pkg = state.valuationPackage
      const packageRenderableHtml = getFirstRenderableReportHtml(pkg?.htmlReport)
      const packageSurfaceRaw =
        pkg?.formData && typeof pkg.formData === 'object'
          ? mergeSessionSurfaceForOptionalPrefill(pkg.formData)
          : {}
      const packageSurface = stripBlockedFinancialSurface(
        packageSurfaceRaw,
        blockUntrustedFinancialPrefill
      )
      const hasPackage = Boolean(
        pkg &&
          (packageRenderableHtml ||
            pkg.pricingRange ||
            (pkg.formData && Object.keys(pkg.formData).length > 0) ||
            pkg.pdf?.url ||
            pkg.buyerReadiness)
      )
      const incomingSession = {
        ...(hasPackage ? packageSurface : {}),
        ...(hasPrefill ? prefillSessionFields : {}),
      } as Record<string, unknown>
      if (hasPackage && pkg?.pricingRange) incomingSession._pricingRange = pkg.pricingRange
      if (hasPackage && packageRenderableHtml) incomingSession._htmlReport = packageRenderableHtml
      if (hasPackage && pkg?.pdf?.url) incomingSession.pdfUrl = pkg.pdf.url
      if (pkg?.buyerReadiness) incomingSession._buyerReadiness = pkg.buyerReadiness
      const incomingForm = {
        ...(hasPackage ? packageSurface : {}),
        ...(hasPrefill ? prefillFormFields : {}),
      } as Record<string, unknown>

      if (Object.keys(incomingSession).length > 0) {
        const formStore = useManualFormStore.getState()
        const sessionGapPatch = buildGapFillPatch(
          currentSessionData as Record<string, unknown>,
          incomingSession,
          [...CORE_PREFILL_GAP_KEYS, ...PREFILL_METADATA_GAP_KEYS] as string[]
        )
        Object.assign(
          sessionGapPatch,
          mergeOptionalSessionPrefillFields(
            incomingSession,
            currentSessionData as Record<string, unknown>
          )
        )
        const mergedSessionBc = mergeBusinessContextGapFill(
          (currentSessionData as Record<string, unknown>).business_context,
          incomingSession.business_context
        )
        if (mergedSessionBc) {
          sessionGapPatch.business_context = mergedSessionBc
        }

        const topLevelPatch: Partial<ValuationSession> = {}
        if (
          hasPackage &&
          packageRenderableHtml &&
          !extractRenderableHtmlFromSessionPayload(currentSession)
        ) {
          topLevelPatch.htmlReport = packageRenderableHtml
        }
        if (pkg?.buyerReadiness) {
          topLevelPatch.buyerReadiness = pkg.buyerReadiness
        }
        if (hasPackage && pkg?.pricingRange && !currentSession.valuationResult) {
          topLevelPatch.valuationResult = pricingRangeToValuationResult(pkg.pricingRange)
        }

        if (Object.keys(sessionGapPatch).length > 0 || Object.keys(topLevelPatch).length > 0) {
          const currentSessionDataRecord = currentSessionData as Record<string, unknown>
          sessionStore.hydrateSessionAndComplete({
            ...topLevelPatch,
            sessionData: {
              ...currentSessionData,
              ...sessionGapPatch,
              _bootstrapPrefill: hasPrefill || !!currentSessionDataRecord._bootstrapPrefill,
            } as BootstrapSessionData,
          })

          logger.info('Updated existing session with bootstrap/package gap-fill data', {
            reportId: report.reportId.substring(0, 30),
            fieldsAdded: Object.keys(sessionGapPatch).length,
            topLevelAdded: Object.keys(topLevelPatch).length,
            hasPrefill,
            hasPackage,
          })
        }

        const formDataUpdate = buildGapFillPatch(
          formStore.formData as unknown as Record<string, unknown>,
          incomingForm,
          [...CORE_PREFILL_GAP_KEYS, ...PREFILL_METADATA_GAP_KEYS] as string[]
        )
        Object.assign(
          formDataUpdate,
          mergeOptionalSessionPrefillFields(incomingSession, {
            ...formStore.formData,
            ...formDataUpdate,
          })
        )
        const mergedFormBc = mergeBusinessContextGapFill(
          (formStore.formData as unknown as Record<string, unknown>).business_context,
          incomingForm.business_context
        )
        if (mergedFormBc) {
          formDataUpdate.business_context = mergedFormBc
        }
        if (Object.keys(formDataUpdate).length > 0) {
          useManualFormStore.getState().updateFormData(asFormPatch(formDataUpdate))
          logger.info('Hydrated form store with bootstrap/package gap-fill', {
            reportId: report.reportId.substring(0, 30),
            formFieldsCount: Object.keys(formDataUpdate).length,
            hasPrefill,
            hasPackage,
          })
        }
      }
    } else if (report.mode === 'new') {
      if (!storeHasSession) {
        const now = new Date()
        const meaningfulPrefill = hasMeaningfulPrefill(prefillData)

        const sessionData: BootstrapSessionData = asSessionData({
          _bootstrapCreated: true,
          _bootstrapPrefill: meaningfulPrefill,
          ...buildPrefillSessionFields(prefillData),
        })

        const minimalSession: BootstrapMinimalSession = {
          reportId: report.reportId,
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: now,
          updatedAt: now,
          partialData: {},
          sessionData,
        }

        sessionStore.hydrateSessionAndComplete(minimalSession)

        if (meaningfulPrefill) {
          const formDataUpdate = buildPrefillFormFields(prefillData)
          Object.assign(
            formDataUpdate,
            mergeOptionalSessionPrefillFields(sessionData, {
              ...useManualFormStore.getState().formData,
              ...formDataUpdate,
            })
          )
          if (Object.keys(formDataUpdate).length > 0) {
            useManualFormStore.getState().updateFormData(asFormPatch(formDataUpdate))
            logger.info('Hydrated form store from bootstrap prefill (new report)', {
              reportId: report.reportId.substring(0, 30),
              formFieldsCount: Object.keys(formDataUpdate).length,
            })
          }
        }

        try {
          const targetIdentity = buildIdentityFingerprint(prefillData.companyInfo)
          const restored = readNewValuationPrefill(targetIdentity)
          if (restored) {
            const sanitized = blockUntrustedFinancialPrefill
              ? stripUntrustedOperatingFinancialPrefill(restored.data)
              : restored.data
            const filingYearConfirmed = isFilingYearConfirmedValue(
              sanitized.filing_year_confirmed ?? sanitized.filingYearConfirmed
            )
            const currentYearData = sanitized.current_year_data as
              | { year?: number; revenue?: number; ebitda?: number }
              | undefined
            if (currentYearData && typeof currentYearData === 'object') {
              sanitized.current_year_data = {
                ...currentYearData,
                year: normalizeCurrentYearForFiling(currentYearData.year, filingYearConfirmed),
              }
            }
            if (Array.isArray(sanitized.historical_years_data)) {
              sanitized.historical_years_data = normalizeHistoricalYearsForFiling(
                sanitized.historical_years_data as Array<{
                  year: number
                  revenue?: number
                  ebitda?: number
                }>,
                filingYearConfirmed
              )
            }
            if (Object.keys(sanitized).length > 0) {
              const formStore = useManualFormStore.getState()
              formStore.updateFormData(asFormPatch(sanitized))
              logger.info('Hydrated form from previous valuation (new schatting prefill)', {
                reportId: report.reportId.substring(0, 30),
                formFieldsCount: Object.keys(sanitized).length,
                fingerprintMatched: restored.matched,
                legacyEntry: restored.legacy,
              })
            }
          }
        } catch (e) {
          logger.warn('Prefill from new valuation failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        }

        logger.info('Created minimal session for new report from bootstrap', {
          reportId: report.reportId.substring(0, 30),
          prefillConfidence: prefillData.confidence.toFixed(2),
          hasCompanyName: !!prefillData.companyInfo?.companyName,
          prefillFieldsCount: Object.keys(sessionData).length - 2,
          identityType: identity.type,
          note: 'Session will be created on backend when user first saves (via saveSession with _bootstrapCreated flag)',
        })
      } else {
        logger.debug('New report - session already exists in store', {
          reportId: report.reportId.substring(0, 30),
        })
      }
    } else if (report.mode === 'existing') {
      const hasPrefill = hasMeaningfulPrefill(prefillData)
      const pkg = state.valuationPackage
      const packageRenderableHtml = getFirstRenderableReportHtml(pkg?.htmlReport)
      const hasPackage = Boolean(
        pkg &&
          (packageRenderableHtml ||
            pkg.pricingRange ||
            (pkg.formData && Object.keys(pkg.formData).length > 0) ||
            pkg.pdf?.url ||
            pkg.buyerReadiness)
      )
      const now = new Date()
      const sessionData: BootstrapSessionData = asSessionData({
        _bootstrapPrefill: hasPrefill,
      })
      if (hasPackage && pkg) {
        if (packageRenderableHtml) sessionData._htmlReport = packageRenderableHtml
        if (pkg.pricingRange) sessionData._pricingRange = pkg.pricingRange
        if (pkg.pdf?.url) sessionData.pdfUrl = pkg.pdf.url
        if (pkg.buyerReadiness) sessionData._buyerReadiness = pkg.buyerReadiness
        if (pkg.formData && Object.keys(pkg.formData).length > 0) {
          Object.assign(
            sessionData,
            stripBlockedFinancialSurface(
              mergeSessionSurfaceForOptionalPrefill(pkg.formData),
              blockUntrustedFinancialPrefill
            )
          )
        }
      }
      if (hasPrefill) {
        Object.assign(sessionData, buildPrefillSessionFields(prefillData))
      }

      const minimalSession: BootstrapMinimalSession = {
        reportId: report.reportId,
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: now,
        updatedAt: now,
        partialData: {},
        sessionData,
      }
      if (hasPackage && pkg) {
        if (packageRenderableHtml) {
          minimalSession.htmlReport = packageRenderableHtml
        }
        if (pkg.pdf?.url) minimalSession.pdfUrl = pkg.pdf.url
        if (pkg.buyerReadiness) minimalSession.buyerReadiness = pkg.buyerReadiness
        if (pkg.pricingRange) {
          minimalSession.valuationResult = pricingRangeToValuationResult(pkg.pricingRange)
        }
      }
      sessionStore.hydrateSessionAndComplete(minimalSession)

      if (hasPrefill) {
        const formDataUpdate = buildPrefillFormFields(prefillData)
        Object.assign(
          formDataUpdate,
          mergeOptionalSessionPrefillFields(sessionData, {
            ...useManualFormStore.getState().formData,
            ...formDataUpdate,
          })
        )
        if (Object.keys(formDataUpdate).length > 0) {
          useManualFormStore.getState().updateFormData(asFormPatch(formDataUpdate))
          logger.info('Hydrated form store from bootstrap prefill (existing report)', {
            reportId: report.reportId.substring(0, 30),
            formFieldsCount: Object.keys(formDataUpdate).length,
          })
        }
      }

      logger.info('Merged bootstrap into session for existing report (before loadSession)', {
        reportId: report.reportId.substring(0, 30),
        hasPrefill,
        hasPackage,
        prefillFieldsCount: Object.keys(sessionData).length - 1,
      })

      logger.info(
        'Bootstrap sync created minimal session - delegating full load to ValuationSessionManager',
        {
          reportId: report.reportId.substring(0, 30),
          hasExistingData: report.hasExistingData,
          hasValuationResult: report.hasValuationResult,
        }
      )
    }

    applyCountryPrefillIfNewReport(report, prefillData)
  } catch (error) {
    logger.error('Failed to sync session', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
