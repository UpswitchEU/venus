/**
 * FormSubmitSection Component
 *
 * Single Responsibility: Render form submit button and error display
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/FormSubmitSection
 */

import { useTranslations } from 'next-intl'
import React, { useEffect } from 'react'
import { AuroraButton, AuroraFormAlert } from '../../../design-system/components'
import { useCanSave } from '../../../hooks/useCanSave'
import { useEbitdaNormalizationStore } from '../../../store/useEbitdaNormalizationStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import type { ValuationFormData } from '../../../types/valuation'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'

interface FormSubmitSectionProps {
  isSubmitting: boolean
  error: string | null
  clearError: () => void
  formData: ValuationFormData
  /** Whether form is in regeneration mode (shows "Regenerate" instead of "Calculate") */
  isRegenerationMode?: boolean
}

/**
 * FormSubmitSection Component
 *
 * Renders submit button and error display
 */
export const FormSubmitSection: React.FC<FormSubmitSectionProps> = ({
  isSubmitting,
  error,
  clearError,
  formData,
  isRegenerationMode = false,
}) => {
  const t = useTranslations()
  const lastFullYear = getCurrentFilingYear()
  const normalizationItems = useNormalizationStore((state) => state.items)
  const hasLegacyNormalization = useEbitdaNormalizationStore((state) => state.hasNormalization)
  const { canSave, reason: canSaveReason } = useCanSave()

  const hasAnyNormalization =
    normalizationItems.some((item) => {
      if (item.status !== 'accepted') return false
      const years = item.applyAllYears
        ? [lastFullYear, lastFullYear - 1, lastFullYear - 2]
        : item.applyYears && item.applyYears.length > 0
          ? item.applyYears
          : [item.year]
      return years.some((year) => year >= lastFullYear - 2 && year <= lastFullYear)
    }) || [lastFullYear, lastFullYear - 1, lastFullYear - 2].some((year) => hasLegacyNormalization(year))

  // Use explicit null/undefined checks for numeric fields so that zero values
  // (pre-revenue startups, break-even businesses) do not disable the button.
  const isFormValid =
    formData.revenue != null &&
    formData.ebitda != null &&
    formData.industry &&
    formData.country_code &&
    formData.business_type_id

  // Use consistent null/undefined checks so zero-revenue/zero-EBITDA startups are
  // not listed as missing. These must match the isFormValid checks above.
  const missingFields: string[] = []
  if (formData.revenue == null) missingFields.push(t('forms.fields.revenue'))
  if (formData.ebitda == null) missingFields.push(t('forms.fields.ebitda'))
  if (!formData.business_type_id) missingFields.push(t('forms.fields.businessType'))
  if (!formData.industry) missingFields.push(t('forms.fields.industry'))
  if (!formData.country_code) missingFields.push(t('forms.fields.country'))

  // Determine button text based on context
  const getButtonText = () => {
    if (hasAnyNormalization) {
      return t('forms.actions.calculateWithNormalization')
    }
    if (isRegenerationMode) {
      return t('forms.actions.regenerate')
    }
    return t('forms.actions.calculate')
  }

  // Debug: Log form validation state (generalLogger.debug suppressed in production)
  useEffect(() => {
    generalLogger.debug('[FormSubmitSection] Form validation state', {
      isFormValid,
      isSubmitting,
      hasRevenue: formData.revenue != null,
      hasEbitda: formData.ebitda != null,
      hasIndustry: !!formData.industry,
      hasCountryCode: !!formData.country_code,
      revenue: formData.revenue,
      ebitda: formData.ebitda,
      industry: formData.industry,
      country_code: formData.country_code,
      missingFields,
    })
  }, [
    isFormValid,
    isSubmitting,
    formData.revenue,
    formData.ebitda,
    formData.industry,
    formData.country_code,
    missingFields,
  ])

  return (
    <>
      {/* Submit Button */}
      <div className="pt-6 border-t border-foreground/[0.06]">
        <AuroraButton
          type="submit"
          disabled={isSubmitting || !isFormValid || !canSave}
          loading={isSubmitting}
          fullWidth
          size="lg"
          title={
            !canSave
              ? canSaveReason
              : !isFormValid && missingFields.length > 0
                ? `Please fill in: ${missingFields.join(', ')}`
                : undefined
          }
          onClick={() => {
            generalLogger.debug('[FormSubmitSection] Button clicked', {
              isSubmitting,
              isFormValid,
              formData: {
                revenue: formData.revenue,
                ebitda: formData.ebitda,
                industry: formData.industry,
                country_code: formData.country_code,
              },
            })
            // Don't preventDefault - let form handle submission
          }}
        >
          {isSubmitting ? (
            <span>{t('common.states.calculating')}</span>
          ) : (
            <>
              <span>{getButtonText()}</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </>
          )}
        </AuroraButton>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4">
          <AuroraFormAlert type="error" title={t('common.states.error')}>
            <p className="text-sm">{error}</p>
            <button
              type="button"
              onClick={clearError}
              className="mt-2 text-sm font-medium underline hover:no-underline"
            >
              {t('common.actions.close')}
            </button>
          </AuroraFormAlert>
        </div>
      )}
    </>
  )
}
