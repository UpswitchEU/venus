/**
 * BasicInformationSection Component
 *
 * Single Responsibility: Render Basic Information form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/BasicInformationSection
 */

import { useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TARGET_COUNTRIES } from '../../../config/countries'
import { showAdvisorCalculatorSurface } from '../../../constants/accountantPlanMethods'
import {
  AuroraFormAlert,
  AuroraFormGrid,
  AuroraFormSection,
  AuroraFullWidthField,
  AuroraNumberInput,
  AuroraSelect,
} from '../../../design-system/components'
import { SegmentedControl } from '../../../design-system/components/SegmentedControl'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapStatus } from '../../../hooks/useBootstrapStatus'
import { useSectorMismatchWarning } from '../../../hooks/useSectorMismatchWarning'
import type { BusinessType } from '../../../services/businessTypesApi'
import { fetchBusinessTypeById } from '../../../services/fetchBusinessTypeById'
import type { CompanySearchResult } from '../../../services/registry/types'
import { useManualResultsStore } from '../../../store/manual'
import type { BusinessTypeSegmentInput, ValuationFormData } from '../../../types/valuation'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'
import { BusinessTypeSelector } from '../../BusinessTypeSelector'
import CompanyNameInput from '../../forms/CompanyNameInput'
import {
  buildBusinessTypeFormData,
  buildBusinessTypeSegmentsFormData,
} from '../utils/businessTypeFormData'
import {
  buildInitialSelectedCompany,
  buildSelectedCompanyFormUpdates,
  getStringValue,
  removeRegistryContextFields,
  selectedCompanySyncKey,
} from './BasicInformationRegistryModel'
import { BasicInformationSegmentWeightingPanel } from './BasicInformationSegmentWeightingPanel'

interface BasicInformationSectionProps {
  formData: ValuationFormData
  updateFormData: (data: Partial<ValuationFormData>) => void
  businessTypes: BusinessType[]
  businessTypesLoading: boolean
  businessTypesError: string | null
  prefilledQuery?: string | null // Optional prefilled query from URL
}

/**
 * BasicInformationSection Component
 *
 * Renders Basic Information section with:
 * - Business Type Search
 * - Company Name
 * - Founding Year
 * - Country
 */
