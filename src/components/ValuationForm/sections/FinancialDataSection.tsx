/**
 * FinancialDataSection Component
 *
 * Single Responsibility: Render Financial Data form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/FinancialDataSection
 */

import React from 'react'
import {
  getIndustryGuidance,
  validateEbitdaMargin,
  validateRevenue,
} from '../../../config/industryGuidance'
import { useEbitdaNormalizationStore } from '../../../store/useEbitdaNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationFormData } from '../../../types/valuation'
import { AuroraNumberInput, AuroraFormSection, AuroraFormGrid } from '../../../design-system/components'
import { NormalizationModal } from '../../normalization/NormalizationModal'
import { NormalizedEBITDAField } from '../../normalization/NormalizedEBITDAField'

interface FinancialDataSectionProps {
  formData: ValuationFormData
  updateFormData: (data: Partial<ValuationFormData>) => void
}

/**
 * FinancialDataSection Component
 *
 * Renders Financial Data section with:
 * - Revenue (with industry guidance)
 * - EBITDA (with industry guidance)
 * - EBITDA Normalization links (NEW)
 */
export const FinancialDataSection: React.FC<FinancialDataSectionProps> = ({
  formData,
  updateFormData,
}) => {
  const lastFullYear = Math.min(new Date().getFullYear() - 1, 2100)
  const reportId = useSessionStore((state) => state.session?.reportId)
  const sessionId = reportId // Use reportId as sessionId

  const {
    hasNormalization,
    getNormalizedEbitda,
    getTotalAdjustments,
    getAdjustmentCount,
    getLastUpdated,
    openNormalizationModal,
    removeNormalization,
    activeYear,
    closeNormalizationModal,
  } = useEbitdaNormalizationStore()

  const handleOpenNormalization = async (year: number) => {
    if (!sessionId) {
      console.error('No session ID available')
      return
    }
    const ebitdaValue = year === lastFullYear ? formData.ebitda : 0
    if (ebitdaValue === undefined) {
      console.warn('EBITDA value not set')
      return
    }
    await openNormalizationModal(year, ebitdaValue, sessionId)
  }

  const handleRemoveNormalization = async (year: number) => {
    if (!sessionId) return
    try {
      await removeNormalization(sessionId, year)
    } catch (error) {
      console.error('Failed to remove normalization', error)
    }
  }
  return (
    <AuroraFormSection title={`Last Full Year Financials (${lastFullYear})`}>
      <AuroraFormGrid columns={2}>
        {/* Revenue */}
        <div>
          {(() => {
            const revenueGuidance = getIndustryGuidance(formData.industry || 'other', 'revenue')
            const validation =
              formData.revenue && formData.industry
                ? validateRevenue(
                    formData.revenue,
                    formData.industry,
                    formData.subIndustry,
                    formData.number_of_employees,
                    formData.founding_year,
                    formData.country_code
                  )
                : null

            // Construct unified help text for tooltip
            const helpText = [
              revenueGuidance.tip ? `Tip: ${revenueGuidance.tip}` : '',
              revenueGuidance.why ? `Why: ${revenueGuidance.why}` : '',
              validation?.message ? `Note: ${validation.message}` : '',
              formData.number_of_employees && formData.revenue
                ? `Revenue per employee: €${Math.round(
                    formData.revenue / formData.number_of_employees
                  ).toLocaleString()}`
                : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <AuroraNumberInput
                label="Revenue (Required)"
                placeholder="e.g., 2,500,000"
                value={formData.revenue || ''}
                onChange={(e) =>
                  updateFormData({
                    revenue: parseFloat(e.target.value.replace(/,/g, '')) || undefined,
                  })
                }
                onBlur={() => {}}
                name="revenue"
                min={0}
                step={1000}
                prefix="€"
                formatAsCurrency
                required
                helpText={helpText}
              />
            )
          })()}
        </div>

        {/* EBITDA */}
        <div>
          {(() => {
            const ebitdaGuidance = getIndustryGuidance(formData.industry || 'other', 'ebitda')
            const validation =
              formData.revenue && formData.ebitda
                ? validateEbitdaMargin(
                    formData.revenue,
                    formData.ebitda,
                    formData.industry || 'other'
                  )
                : null

            const helpText = [
              ebitdaGuidance.tip ? `Tip: ${ebitdaGuidance.tip}` : '',
              ebitdaGuidance.why ? `Why: ${ebitdaGuidance.why}` : '',
              validation?.message ? `Note: ${validation.message}` : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <>
                {/* Conditional rendering: Normalized field vs Normal field */}
                {hasNormalization(lastFullYear) &&
                sessionId &&
                formData.ebitda !== undefined &&
                formData.ebitda !== null ? (
                  <NormalizedEBITDAField
                    label="EBITDA (Required)"
                    originalValue={formData.ebitda}
                    normalizedValue={getNormalizedEbitda(lastFullYear)}
                    totalAdjustments={getTotalAdjustments(lastFullYear)}
                    adjustmentCount={getAdjustmentCount(lastFullYear)}
                    lastUpdated={getLastUpdated(lastFullYear)}
                    onEdit={() => handleOpenNormalization(lastFullYear)}
                    onRemove={() => handleRemoveNormalization(lastFullYear)}
                    helpText={helpText}
                  />
                ) : (
                  <>
                    <AuroraNumberInput
                      label="EBITDA (Required)"
                      placeholder="e.g., 500,000"
                      value={
                        formData.ebitda !== undefined && formData.ebitda !== null
                          ? formData.ebitda
                          : ''
                      }
                      onChange={(e) => {
                        const cleanedValue = e.target.value.replace(/,/g, '')
                        const numValue = parseFloat(cleanedValue)
                        // Preserve negative values: only set undefined if NaN, not if value is 0 or negative
                        updateFormData({ ebitda: isNaN(numValue) ? undefined : numValue })
                      }}
                      onBlur={() => {}}
                      name="ebitda"
                      min={-1000000000} // Allow negative EBITDA
                      step={1000}
                      prefix="€"
                      formatAsCurrency
                      required
                      helpText={helpText}
                    />

                    {/* EBITDA Normalization Link */}
                    {sessionId && formData.ebitda !== undefined && formData.ebitda !== null && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleOpenNormalization(lastFullYear)}
                          className="text-sm text-river-300 hover:text-river-100 flex items-center gap-1 transition-colors"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Normalize EBITDA for {lastFullYear}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )
          })()}
        </div>
      </AuroraFormGrid>

      {/* Normalization Modal */}
      {sessionId && (
        <NormalizationModal
          isOpen={activeYear === lastFullYear}
          year={lastFullYear}
          sessionId={sessionId}
          onClose={() => {
            closeNormalizationModal()
          }}
        />
      )}
    </AuroraFormSection>
  )
}
