/**
 * ValuationForm Component
 *
 * Main form for entering business valuation data.
 * Single Responsibility: Form orchestration and state management.
 *
 * Uses Manual flow stores:
 * - useManualFormStore for form data state
 * - useSessionStore for session sync (unified)
 * - useManualResultsStore for calculation state
 * - useFormSessionSync hook for syncing with session
 *
 * @module components/ValuationForm/ValuationForm
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useBootstrapPrefill } from '../../hooks/useBootstrapPrefill'
import { useBusinessTypes } from '../../hooks/useBusinessTypes'
import { useFormSessionSync } from '../../hooks/useFormSessionSync'
import { usePrefillRestorationCoordinator } from '../../hooks/usePrefillRestorationCoordinator'
import { useSessionDataPrefill } from '../../hooks/useSessionDataPrefill'
import { useSessionOptionalMethodPrefill } from '../../hooks/useSessionOptionalMethodPrefill'
import { useBootstrapSafe } from '../../lib/bootstrap'
import { type BusinessType, businessTypesApiService } from '../../services/businessTypesApi'
import { useManualFormStore, useManualResultsStore } from '../../store/manual'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import { getCurrentFilingYear, normalizeCurrentYearForFiling } from '../../utils/fiscalYear'
import { generalLogger } from '../../utils/logger'
import { hasExistingValuationVersion, shouldOpenVersionConfirmation } from '../../utils/versionConfirmation'
import { RecalculateConfirmationPopup } from '../normalization/RecalculateConfirmationPopup'
import { useValuationFormSubmission } from './hooks/useValuationFormSubmission'
import { BasicInformationSection } from './sections/BasicInformationSection'
import { FinancialDataSection } from './sections/FinancialDataSection'
import { FormSubmitSection } from './sections/FormSubmitSection'
import { HistoricalDataSection } from './sections/HistoricalDataSection'
import { OwnershipStructureSection } from './sections/OwnershipStructureSection'
import { buildBusinessTypeFormData } from './utils/businessTypeFormData'

export interface ValuationFormProps {
  /** Initial version to load (for M&A workflow - edit previous versions) */
  initialVersion?: number
  /** Whether form is in regeneration mode (shows "Regenerate" instead of "Calculate") */
  isRegenerationMode?: boolean
}

/**
 * ValuationForm Component
 *
 * Main form for entering business valuation data.
 * Orchestrates all form sections and manages form-level state.
 *
 * Enhanced for M&A workflow:
 * - Load specific version data for editing
 * - Show regeneration mode when editing completed reports
 * - Track changes for version diff
 */