export const BasicInformationSection: React.FC<BasicInformationSectionProps> = ({
  formData,
  updateFormData,
  businessTypes,
  businessTypesLoading,
  businessTypesError,
}) => {
  const t = useTranslations()
  const { user } = useAuth()
  const bootstrapStatus = useBootstrapStatus()
  const roleDefaultsToExpertMode = showAdvisorCalculatorSurface(
    bootstrapStatus.isAccountantFlow,
    user?.role
  )
  const [expertModeOverride, setExpertModeOverride] = useState<boolean | null>(null)
  const expertModeEnabled = expertModeOverride ?? roleDefaultsToExpertMode
  // Track which fields were auto-filled from registry
  const [autoFilledFields, setAutoFilledFields] = useState<string[]>([])
  const registryBusinessTypeSyncRef = useRef<{
    companyKey: string
    businessTypeId: string | null
  } | null>(null)
  const selectedCompanySaveRunIdRef = useRef(0)
  const autoFilledFieldsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // LinkedIn pattern: Form owns selected company state
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null)
  const [isVerifyingCompany, setIsVerifyingCompany] = useState(false)
  const effectiveCountryCode =
    selectedCompany?.country_code ||
    formData.country_code ||
    getStringValue(formData.business_context, 'country_code') ||
    'BE'

  const sectorMismatchFromNace = useSectorMismatchWarning({
    business_type_id: formData.business_type_id,
    nace_code:
      selectedCompany?.nace_code ||
      selectedCompany?.activity_code ||
      selectedCompany?.canonical_nace_code ||
      formData.nace_code,
    activity_code: formData.activity_code,
    canonical_nace_code: formData.canonical_nace_code,
    country_code: effectiveCountryCode,
    industry: formData.industry,
  })

  const selectedBusinessTypeIds = useMemo(() => {
    const segmentIds =
      formData.business_type_segments
        ?.map((segment) => normalizeBusinessTypeId(segment.business_type_id))
        .filter((id): id is string => Boolean(id)) ?? []
    if (segmentIds.length > 0) return segmentIds
    return formData.business_type_id ? [formData.business_type_id] : []
  }, [formData.business_type_id, formData.business_type_segments])
  const visibleBusinessTypeIds = selectedBusinessTypeIds

  const selectedSegments = formData.business_type_segments ?? []

  const clearAutoFilledFieldsTimer = useCallback(() => {
    if (autoFilledFieldsTimerRef.current) {
      clearTimeout(autoFilledFieldsTimerRef.current)
      autoFilledFieldsTimerRef.current = null
    }
  }, [])

  const showAutoFilledFields = useCallback(
    (filledFields: string[]) => {
      clearAutoFilledFieldsTimer()
      setAutoFilledFields(filledFields)
      autoFilledFieldsTimerRef.current = setTimeout(() => {
        autoFilledFieldsTimerRef.current = null
        setAutoFilledFields([])
      }, 5000)
    },
    [clearAutoFilledFieldsTimer]
  )

  useEffect(() => {
    return () => {
      clearAutoFilledFieldsTimer()
    }
  }, [clearAutoFilledFieldsTimer])

  const handleBusinessTypeSelectionChange = (
    businessTypeIds: string[],
    selectedBusinessTypes: BusinessType[]
  ) => {
    generalLogger.debug('Business type selection changed', {
      businessTypeIds,
      selectionCount: selectedBusinessTypes.length,
    })

    const primaryBusinessType = selectedBusinessTypes[0]
    if (!primaryBusinessType) {
      useManualResultsStore.getState().clearResults()
      updateFormData({
        business_type_id: undefined,
        business_type_title: undefined,
        business_type_segments: [],
      })
      return
    }

    generalLogger.info('Business type selected', {
      id: primaryBusinessType.id,
      title: primaryBusinessType.title,
      industryMapping: primaryBusinessType.industryMapping,
      industry: primaryBusinessType.industry,
      segmentCount: selectedBusinessTypes.length,
      metadata: {
        dcfPreference: primaryBusinessType.dcfPreference,
        multiplesPreference: primaryBusinessType.multiplesPreference,
        ownerDependencyImpact: primaryBusinessType.ownerDependencyImpact,
      },
    })

    if (!primaryBusinessType.industry && !primaryBusinessType.industryMapping) {
      generalLogger.warn(
        'Business type missing industry classification — using services fallback',
        { id: primaryBusinessType.id }
      )
    }

    useManualResultsStore.getState().clearResults()
    const segmentPatch = buildBusinessTypeSegmentsFormData(
      selectedBusinessTypes,
      formData.business_type_segments as BusinessTypeSegmentInput[] | undefined
    )

    updateFormData({
      ...buildBusinessTypeFormData(primaryBusinessType),
      ...segmentPatch,
    })
  }

  // Construct initial selected company from stored KBO data if available
  // This allows the company summary card to show when restoring a previously verified company
  // ✅ FIX: Check both business_context AND top-level formData fields (from Mercury business card)
  const initialSelectedCompany = useMemo<CompanySearchResult | null>(
    () => buildInitialSelectedCompany(formData),
    [formData]
  )

  // Background verification when restoring saved company
  // ✅ FIX: Also set selectedCompany immediately if KBO data exists in top-level formData
  // This ensures the preview card shows immediately when data is prefilled from Mercury
  useEffect(() => {
    const controller = new AbortController()

    const verifyRestoredCompany = async () => {
      if (initialSelectedCompany && !selectedCompany) {
        // ✅ FIX: Show company immediately (smooth UX) - no dropdown flash
        generalLogger.info('[BasicInfo] Setting selectedCompany from prefilled KBO data', {
          company_name: initialSelectedCompany.company_name,
          registration_number: initialSelectedCompany.registration_number,
          source: 'prefilled',
        })
        setSelectedCompany(initialSelectedCompany)

        // Verify in background
        setIsVerifyingCompany(true)
        try {
          const { registryService } = await import('../../../services/registry/registryService')
          const response = await registryService.searchCompanies(
            initialSelectedCompany.company_name,
            effectiveCountryCode,
            1,
            controller.signal
          )

          if (controller.signal.aborted) return

          if (response.success && response.results?.[0]) {
            const freshData = response.results[0]

            // Check if data changed
            const dataChanged =
              freshData.registration_number !== initialSelectedCompany.registration_number ||
              freshData.legal_form !== initialSelectedCompany.legal_form ||
              freshData.status !== initialSelectedCompany.status ||
              freshData.address !== initialSelectedCompany.address

            if (dataChanged) {
              generalLogger.info('[BasicInfo] KBO data updated since last save', {
                company_name: freshData.company_name,
                changes: {
                  registration:
                    freshData.registration_number !== initialSelectedCompany.registration_number,
                  legal_form: freshData.legal_form !== initialSelectedCompany.legal_form,
                  status: freshData.status !== initialSelectedCompany.status,
                  address: freshData.address !== initialSelectedCompany.address,
                },
              })

              setSelectedCompany(freshData)
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return
          generalLogger.warn('[BasicInfo] Background verification failed, using cached data', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          // Keep showing cached data on error
        } finally {
          if (!controller.signal.aborted) {
            setIsVerifyingCompany(false)
          }
        }
      } else {
        setIsVerifyingCompany(false)
      }
    }

    verifyRestoredCompany()
    return () => {
      controller.abort()
      setIsVerifyingCompany(false)
    }
  }, [effectiveCountryCode, initialSelectedCompany, selectedCompany])

  // Save company data when selectedCompany changes
  useEffect(() => {
    if (!selectedCompany) return

    const runId = selectedCompanySaveRunIdRef.current + 1
    selectedCompanySaveRunIdRef.current = runId
    let cancelled = false
    const isCurrentRun = () => !cancelled && selectedCompanySaveRunIdRef.current === runId

    const saveCompanyData = async () => {
      generalLogger.info('[BasicInfo] Saving company data', {
        company_name: selectedCompany.company_name,
        registration_number: selectedCompany.registration_number,
      })

      // Get current form data snapshot to avoid stale closures
      const currentFormData = formData
      const updates = buildSelectedCompanyFormUpdates({
        selectedCompany,
        formData: currentFormData,
        effectiveCountryCode,
      })

      // Pre-populate business type from Titan enrichment (NACE/SBI). When a new
      // registry company is selected, replace an older type from the previous
      // company. After this company/type pair has been synced once, later manual
      // business-type edits win.
      const selectedBusinessTypeId = normalizeBusinessTypeId(selectedCompany.business_type_id)
      const companyKey = selectedCompanySyncKey(selectedCompany)
      const lastSynced = registryBusinessTypeSyncRef.current
      const alreadySyncedThisCompanyType =
        lastSynced?.companyKey === companyKey &&
        lastSynced.businessTypeId === selectedBusinessTypeId
      const shouldSyncRegistryBusinessType =
        !!selectedBusinessTypeId &&
        (!currentFormData.business_type_id ||
          (!alreadySyncedThisCompanyType &&
            currentFormData.business_type_id !== selectedBusinessTypeId))

      if (shouldSyncRegistryBusinessType && selectedBusinessTypeId) {
        const enriched = await fetchBusinessTypeById(selectedBusinessTypeId)
        if (!isCurrentRun()) return
        if (enriched) {
          Object.assign(updates, buildBusinessTypeFormData(enriched))
        } else {
          updates.business_type_id = selectedBusinessTypeId
        }
        registryBusinessTypeSyncRef.current = {
          companyKey,
          businessTypeId: selectedBusinessTypeId,
        }
      } else if (
        selectedBusinessTypeId &&
        currentFormData.business_type_id === selectedBusinessTypeId
      ) {
        registryBusinessTypeSyncRef.current = {
          companyKey,
          businessTypeId: selectedBusinessTypeId,
        }
      }

      // Fetch financial data if available
      if (selectedCompany.company_id && selectedCompany.company_id.length > 3) {
        try {
          const { registryService } = await import('../../../services/registry/registryService')
          if (!isCurrentRun()) return
          const financialData = await registryService.getCompanyFinancials(
            selectedCompany.company_id,
            currentFormData.country_code || selectedCompany.country_code || 'BE'
          )
          if (!isCurrentRun()) return

          // Auto-fill founding_year if available and not already set
          if (financialData.founding_year && !currentFormData.founding_year) {
            updates.founding_year = financialData.founding_year
          }

          // Auto-fill industry if available and not already set
          if (
            financialData.industry_description &&
            !currentFormData.industry &&
            !currentFormData.business_type_id
          ) {
            updates.industry = financialData.industry_description
          }

          // Auto-fill number_of_employees if available
          if (financialData.employees && !currentFormData.number_of_employees) {
            updates.number_of_employees = financialData.employees
          }

          // Track auto-filled fields
          const filledFields: string[] = []
          if (updates.founding_year) filledFields.push('Founding year')
          if (updates.industry) filledFields.push('Industry')
          if (updates.number_of_employees) filledFields.push('Employees')

          if (filledFields.length > 0) {
            showAutoFilledFields(filledFields)

            generalLogger.info('[BasicInfo] Auto-filled fields from KBO', {
              filledFields,
              company_id: selectedCompany.company_id,
            })
          }
        } catch (error) {
          if (!isCurrentRun()) return
          generalLogger.warn('[BasicInfo] Failed to fetch financial data', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      if (!isCurrentRun()) return
      updateFormData(updates)
    }

    saveCompanyData()

    return () => {
      cancelled = true
    }
  }, [selectedCompany, formData, updateFormData, effectiveCountryCode, showAutoFilledFields])

  return (
    <AuroraFormSection title={t('forms.sections.basicInformation')}>
      {sectorMismatchFromNace && (
        <AuroraFullWidthField>
          <AuroraFormAlert type="warning">
            {t('forms.warnings.sectorMismatch', {
              naceType: sectorMismatchFromNace.naceTypeTitle,
              selected:
                businessTypes.find((bt) => bt.id === formData.business_type_id)?.title ??
                sectorMismatchFromNace.selectedTitle,
            })}
          </AuroraFormAlert>
        </AuroraFullWidthField>
      )}
      <AuroraFormGrid columns={2}>
        {/* Business Type Selector - replaces Industry, Sub-Industry, and Business Model */}
        {/* MOVED TO TOP: Aligns with AI-guided flow & enables intelligent triage from question 1 */}
        <AuroraFullWidthField>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl<'default' | 'expert'>
              value={expertModeEnabled ? 'expert' : 'default'}
              onChange={(value) => setExpertModeOverride(value === 'expert')}
              options={[
                { value: 'default', label: t('manualInput.advisorExpertMode.default') },
                { value: 'expert', label: t('manualInput.advisorExpertMode.expert') },
              ]}
              size="sm"
              variant="pills"
              aria-label={t('manualInput.advisorExpertMode.ariaLabel')}
            />
          </div>
          <BusinessTypeSelector
            value={visibleBusinessTypeIds}
            onChange={() => undefined}
            onSelectionChange={handleBusinessTypeSelectionChange}
            selectionMode="multiple"
            showPreview={visibleBusinessTypeIds.length <= 1}
            className={businessTypesLoading ? 'pointer-events-none opacity-60' : ''}
          />
          {businessTypesError && (
            <p className="mt-2 text-sm text-warning">
              Using offline business types. Some options may be limited.
            </p>
          )}
        </AuroraFullWidthField>

        <BasicInformationSegmentWeightingPanel
          segments={selectedSegments}
          onChange={(segments) => updateFormData({ business_type_segments: segments })}
        />

        {/* Company Name with KBO Registry Check */}
        {/* MOVED AFTER BUSINESS TYPE: Enables context-aware KBO validation */}
        {/* LinkedIn pattern: Selection shows preview, save happens on calculate */}
        <CompanyNameInput
          label={t('forms.fields.companyName')}
          type="text"
          name="company_name"
          value={formData.company_name || ''}
          onChange={(value) => updateFormData({ company_name: value })}
          onBlur={() => undefined}
          placeholder={t('forms.fields.companyNamePlaceholder')}
          countryCode={effectiveCountryCode}
          selectedCompany={selectedCompany}
          onCompanyChange={(company) => {
            setSelectedCompany(company)
            if (company) {
              updateFormData({ company_name: company.company_name })
            }
          }}
          onClearCompany={() => {
            // Clear selected company but keep the current input value
            // This allows user to edit/change the name without losing what they typed
            setSelectedCompany(null)
            registryBusinessTypeSyncRef.current = null
            // Don't clear company_name - let user edit the existing value.
            // Do clear registry-derived identifiers so an old KBO/KVK cannot
            // leak into the next valuation payload.
            updateFormData({
              registration_number: undefined,
              kbo_number: undefined,
              kvk_number: undefined,
              legal_form: undefined,
              nace_code: undefined,
              nace_description: undefined,
              activity_code: undefined,
              canonical_nace_code: undefined,
              business_context: removeRegistryContextFields(formData.business_context),
            })
            generalLogger.info('[BasicInfo] Clearing company selection', {
              previous_company: selectedCompany?.company_name,
              keeping_input_value: formData.company_name,
            })
          }}
          isVerifying={isVerifyingCompany}
          required
        />

        {/* Registry Data Preview - Show auto-filled fields */}
        {autoFilledFields.length > 0 && (
          <AuroraFullWidthField>
            <AuroraFormAlert type="success" title={t('forms.kboLookup.autoFilledFromRegistry')}>
              {autoFilledFields.join(', ')}
            </AuroraFormAlert>
          </AuroraFullWidthField>
        )}

        {/* Founding Year */}
        <AuroraNumberInput
          label={t('forms.fields.yearBusinessCommenced')}
          placeholder={t('forms.fields.yearBusinessCommencedPlaceholder')}
          value={formData.founding_year || getCurrentFilingYear() - 5}
          onChange={(e) =>
            updateFormData({
              founding_year: parseInt(e.target.value, 10) || getCurrentFilingYear() - 5,
            })
          }
          onBlur={() => undefined}
          name="founding_year"
          min={1900}
          max={new Date().getFullYear()}
          helpText={t('forms.fields.yearBusinessCommencedHelp')}
          required
        />

        {/* Country */}
        <AuroraSelect
          label={t('forms.fields.primaryOperatingCountry')}
          placeholder={t('forms.fields.countrySelect')}
          options={TARGET_COUNTRIES.map((country) => ({
            value: country.code,
            label: `${country.flag} ${country.name} (${country.currencySymbol})`,
          }))}
          value={formData.country_code || ''}
          onChange={(value) => updateFormData({ country_code: value })}
          helpText={t('forms.fields.primaryOperatingCountryHelp')}
          required
        />
      </AuroraFormGrid>
    </AuroraFormSection>
  )
}
