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
import { useBusinessTypes } from '../../hooks/useBusinessTypes'
import { useFormSessionSync } from '../../hooks/useFormSessionSync'
import { useManagedTimeout } from '../../hooks/useManagedTimeout'
import { usePrefillRestorationCoordinator } from '../../hooks/usePrefillRestorationCoordinator'
import { useManualFormStore, useManualResultsStore } from '../../store/manual'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import type { ValuationFormData } from '../../types/valuation'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { generalLogger } from '../../utils/logger'
import {
  hasExistingValuationVersion,
  shouldOpenVersionConfirmation,
} from '../../utils/versionConfirmation'
import { RecalculateConfirmationPopup } from '../normalization/RecalculateConfirmationPopup'
import { useHistoricalInputsSync } from './hooks/useHistoricalInputsSync'
import { useValuationFormPrefillEffects } from './hooks/useValuationFormPrefillEffects'
import { useValuationFormSubmission } from './hooks/useValuationFormSubmission'
import { BasicInformationSection } from './sections/BasicInformationSection'
import { FinancialDataSection } from './sections/FinancialDataSection'
import { FormSubmitSection } from './sections/FormSubmitSection'
import { HistoricalDataSection } from './sections/HistoricalDataSection'
import { OwnershipStructureSection } from './sections/OwnershipStructureSection'
import {
  hasRecentAcceptedNormalizations,
  hasValuationFormChangesSinceVersion,
} from './ValuationFormModel'

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
  const { schedule: scheduleInitializationCompletion } = useManagedTimeout()

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
          updateFormData(version.formData as Partial<ValuationFormData>)
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

  const { historicalInputs, setHistoricalInputs } = useHistoricalInputsSync({
    formData,
    updateFormData,
    reportId,
  })
  const [employeeCountError, setEmployeeCountError] = useState<string | null>(null)

  // Use form session sync hook for syncing form changes to session
  // ROOT CAUSE FIX: Pass reportId instead of session object to prevent re-renders
  // Note: Restoration is handled centrally by SessionRestorationService via useSessionStore.loadSession()
  useFormSessionSync({
    reportId,
    formData,
  })

  usePrefillRestorationCoordinator(reportId)

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
  }, [
    formData.business_type,
    updateFormData,
    formData.number_of_employees,
    formData.number_of_owners,
  ])

  const { prefilledQuery } = useValuationFormPrefillEffects({
    formData,
    updateFormData,
    prefillFromBusinessCard,
    businessTypes,
    businessCard,
    isAuthenticated,
    reportId,
    scheduleInitializationCompletion,
  })

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
      hasRecentAcceptedNormalizations({
        normalizationItems,
        lastFullYear,
        hasLegacyNormalization,
      }),
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
  const hasFormChanges = useMemo(
    () =>
      hasValuationFormChangesSinceVersion({
        formData,
        versionFormData: currentVersion?.formData,
      }),
    [currentVersion?.formData, formData]
  )

  // Only show the version confirmation for an existing valuation when the form changed
  // or accepted normalizations would materially change the next calculation.
  const shouldShowVersionConfirmation = shouldOpenVersionConfirmation({
    currentVersion,
    hasFormChanges,
    hasAnyNormalization,
    isConfirmationOpen: versionConfirmationOpenRef.current,
  })

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
  }, [clearApiErrorFromStore])

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
