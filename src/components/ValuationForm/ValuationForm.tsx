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

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useBootstrapPrefill } from '../../hooks/useBootstrapPrefill'
import { useBusinessTypes } from '../../hooks/useBusinessTypes'
import { useFormSessionSync } from '../../hooks/useFormSessionSync'
import { useSessionDataPrefill } from '../../hooks/useSessionDataPrefill'
import type { BusinessType } from '../../services/businessTypesApi'
import { useManualFormStore, useManualResultsStore } from '../../store/manual'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import { generalLogger } from '../../utils/logger'
import { RecalculateConfirmationPopup } from '../normalization/RecalculateConfirmationPopup'
import { useValuationFormSubmission } from './hooks/useValuationFormSubmission'
import { BasicInformationSection } from './sections/BasicInformationSection'
import { FinancialDataSection } from './sections/FinancialDataSection'
import { FormSubmitSection } from './sections/FormSubmitSection'
import { HistoricalDataSection } from './sections/HistoricalDataSection'
import { OwnershipStructureSection } from './sections/OwnershipStructureSection'

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

  // DEBUG: Log formData changes to diagnose restoration display issue
  useEffect(() => {
    generalLogger.debug('[ValuationForm] Form data changed', {
      reportId,
      hasCompanyName: !!formData.company_name,
      companyName: formData.company_name,
      companyNameLength: formData.company_name?.length || 0,
      revenue: formData.revenue,
      ebitda: formData.ebitda,
      industry: formData.industry,
      formDataKeys: Object.keys(formData),
      formDataObjectId: formData ? Object.keys(formData).length : 0,
    })
  }, [formData.company_name, formData.revenue, formData.ebitda, formData.industry, reportId])
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

            // Only restore revenue if it has a truthy value (not 0, not null, not undefined)
            if (yearData.revenue) {
              const currentRevenue = currentInputs[revenueKey]
              if (!currentRevenue || currentRevenue.trim() === '') {
                restoredInputs[revenueKey] = yearData.revenue.toString()
                hasNewData = true
              }
            }

            // Only restore ebitda if it has a truthy value (not 0, not null, not undefined)
            if (yearData.ebitda) {
              const currentEbitda = currentInputs[ebitdaKey]
              if (!currentEbitda || currentEbitda.trim() === '') {
                restoredInputs[ebitdaKey] = yearData.ebitda.toString()
                hasNewData = true
              }
            }
          }
        )

        if (hasNewData) {
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
  // Note: Restoration is handled by useSessionRestoration in ManualLayout
  useFormSessionSync({
    reportId,
    formData,
  })

  // NOTE: DataResponse[] syncing is not needed for Manual flow
  // Manual flow uses formData directly, conversational flow uses collected data
  // This keeps the flows isolated and prevents confusion

  // NOTE: Manual flow doesn't need DataResponse[] syncing
  // Form data is used directly in form submission

  // Convert historicalInputs to formData.historical_years_data
  // Backend requires chronological order (oldest first), but UI shows most recent first
  useEffect(() => {
    const currentYear = new Date().getFullYear()
    const historicalYears: { year: number; revenue: number; ebitda: number }[] = []

    // Extract all years from historicalInputs
    const yearSet = new Set<number>()
    Object.keys(historicalInputs).forEach((key) => {
      const match = key.match(/^(\d{4})_(revenue|ebitda)$/)
      if (match) {
        const year = parseInt(match[1])
        if (year >= 2000 && year <= currentYear) {
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
      updateFormData({
        historical_years_data: historicalYears,
      })
    } else {
      updateFormData({
        historical_years_data: undefined,
      })
    }
  }, [historicalInputs, updateFormData])

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
  
  // PRE-FILL: Priority 1 - Session data from Mercury
  // This handles the critical UX case where accountant creates client in Mercury
  // with KBO data, then generates valuation link. Client opens Venus and sees
  // fully prefilled form even though they're not authenticated.
  // Note: Bootstrap prefill should already handle this, but kept for backward compatibility
  useSessionDataPrefill()

  // PRE-FILL: Priority 2 - Auth context (user's own business card)
  // Pre-fill form with business card data when authenticated
  useEffect(() => {
    generalLogger.debug('Pre-fill check', {
      isAuthenticated,
      hasBusinessCard: !!businessCard,
      hasPrefilledOnce,
      businessCard,
    })

    if (isAuthenticated && businessCard && !hasPrefilledOnce && businessTypes.length > 0) {
      generalLogger.info('Pre-filling form with business card data', {
        ...businessCard,
        employee_count: businessCard.employee_count
          ? `${businessCard.employee_count} employees`
          : 'not available',
      })

      // First, use standard prefill
      prefillFromBusinessCard(businessCard)

      // Then, try to match business_type_id if available
      if ((businessCard as any).business_type_id) {
        const matchingType = businessTypes.find(
          (bt) => bt.id === (businessCard as any).business_type_id
        )

        if (matchingType) {
          generalLogger.info('Found matching business type from profile', {
            id: matchingType.id,
            title: matchingType.title,
          })

          updateFormData({
            business_type_id: matchingType.id,
            business_model: matchingType.id,
            industry:
              matchingType.industry || matchingType.industryMapping || businessCard.industry,
            subIndustry: matchingType.category,
          })
        }
      } else if (businessCard.industry) {
        // Fallback: Try to find matching business type by industry
        const matchingType = businessTypes.find(
          (bt) =>
            bt.industry === businessCard.industry || bt.industryMapping === businessCard.industry
        )

        if (matchingType) {
          generalLogger.info('Found matching business type by industry', {
            id: matchingType.id,
            title: matchingType.title,
            industry: businessCard.industry,
          })

          updateFormData({
            business_type_id: matchingType.id,
            business_model: matchingType.id,
          })
        }
      }

      setHasPrefilledOnce(true)
    }
  }, [
    isAuthenticated,
    businessCard,
    hasPrefilledOnce,
    prefillFromBusinessCard,
    businessTypes,
    updateFormData,
  ])

  // PRE-FILL: Priority 3 - NACE code to business type suggestion
  // Auto-suggest business type from NACE code (from KBO registry)
  // This runs after session data prefill and provides intelligent suggestions
  const [hasProcessedNaceCode, setHasProcessedNaceCode] = useState(false)
  useEffect(() => {
    // Only process if:
    // 1. NACE code exists in form data
    // 2. Business type not already set (don't override user selection)
    // 3. Business types are loaded
    // 4. Haven't processed yet
    if (
      formData.nace_code &&
      !formData.business_type_id &&
      businessTypes.length > 0 &&
      !hasProcessedNaceCode
    ) {
      // Try to find matching business type by NACE code
      // Note: This assumes NACE mappings are synced to business types
      // or we query them separately. For now, we'll use a simple approach
      // where business_type might have nace_code field or we do a lookup
      
      generalLogger.info('[ValuationForm] Auto-suggesting business type from NACE', {
        nace_code: formData.nace_code,
      })

      // For now, mark as processed
      // TODO: Implement NACE lookup via API or include in business types data
      // This would require either:
      // 1. Adding nace_code to business_types table
      // 2. Creating a separate API endpoint to lookup NACE mappings
      // 3. Including NACE mappings in business types API response
      
      setHasProcessedNaceCode(true)
      
      // Future implementation would look like:
      // const matchingType = businessTypes.find(bt => bt.nace_codes?.includes(formData.nace_code))
      // if (matchingType) {
      //   updateFormData({ business_type_id: matchingType.id, ... })
      // }
    }
  }, [formData.nace_code, formData.business_type_id, businessTypes, hasProcessedNaceCode])

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

          updateFormData({
            business_type_id: matchedType.id,
            business_model: matchedType.id,
            industry: matchedType.industry || matchedType.industryMapping || 'services',
            subIndustry: matchedType.category,
            // Store internal metadata for backend
            _internal_dcf_preference: matchedType.dcfPreference,
            _internal_multiples_preference: matchedType.multiplesPreference,
            _internal_owner_dependency_impact: matchedType.ownerDependencyImpact,
            _internal_key_metrics: matchedType.keyMetrics,
            _internal_typical_employee_range: matchedType.typicalEmployeeRange,
            _internal_typical_revenue_range: matchedType.typicalRevenueRange,
          } as any)

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
  const currentYear = Math.min(new Date().getFullYear(), 2100)
  const { hasNormalization } = useEbitdaNormalizationStore()
  const [showNormalizationConfirmation, setShowNormalizationConfirmation] = useState(false)
  const [pendingSubmitEvent, setPendingSubmitEvent] = useState<React.FormEvent | null>(null)
  const { getLatestVersion } = useVersionHistoryStore()

  // Check if any normalizations exist
  const hasAnyNormalization =
    hasNormalization(currentYear) ||
    hasNormalization(currentYear - 1) ||
    hasNormalization(currentYear - 2)

  // Get current version number
  const currentVersion = reportId ? getLatestVersion(reportId) : null
  const currentVersionNumber = currentVersion?.versionNumber || 0

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

  // Handle form submission with normalization check
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      // Check if normalizations exist and user hasn't confirmed yet
      if (hasAnyNormalization && !showNormalizationConfirmation) {
        generalLogger.info('Normalizations detected, showing confirmation popup')
        setPendingSubmitEvent(e)
        setShowNormalizationConfirmation(true)
        return
      }

      // Proceed with normal submission
      generalLogger.info('Form onSubmit handler called', {
        hasHandleSubmit: !!handleSubmit,
        isSubmitting,
        hasNormalization: hasAnyNormalization,
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
    [hasAnyNormalization, showNormalizationConfirmation, handleSubmit, isSubmitting, clearAllErrors]
  )

  // Handle confirmation of normalization
  const handleConfirmNormalization = useCallback(async () => {
    if (pendingSubmitEvent) {
      setShowNormalizationConfirmation(false)
      await handleFormSubmit(pendingSubmitEvent)
      setPendingSubmitEvent(null)
    }
  }, [pendingSubmitEvent, handleFormSubmit])

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

      {/* Normalization Confirmation Popup */}
      <RecalculateConfirmationPopup
        isOpen={showNormalizationConfirmation}
        currentVersion={currentVersionNumber}
        onConfirm={handleConfirmNormalization}
        onCancel={() => {
          setShowNormalizationConfirmation(false)
          setPendingSubmitEvent(null)
        }}
        isCreating={isSubmitting}
      />
    </>
  )
}
