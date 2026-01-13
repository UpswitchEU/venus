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
import { useEbitdaNormalizationStore } from '../../../store/useEbitdaNormalizationStore'
import type { ValuationFormData } from '../../../types/valuation'

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
  const currentYear = Math.min(new Date().getFullYear(), 2100)
  const { hasNormalization } = useEbitdaNormalizationStore()

  // Check if any normalizations exist
  const hasAnyNormalization =
    hasNormalization(currentYear) ||
    hasNormalization(currentYear - 1) ||
    hasNormalization(currentYear - 2)

  const isFormValid =
    formData.revenue && formData.ebitda && formData.industry && formData.country_code

  // Identify missing required fields for better UX
  const missingFields: string[] = []
  if (!formData.revenue) missingFields.push(t('forms.fields.revenue'))
  if (!formData.ebitda) missingFields.push(t('forms.fields.ebitda'))
  if (!formData.industry) missingFields.push(t('forms.fields.businessType'))
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

  // Debug: Log form validation state
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[FormSubmitSection] Form validation state:', {
        isFormValid,
        isSubmitting,
        hasRevenue: !!formData.revenue,
        hasEbitda: !!formData.ebitda,
        hasIndustry: !!formData.industry,
        hasCountryCode: !!formData.country_code,
        revenue: formData.revenue,
        ebitda: formData.ebitda,
        industry: formData.industry,
        country_code: formData.country_code,
        missingFields,
      })
    }
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
      <div className="pt-6 border-t border-zinc-700">
        <button
          type="submit"
          disabled={isSubmitting || !isFormValid}
          onClick={() => {
            // Debug logging (development only)
            if (process.env.NODE_ENV !== 'production') {
              console.log('[FormSubmitSection] Button clicked', {
                isSubmitting,
                isFormValid,
                formData: {
                  revenue: formData.revenue,
                  ebitda: formData.ebitda,
                  industry: formData.industry,
                  country_code: formData.country_code,
                },
              })
            }
            // Don't preventDefault - let form handle submission
          }}
          className={`
            w-full justify-center px-8 py-4 rounded-xl font-semibold text-lg shadow-lg
            transition-all duration-200 transform hover:-translate-y-0.5
            flex items-center gap-3
            ${
              isSubmitting || !isFormValid
                ? 'bg-zinc-800/30 text-zinc-500 border border-zinc-700 cursor-not-allowed'
                : 'text-white bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 hover:shadow-primary-500/20'
            }
          `}
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{t('common.states.calculating')}</span>
            </>
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
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-600/10 border-l-4 border-red-600/30 rounded-r-lg backdrop-blur-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-200">{t('common.states.error')}</h3>
              <p className="mt-1 text-sm text-red-200">{error}</p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={clearError}
                  className="text-sm font-medium text-red-300 hover:text-red-200 underline"
                >
                  {t('common.actions.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
