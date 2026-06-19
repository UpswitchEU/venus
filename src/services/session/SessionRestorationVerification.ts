import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { generalLogger } from '../../utils/logger'
import { mergeSessionSurfaceForOptionalPrefill } from '../../utils/mergeOptionalSessionPrefillFields'
import { getRegistryIdentityFromRecord } from '../../utils/registryIdentity'
import { extractRenderableHtmlFromSessionPayload } from '../../utils/reportHtmlRecovery'
import type { NormalizedSessionData } from './SessionNormalizer'
import { asRecord } from './SessionRestorationCoercion'

interface RestorationVerificationManifest {
  formData: boolean
  valuationResult: boolean
  htmlReport: boolean
  pricingRange: boolean
  versionHistory: boolean
  ebitdaNormalizations: boolean
}

export function verifySessionRestoration(data: NormalizedSessionData): boolean {
  const isConversational = data.flowType === 'conversational'
  const warnings: string[] = []
  let allVerified = true

  const mergedEnvelope = mergeSessionSurfaceForOptionalPrefill(data.sessionDataEnvelope)
  const hasEnvelopeIdentity = !!(
    (typeof mergedEnvelope.company_name === 'string' &&
      mergedEnvelope.company_name.trim() !== '') ||
    getRegistryIdentityFromRecord(mergedEnvelope) ||
    mergedEnvelope.vat_number ||
    mergedEnvelope.vatNumber
  )

  const manifest: RestorationVerificationManifest = {
    formData:
      !isConversational &&
      ((!!data.formData && Object.keys(data.formData).length > 0) || hasEnvelopeIdentity),
    valuationResult: !!data.valuationResult,
    htmlReport: !!data.htmlReport,
    pricingRange: !!data.pricingRange,
    versionHistory: false,
    ebitdaNormalizations: false,
  }

  if (manifest.formData && !isConversational) {
    const formStore = useManualFormStore.getState()
    const expectedCompanyName =
      (typeof data.formData.company_name === 'string' && data.formData.company_name.trim()) ||
      (typeof mergedEnvelope.company_name === 'string' ? mergedEnvelope.company_name.trim() : '')
    const actualCompanyName = formStore.formData.company_name
    if (expectedCompanyName && (!actualCompanyName || actualCompanyName.trim() === '')) {
      warnings.push('Form data company_name not restored to store')
      allVerified = false
    }
    const expectedKbo =
      (typeof data.formData.kbo_number === 'string' && data.formData.kbo_number.trim()) ||
      getRegistryIdentityFromRecord(mergedEnvelope) ||
      ''
    const actualKbo = formStore.formData.kbo_number
    if (expectedKbo && (!actualKbo || String(actualKbo).trim() === '')) {
      warnings.push('Form data kbo_number not restored to store')
      allVerified = false
    }
  }

  if (manifest.valuationResult || manifest.htmlReport) {
    if (isConversational) {
      generalLogger.debug(
        '[SessionRestoration] Skipping conversational results verification - stores removed',
        {
          reportId: data.reportId,
        }
      )
    } else {
      const resultsStore = useManualResultsStore.getState()
      const hasResult = !!resultsStore.result
      const hasHtmlReport = !!extractRenderableHtmlFromSessionPayload({
        htmlReport: resultsStore.htmlReport,
        valuationResult: resultsStore.result,
      })

      if (manifest.valuationResult && !hasResult) {
        warnings.push('Valuation result missing from store')
        allVerified = false
      }
      if (manifest.htmlReport && !hasHtmlReport) {
        warnings.push('HTML report missing from results store')
        allVerified = false
      }
    }
  }

  if (manifest.pricingRange) {
    if (isConversational) {
      generalLogger.debug(
        '[SessionRestoration] Skipping conversational pricing range verification - stores removed',
        {
          reportId: data.reportId,
        }
      )
    } else {
      const resultsStore = useManualResultsStore.getState()

      const result = asRecord(resultsStore.result)
      const hasPricingRangeInStore = !!(
        result?.pricing_range ||
        result?.priceRange ||
        (result?.equity_value_low && result?.equity_value_mid && result?.equity_value_high)
      )

      if (!hasPricingRangeInStore) {
        warnings.push('Pricing range missing from results store')
        allVerified = false
      }
    }
  }

  if (warnings.length > 0) {
    generalLogger.warn('[SessionRestoration] Verification warnings', {
      reportId: data.reportId,
      manifest,
      warnings,
      allVerified,
    })
  } else {
    generalLogger.debug('[SessionRestoration] Verification passed', {
      reportId: data.reportId,
      manifest,
    })
  }

  return allVerified
}