export const ValuationForm: React.FC<ValuationFormProps> = ({
  initialVersion,
  isRegenerationMode = false,
}) => {
  // ✅ FIX: Use selector to ensure component re-renders when formData changes
  // This ensures form fields update when restoration happens
  const formData = useManualFormStore((state) => state.formData)
  const updateFormData = useManualFormStore((state) => state.updateFormData)
  const prefillFromBusinessCard = useManualFormStore((state) => state.prefillFromBusinessCard)
  // ROOT CAUSE FIX: Only subscribe to reportId, not entire session object
  // This prevents re-renders when session data updates
  const reportId = useSessionStore((state) => state.session?.reportId)

  const { businessTypes } = useBusinessTypes()
  const { businessCard, isAuthenticated } = useAuth()
  const { getVersion } = useVersionHistoryStore()

  // Load version data if initialVersion is provided (M&A workflow)
  // CRITICAL: Read session state via getState() inside effect, not as subscription
  useEffect(() => {
    if (initialVersion && reportId) {
      try {
        const version = getVersion(reportId, initialVersion)
        if (version?.formData) {
          generalLogger.info('Loading version data into form', {
            reportId,
            versionNumber: initialVersion,
          })
          // Convert version formData to form store format
          // This will pre-fill the form with the version's data
          updateFormData(version.formData as any)
        }
      } catch (error) {
        // BANK-GRADE: Specific error handling - version load failure
        if (error instanceof Error) {
          generalLogger.warn('Failed to load version data', {
            reportId,
            versionNumber: initialVersion,
            error: error.message,
            stack: error.stack,
          })
        } else {
          generalLogger.warn('Failed to load version data', {
            reportId,
            versionNumber: initialVersion,
            error: String(error),
          })
        }
      }
    }
  }, [initialVersion, reportId, getVersion, updateFormData])

  // Local state for historical data inputs
  const [historicalInputs, setHistoricalInputs] = useState<{ [key: string]: string }>({})
  const [hasPrefilledOnce, setHasPrefilledOnce] = useState(false)
  const [employeeCountError, setEmployeeCountError] = useState<string | null>(null)
  // Tracks whether historicalInputs has ever been populated (by user or restoration).
  // Prevents the historicalInputs→formData sync effect from clearing restored
  // historical_years_data on initial mount when historicalInputs is still {}.
  const historicalInputsEverPopulatedRef = useRef(false)
  // ✅ IMPROVED: Restore historical data whenever formData.historical_years_data changes
  // This ensures all years with revenue or EBITDA data are preserved, even if outside display range
  // Only restores missing data - preserves existing user edits
  useEffect(() => {
    const historicalYearsData = formData.historical_years_data
    if (
      historicalYearsData &&
      Array.isArray(historicalYearsData) &&
      historicalYearsData.length > 0
    ) {
      // Get current historicalInputs to check what's already there
      // Use functional update to avoid stale closure issues
      setHistoricalInputs((currentInputs) => {
        const restoredInputs: { [key: string]: string } = { ...currentInputs }
        let hasNewData = false

        historicalYearsData.forEach(
          (yearData: { year: number; revenue?: number; ebitda?: number }) => {
            const revenueKey = `${yearData.year}_revenue`
            const ebitdaKey = `${yearData.year}_ebitda`

            // Restore revenue when it's a number (including 0 - break-even is valid)
            if (typeof yearData.revenue === 'number') {
              const currentRevenue = currentInputs[revenueKey]
              if (!currentRevenue || currentRevenue.trim() === '') {
                restoredInputs[revenueKey] = yearData.revenue.toString()
                hasNewData = true
              }
            }

            // Restore ebitda when it's a number (including 0 - break-even is valid)
            if (typeof yearData.ebitda === 'number') {
              const currentEbitda = currentInputs[ebitdaKey]
              if (!currentEbitda || currentEbitda.trim() === '') {
                restoredInputs[ebitdaKey] = yearData.ebitda.toString()
                hasNewData = true
              }
            }
          }
        )

        if (hasNewData) {
          historicalInputsEverPopulatedRef.current = true
          generalLogger.info('[ValuationForm] Restored historical data to inputs', {
            reportId,
            yearsRestored: historicalYearsData.length,
            inputKeys: Object.keys(restoredInputs),
            years: historicalYearsData.map((d) => d.year),
          })
          return restoredInputs
        }

        // No new data to restore, return current inputs unchanged
        return currentInputs
      })
    }
  }, [formData.historical_years_data, reportId])

  // Match business type string to business_type_id
  const matchBusinessType = useCallback(
    (query: string, businessTypes: BusinessType[]): string | null => {
      if (!query || !businessTypes || businessTypes.length === 0) return null

      const queryLower = query.toLowerCase().trim()

      // 1. Exact match on title (case-insensitive)
      const exactMatch = businessTypes.find((bt) => bt.title.toLowerCase() === queryLower)
      if (exactMatch) {
        generalLogger.info('Matched business type (exact)', {
          query,
          matched: exactMatch.title,
          id: exactMatch.id,
        })
        return exactMatch.id
      }

      // 2. Match on keywords
      const keywordMatch = businessTypes.find(
        (bt) =>
          bt.keywords &&
          bt.keywords.some(
            (keyword: string) =>
              keyword.toLowerCase() === queryLower ||
              queryLower.includes(keyword.toLowerCase()) ||
              keyword.toLowerCase().includes(queryLower)
          )
      )
      if (keywordMatch) {
        generalLogger.info('Matched business type (keyword)', {
          query,
          matched: keywordMatch.title,
          id: keywordMatch.id,
        })
        return keywordMatch.id
      }

      // 3. Partial match on title (contains)
      const partialMatch = businessTypes.find(
        (bt) =>
          bt.title.toLowerCase().includes(queryLower) || queryLower.includes(bt.title.toLowerCase())
      )
      if (partialMatch) {
        generalLogger.info('Matched business type (partial)', {
          query,
          matched: partialMatch.title,
          id: partialMatch.id,
        })
        return partialMatch.id
      }

      // 4. Common variations mapping
      const variations: Record<string, string[]> = {
        saas: ['saas', 'software as a service', 'software service'],
        restaurant: ['restaurant', 'cafe', 'bistro', 'dining'],
        'e-commerce': ['e-commerce', 'ecommerce', 'online store', 'online shop'],
        manufacturing: ['manufacturing', 'manufacturer', 'production'],
        consulting: ['consulting', 'consultant', 'advisory'],
        'tech startup': ['tech startup', 'startup', 'tech company'],
      }

      for (const [key, variants] of Object.entries(variations)) {
        if (variants.some((v) => queryLower.includes(v))) {
          const variationMatch = businessTypes.find(
            (bt) =>
              bt.title.toLowerCase().includes(key) ||
              bt.keywords?.some((k: string) => k.toLowerCase().includes(key))
          )
          if (variationMatch) {
            generalLogger.info('Matched business type (variation)', {
              query,
              matched: variationMatch.title,
              id: variationMatch.id,
            })
            return variationMatch.id
          }
        }
      }

      generalLogger.warn('No business type match found', { query })
      return null
    },
    []
  )

  // Use form session sync hook for syncing form changes to session
  // ROOT CAUSE FIX: Pass reportId instead of session object to prevent re-renders
  // Note: Restoration is handled centrally by SessionRestorationService via useSessionStore.loadSession()
  useFormSessionSync({
    reportId,
    formData,
  })

  usePrefillRestorationCoordinator(reportId)

  // NOTE: DataResponse[] syncing is not needed for Manual flow
  // Manual flow uses formData directly, conversational flow uses collected data
  // This keeps the flows isolated and prevents confusion

  // NOTE: Manual flow doesn't need DataResponse[] syncing
  // Form data is used directly in form submission

  // Convert historicalInputs to formData.historical_years_data
  // Backend requires chronological order (oldest first), but UI shows most recent first.
  // The filing year is captured separately via formData.revenue / formData.ebitda
  // (rendered by the "Last Full Year Financials" section AND the filing-year row in
  // HistoricalDataInputs). To avoid a duplicate-year ValidationError in
  // buildValuationRequest, the filing year is excluded from historical_years_data here
  // and instead mirrored into the canonical revenue/ebitda fields below.
  useEffect(() => {
    const maxHistoricalYear = normalizeCurrentYearForFiling(
      formData.current_year_data?.year,
      Boolean(formData.filing_year_confirmed)
    )
    const historicalYears: { year: number; revenue: number; ebitda: number }[] = []

    // Extract all years from historicalInputs (strictly older than the filing year)
    const yearSet = new Set<number>()
    Object.keys(historicalInputs).forEach((key) => {
      const match = key.match(/^(\d{4})_(revenue|ebitda)$/)
      if (match) {
        const year = parseInt(match[1])
        if (year >= 2000 && year < maxHistoricalYear) {
          yearSet.add(year)
        }
      }
    })

    // Build historical_years_data array
    yearSet.forEach((year) => {
      const revenueKey = `${year}_revenue`
      const ebitdaKey = `${year}_ebitda`
      const revenue = historicalInputs[revenueKey]
      const ebitda = historicalInputs[ebitdaKey]

      // Only include if at least one field has a value
      if (revenue || ebitda) {
        historicalYears.push({
          year,
          revenue: revenue ? parseFloat(revenue.replace(/,/g, '')) || 0 : 0,
          ebitda: ebitda ? parseFloat(ebitda.replace(/,/g, '')) || 0 : 0,
        })
      }
    })

    // Sort chronologically (oldest first) for backend compatibility
    historicalYears.sort((a, b) => a.year - b.year)

    // ✅ LOGGING: Verify all years are included in conversion
    if (Object.keys(historicalInputs).length > 0) {
      generalLogger.debug('[ValuationForm] Converting historicalInputs to historical_years_data', {
        reportId,
        inputKeys: Object.keys(historicalInputs),
        extractedYears: Array.from(yearSet).sort((a, b) => a - b),
        historicalYearsCount: historicalYears.length,
        historicalYears: historicalYears.map((h) => ({
          year: h.year,
          hasRevenue: h.revenue > 0,
          hasEbitda: h.ebitda > 0,
        })),
      })
    }

    // Update formData with sorted historical data
    if (historicalYears.length > 0) {
      historicalInputsEverPopulatedRef.current = true
      updateFormData({
        historical_years_data: historicalYears,
      })
    } else if (historicalInputsEverPopulatedRef.current) {
      // Only clear if user previously had data and then removed it.
      // On initial mount historicalInputs is {} -- skip clearing to preserve
      // historical_years_data that was set by bootstrap prefill / restoration.
      updateFormData({
        historical_years_data: undefined,
      })
    }

    // Mirror the filing-year row in historicalInputs into the canonical
    // formData.revenue / formData.ebitda fields. This makes the 2025 row in
    // HistoricalDataInputs and the "Last Full Year Financials" section share a
    // single source of truth — edits in either place propagate to the other via
    // the restoration effect above (lines ~124-177).
    const filingRevenueKey = `${maxHistoricalYear}_revenue`
    const filingEbitdaKey = `${maxHistoricalYear}_ebitda`
    const rawFilingRevenue = historicalInputs[filingRevenueKey]
    const rawFilingEbitda = historicalInputs[filingEbitdaKey]
    const updates: Partial<typeof formData> = {}

    if (rawFilingRevenue !== undefined && rawFilingRevenue !== '') {
      const parsed = parseFloat(rawFilingRevenue.replace(/,/g, ''))
      const next = Number.isFinite(parsed) ? parsed : undefined
      if (next !== formData.revenue) {
        updates.revenue = next
      }
    }
    if (rawFilingEbitda !== undefined && rawFilingEbitda !== '') {
      const parsed = parseFloat(rawFilingEbitda.replace(/,/g, ''))
      const next = Number.isFinite(parsed) ? parsed : undefined
      if (next !== formData.ebitda) {
        updates.ebitda = next
      }
    }
    if (Object.keys(updates).length > 0) {
      updateFormData(updates)
    }
  }, [
    formData.current_year_data?.year,
    formData.filing_year_confirmed,
    formData.revenue,
    formData.ebitda,
    historicalInputs,
    updateFormData,
  ])

  // Mirror canonical formData.revenue / formData.ebitda back into the filing-year
  // row of historicalInputs whenever the user edits the "Last Full Year Financials"
  // section. Skipped when the values already match to avoid effect loops.
  useEffect(() => {
    const filingYear = normalizeCurrentYearForFiling(
      formData.current_year_data?.year,
      Boolean(formData.filing_year_confirmed)
    )
    const revenueKey = `${filingYear}_revenue`
    const ebitdaKey = `${filingYear}_ebitda`

    const desiredRevenue =
      formData.revenue !== undefined && formData.revenue !== null ? String(formData.revenue) : ''
    const desiredEbitda =
      formData.ebitda !== undefined && formData.ebitda !== null ? String(formData.ebitda) : ''

    const currentRevenue = historicalInputs[revenueKey] ?? ''
    const currentEbitda = historicalInputs[ebitdaKey] ?? ''

    // Compare numerically to ignore formatting differences ("1000" vs "1,000")
    const numericEqual = (a: string, b: string) => {
      const na = parseFloat(a.replace(/,/g, ''))
      const nb = parseFloat(b.replace(/,/g, ''))
      if (a === '' && b === '') return true
      if (a === '' || b === '') return false
      if (Number.isNaN(na) && Number.isNaN(nb)) return a === b
      return na === nb
    }

    const revenueDiff = !numericEqual(currentRevenue, desiredRevenue)
    const ebitdaDiff = !numericEqual(currentEbitda, desiredEbitda)

    if (revenueDiff || ebitdaDiff) {
      setHistoricalInputs((prev) => ({
        ...prev,
        ...(revenueDiff ? { [revenueKey]: desiredRevenue } : {}),
        ...(ebitdaDiff ? { [ebitdaKey]: desiredEbitda } : {}),
      }))
    }
  }, [
    formData.current_year_data?.year,
    formData.filing_year_confirmed,
    formData.revenue,
    formData.ebitda,
    historicalInputs,
  ])

  // Clear owner concentration fields when switching to sole-trader
  // Set defaults when switching to company
  useEffect(() => {
    if (formData.business_type === 'sole-trader') {
      // Clear owner concentration fields (not applicable for sole traders)
      if (formData.number_of_employees !== undefined || formData.number_of_owners !== undefined) {
        updateFormData({
          number_of_employees: undefined,
          number_of_owners: undefined,
        })
      }
    } else if (formData.business_type === 'company') {
      // Set default number_of_owners if not already set (minimum 1 for companies)
      if (!formData.number_of_owners || formData.number_of_owners < 1) {
        updateFormData({ number_of_owners: 1 })
      }
    }
  }, [formData.business_type, updateFormData])

  // ============================================================================
  // PREFILL STRATEGY: Priority-based cascade
  // ============================================================================
  // Priority 1: Session data from Mercury (accountant → client flow)
  // Priority 2: Auth context (user's own business card)
  // Priority 3: URL parameters (prefilledQuery)

  // PRE-FILL: Priority 0 - Bootstrap prefill (World-class initialization)
  // This runs first and applies data from the bootstrap system which resolves
  // auth, session, and prefill data BEFORE UI renders. This is the most
  // comprehensive prefill as it aggregates from all sources: KBO, user profile,
  // session data, and Mercury business card.
  const { prefillConfidence } = useBootstrapPrefill()

  // ✅ WORLD-CLASS: Get bootstrap state to check if viewing existing report
  const bootstrap = useBootstrapSafe()
  const isViewingExistingReport =
    bootstrap?.report?.mode === 'existing' && bootstrap?.report?.hasExistingData

  // ✅ WORLD-CLASS ARCHITECTURE: Bootstrap is the SINGLE SOURCE OF TRUTH
  // useSessionDataPrefill is deprecated - it will skip when bootstrap is available
  useSessionDataPrefill()
  useSessionOptionalMethodPrefill()

  // PRE-FILL: Business card (ONLY if bootstrap hasn't already prefilled)
  // Bootstrap aggregates all prefill sources including user profile, so this is a fallback
  useEffect(() => {
    // ✅ WORLD-CLASS FIX: Skip if bootstrap has already prefilled
    // Bootstrap is the single source of truth for all prefill data
    if (prefillConfidence > 0.1) {
      generalLogger.debug('Skipping business card prefill - bootstrap already prefilled', {
        prefillConfidence: prefillConfidence.toFixed(2),
      })
      return
    }

    // Skip prefill for existing reports with data
    if (isViewingExistingReport) {
      generalLogger.debug('Skipping business card prefill - viewing existing report')
      return
    }

    // Skip if no business card or already prefilled
    if (!isAuthenticated || !businessCard || hasPrefilledOnce || businessTypes.length === 0) {
      return
    }

    generalLogger.info('Pre-filling form with business card data (bootstrap fallback)', {
      company_name: businessCard.company_name?.substring(0, 20),
    })

    // ✅ FIX: prefillFromBusinessCard now uses requestAnimationFrame internally
    prefillFromBusinessCard(businessCard)

    // Match business_type_id if available
    if ((businessCard as any).business_type_id) {
      const matchingType = businessTypes.find(
        (bt) => bt.id === (businessCard as any).business_type_id
      )
      if (matchingType) {
          updateFormData(
            buildBusinessTypeFormData(matchingType, businessCard.industry || 'services') as any
          )
      }
    } else if (businessCard.industry) {
      const matchingType = businessTypes.find(
        (bt) =>
          bt.industry === businessCard.industry || bt.industryMapping === businessCard.industry
      )
      if (matchingType) {
          updateFormData(buildBusinessTypeFormData(matchingType) as any)
      }
    }

    setHasPrefilledOnce(true)
  }, [
    prefillConfidence,
    isAuthenticated,
    businessCard,
    hasPrefilledOnce,
    prefillFromBusinessCard,
    businessTypes,
    updateFormData,
    isViewingExistingReport,
    bootstrap?.report?.mode,
    bootstrap?.report?.hasExistingData,
  ])

  // PRE-FILL: Priority 3 - NACE code to business type suggestion
  // Auto-suggest business type from NACE code (from KBO registry) via Titan's NACE mapping
  const lastProcessedNaceRef = useRef<string | null>(null)
  useEffect(() => {
    const naceCode = formData.nace_code?.trim()
    if (
      !naceCode ||
      formData.business_type_id ||
      businessTypes.length === 0 ||
      lastProcessedNaceRef.current === naceCode
    ) {
      return
    }

    lastProcessedNaceRef.current = naceCode
    let cancelled = false

    ;(async () => {
      try {
        const bt = await businessTypesApiService.getBusinessTypeForNaceCode(
          naceCode,
          formData.country_code || undefined,
        )
        if (cancelled || !bt) return

        // Always prefer the full BusinessType from the loaded list (has preference fields).
        // The NACE API returns a sparse object without dcfPreference / multiplesPreference.
        const matchedType = businessTypes.find((t) => t.id === bt.id)
        if (matchedType) {
          generalLogger.info('[ValuationForm] Prefilled business type from NACE (full type)', {
            nace_code: naceCode,
            business_type_id: matchedType.id,
            title: matchedType.title,
          })
          updateFormData(buildBusinessTypeFormData(matchedType) as any)
        } else {
          // Sparse fallback: bt lacks preference fields, but still better than nothing.
          generalLogger.warn('[ValuationForm] NACE type not in loaded list, using sparse NACE object', {
            nace_code: naceCode,
            business_type_id: bt.id,
          })
          updateFormData(buildBusinessTypeFormData(bt) as any)
        }
      } catch (err: unknown) {
        // Only silently ignore 404 / "not found" — those mean no mapping exists for this NACE code.
        // Log all other errors so they surface during development and monitoring.
        const status = (err as any)?.response?.status ?? (err as any)?.status
        const message = err instanceof Error ? err.message : String(err)
        const isNotFound =
          status === 404 ||
          message.toLowerCase().includes('not found') ||
          message.toLowerCase().includes('no mapping')
        if (!isNotFound) {
          generalLogger.warn('[ValuationForm] NACE lookup failed unexpectedly', {
            nace_code: naceCode,
            status,
            error: message,
          })
        }
        // In all cases: leave business type empty — user can select manually
      } finally {
        if (cancelled) lastProcessedNaceRef.current = null
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    formData.nace_code,
    formData.country_code,
    formData.business_type_id,
    businessTypes,
    updateFormData,
  ])

  // PRE-FILL: Priority 4 - prefilledQuery (URL parameter)
  // This runs after restoration and business types are loaded
  const [hasProcessedPrefilledQuery, setHasProcessedPrefilledQuery] = useState(false)
  useEffect(() => {
    // ROOT CAUSE FIX: Read session state via getState() inside effect, not as subscription
    const currentSession = useSessionStore.getState().session
    const prefilledQuery = (currentSession?.partialData as any)?._prefilledQuery

    // Only process if:
    // 1. prefilledQuery exists
    // 2. Business types are loaded
    // 3. Form doesn't already have a business type (to avoid overriding restored data)
    // 4. We haven't processed it yet
    if (
      prefilledQuery &&
      businessTypes.length > 0 &&
      !formData.business_type_id &&
      !hasProcessedPrefilledQuery
    ) {
      generalLogger.info('Processing prefilledQuery from URL', {
        prefilledQuery,
        reportId,
      })

      // Match query to business type
      const matchedBusinessTypeId = matchBusinessType(prefilledQuery, businessTypes)

      if (matchedBusinessTypeId) {
        const matchedType = businessTypes.find((bt) => bt.id === matchedBusinessTypeId)
        if (matchedType) {
          generalLogger.info('Prefilled business type from URL query', {
            query: prefilledQuery,
            matchedType: matchedType.title,
            id: matchedType.id,
          })

          updateFormData(buildBusinessTypeFormData(matchedType) as any)

          setHasProcessedPrefilledQuery(true)

          // ✅ NEW: Mark initialization as complete after prefill
          // This enables toasts for subsequent user actions
          setTimeout(() => {
            useSessionStore.getState().completeInitialization()
          }, 500) // Small delay to ensure any triggered saves complete during init phase
        }
      } else {
        generalLogger.warn('Could not match prefilledQuery to business type', {
          prefilledQuery,
        })
        // Mark as processed even if no match to avoid retrying
        setHasProcessedPrefilledQuery(true)

        // ✅ NEW: Mark initialization as complete even if no match
        setTimeout(() => {
          useSessionStore.getState().completeInitialization()
        }, 500)
      }
    }

    // ✅ NEW: If no prefilledQuery, mark initialization as complete after business types load
    if (!prefilledQuery && businessTypes.length > 0 && !hasProcessedPrefilledQuery) {
      setHasProcessedPrefilledQuery(true)
      setTimeout(() => {
        useSessionStore.getState().completeInitialization()
      }, 500)
    }
  }, [
    reportId,
    businessTypes,
    formData.business_type_id,
    hasProcessedPrefilledQuery,
    matchBusinessType,
    updateFormData,
  ])

  // Use form submission hook
  const { handleSubmit, isSubmitting } = useValuationFormSubmission(setEmployeeCountError)

  // EBITDA Normalization integration
  const normalizationItems = useNormalizationStore((state) => state.items)
  const hasLegacyNormalization = useEbitdaNormalizationStore((state) => state.hasNormalization)
  const lastFullYear = getCurrentFilingYear()
  const [showNormalizationConfirmation, setShowNormalizationConfirmation] = useState(false)
  const [hasPendingSubmit, setHasPendingSubmit] = useState(false)
  const versionConfirmationOpenRef = useRef(false)
  const { getLatestVersion } = useVersionHistoryStore()

  // Check if any normalizations exist
  const hasAnyNormalization = useMemo(
    () =>
      normalizationItems.some((item) => {
        if (item.status !== 'accepted') return false
        const years = item.applyAllYears
          ? [lastFullYear, lastFullYear - 1, lastFullYear - 2]
          : item.applyYears && item.applyYears.length > 0
            ? item.applyYears
            : [item.year]
        return years.some((year) => year >= lastFullYear - 2 && year <= lastFullYear)
      }) || [lastFullYear, lastFullYear - 1, lastFullYear - 2].some((year) => hasLegacyNormalization(year)),
    [normalizationItems, lastFullYear, hasLegacyNormalization]
  )

  // Get current version number
  const currentVersion = reportId ? getLatestVersion(reportId) : null
  const currentVersionNumber = currentVersion?.versionNumber ?? 0

  // Check if user has an existing completed valuation (version >= 1)
  // This is used to determine if we should show the "Create New Version" popup
  const hasExistingValuation = hasExistingValuationVersion(currentVersion)

  // Check if form data has changed from the last version
  // This compares the current form data with the version's form data
  const hasFormChanges = useMemo(() => {
    if (!currentVersion?.formData) return false
    const versionFormData = currentVersion.formData as any

    // Compare key fields that affect valuation
    const changedFields = []
    if (formData.company_name !== versionFormData.company_name) changedFields.push('company_name')
    if (formData.revenue !== versionFormData.revenue) changedFields.push('revenue')
    if (formData.ebitda !== versionFormData.ebitda) changedFields.push('ebitda')
    if (formData.industry !== versionFormData.industry) changedFields.push('industry')
    if (formData.founding_year !== versionFormData.founding_year)
      changedFields.push('founding_year')
    if (formData.number_of_employees !== versionFormData.number_of_employees)
      changedFields.push('employees')
    if (formData.number_of_owners !== versionFormData.number_of_owners) changedFields.push('owners')

    // Include yearly financials (revenue, ebitda per year) - critical for EBITDA change detection
    const formYearly =
      (formData as any).yearlyFinancials ?? formData.historical_years_data ?? []
    const versionYearly =
      versionFormData.yearlyFinancials ?? versionFormData.historical_years_data ?? []
    if (JSON.stringify(formYearly) !== JSON.stringify(versionYearly)) {
      changedFields.push('yearlyFinancials')
    }

    return changedFields.length > 0
  }, [currentVersion?.formData, formData])

  // Only show the version confirmation for an existing valuation when the form changed
  // or accepted normalizations would materially change the next calculation.
  const shouldShowVersionConfirmation = shouldOpenVersionConfirmation({
    currentVersion,
    hasFormChanges,
    hasAnyNormalization,
    isConfirmationOpen: versionConfirmationOpenRef.current,
  })

  // Memoize prefilledQuery to prevent render loops
  // ROOT CAUSE FIX: Read session state via getState(), not as subscription
  const prefilledQueryValue = useMemo(() => {
    const currentSession = useSessionStore.getState().session
    return (currentSession?.partialData as any)?._prefilledQuery || null
  }, [reportId]) // Only recompute when reportId changes
  const prefilledQuery = useMemo(() => {
    return prefilledQueryValue || null
  }, [prefilledQueryValue]) // Only recompute when the actual string value changes

  // Get business types loading/error state
  const { loading: businessTypesLoading, error: businessTypesError } = useBusinessTypes()

  // Get API errors from store (Manual flow)
  const apiError = useManualResultsStore((state) => state.error)
  const clearApiErrorFromStore = useManualResultsStore((state) => state.clearError)

  // Combine all errors: employeeCountError (validation) + apiError (API failures)
  const displayError = employeeCountError || apiError || null

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setEmployeeCountError(null)
    clearApiErrorFromStore()
  }, [setEmployeeCountError, clearApiErrorFromStore])

  // Handle form submission with version confirmation check
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      // Ignore background/duplicate submits while the confirmation modal is open.
      if (versionConfirmationOpenRef.current) {
        return
      }

      // Check if we should show the "Create New Version" confirmation popup
      // This triggers when:
      // 1. User has an existing valuation AND (form changed OR normalizations added)
      if (shouldShowVersionConfirmation) {
        generalLogger.info(
          'Changes detected on existing valuation, showing version confirmation popup',
          {
            hasExistingValuation,
            hasFormChanges,
            hasAnyNormalization,
            currentVersionNumber,
          }
        )
        versionConfirmationOpenRef.current = true
        setHasPendingSubmit(true)
        setShowNormalizationConfirmation(true)
        return
      }

      // Proceed with normal submission
      generalLogger.info('Form onSubmit handler called', {
        hasHandleSubmit: !!handleSubmit,
        isSubmitting,
        hasNormalization: hasAnyNormalization,
        hasFormChanges,
        willCreateNewVersion: shouldShowVersionConfirmation,
      })
      try {
        clearAllErrors()
        await handleSubmit(e)
      } catch (error) {
        generalLogger.error('[Manual] Form submission error', { error })
        // Reset loading state on unexpected error
        const { setCalculating } = useManualResultsStore.getState()
        setCalculating(false)
      }
    },
    [
      shouldShowVersionConfirmation,
      showNormalizationConfirmation,
      hasExistingValuation,
      hasFormChanges,
      hasAnyNormalization,
      currentVersionNumber,
      handleSubmit,
      isSubmitting,
      clearAllErrors,
    ]
  )

  // Handle confirmation of normalization
  const handleConfirmNormalization = useCallback(async () => {
    if (!hasPendingSubmit) return

    versionConfirmationOpenRef.current = false
    setShowNormalizationConfirmation(false)
    setHasPendingSubmit(false)

    try {
      clearAllErrors()
      await handleSubmit()
    } catch (error) {
      generalLogger.error('[Manual] Confirmed version submission error', { error })
      const { setCalculating } = useManualResultsStore.getState()
      setCalculating(false)
    }
  }, [hasPendingSubmit, clearAllErrors, handleSubmit])

  return (
    <>
      <form onSubmit={handleFormSubmit} className="space-y-12 @container">
        <BasicInformationSection
          formData={formData}
          updateFormData={updateFormData}
          businessTypes={businessTypes}
          businessTypesLoading={businessTypesLoading}
          businessTypesError={businessTypesError}
          prefilledQuery={prefilledQuery}
        />

        <OwnershipStructureSection
          formData={formData}
          updateFormData={updateFormData}
          employeeCountError={employeeCountError}
          setEmployeeCountError={setEmployeeCountError}
        />

        <FinancialDataSection formData={formData} updateFormData={updateFormData} />

        <HistoricalDataSection
          historicalInputs={historicalInputs}
          setHistoricalInputs={setHistoricalInputs}
          foundingYear={formData.founding_year}
        />

        <FormSubmitSection
          isSubmitting={isSubmitting}
          error={displayError}
          clearError={clearAllErrors}
          formData={formData}
          isRegenerationMode={isRegenerationMode}
        />
      </form>

      {/* Version Confirmation Popup - Shows when creating a new version */}
      <RecalculateConfirmationPopup
        isOpen={showNormalizationConfirmation}
        currentVersion={currentVersionNumber}
        onConfirm={handleConfirmNormalization}
        onCancel={() => {
          versionConfirmationOpenRef.current = false
          setShowNormalizationConfirmation(false)
          setHasPendingSubmit(false)
        }}
        isCreating={isSubmitting}
        hasFormChanges={hasFormChanges}
        hasNormalizations={hasAnyNormalization}
      />
    </>
  )
}
