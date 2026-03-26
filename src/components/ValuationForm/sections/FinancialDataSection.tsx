/**
 * FinancialDataSection Component
 *
 * Single Responsibility: Render Financial Data form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/FinancialDataSection
 */

import { useTranslations } from 'next-intl'
import React, { useMemo } from 'react'
import {
  getIndustryGuidance,
  validateEbitdaMargin,
  validateRevenue,
} from '../../../config/industryGuidance'
import {
  AuroraFormGrid,
  AuroraFormSection,
  AuroraNumberInput,
} from '../../../design-system/components'
import { useEbitdaNormalizationStore } from '../../../store/useEbitdaNormalizationStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationFormData } from '../../../types/valuation'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { getNormalizationAmountForBase } from '../../../utils/normalizationMath'
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
  const t = useTranslations('forms.fields')
  const lastFullYear = getCurrentFilingYear()
  const reportId = useSessionStore((state) => state.session?.reportId)
  const sessionId = reportId // Use reportId as sessionId
  const unifiedItems = useNormalizationStore((state) => state.items)
  const setUnifiedItems = useNormalizationStore((state) => state.setItems)
  const persistUnifiedToSession = useNormalizationStore((state) => state.persistToSession)
  const persistUnifiedToTitan = useNormalizationStore((state) => state.persistToTitan)

  const {
    hasNormalization: hasLegacyNormalization,
    getNormalizedEbitda: getLegacyNormalizedEbitda,
    getTotalAdjustments: getLegacyTotalAdjustments,
    getAdjustmentCount: getLegacyAdjustmentCount,
    getLastUpdated,
    openNormalizationModal,
    removeNormalization,
    activeYear,
    closeNormalizationModal,
  } = useEbitdaNormalizationStore()

  const unifiedAcceptedForYear = useMemo(
    () =>
      unifiedItems.filter((item) => {
        if (item.status !== 'accepted') return false
        if (item.applyAllYears) return true
        if (item.applyYears && item.applyYears.length > 0) return item.applyYears.includes(lastFullYear)
        return item.year === lastFullYear
      }),
    [unifiedItems, lastFullYear]
  )

  const availableYears = useMemo(
    () =>
      Array.from(
        new Set([
          lastFullYear,
          ...(formData.historical_years_data
            ?.map((year) => Number(year.year))
            .filter((year) => Number.isFinite(year)) ?? []),
        ])
      ).sort((a, b) => a - b),
    [formData.historical_years_data, lastFullYear]
  )

  const reportedEbitdaByYear = useMemo(() => {
    const byYear: Record<number, number> = {
      [lastFullYear]:
        Number(
          (formData.current_year_data as any)?.ebitda_normalization_metadata?.reported_ebitda ??
            formData.ebitda ??
            0
        ) || 0,
    }
    formData.historical_years_data?.forEach((year) => {
      if (year?.year != null && year?.ebitda != null) {
        byYear[Number(year.year)] =
          Number((year as any)?.ebitda_normalization_metadata?.reported_ebitda ?? year.ebitda ?? 0) || 0
      }
    })
    return byYear
  }, [formData.current_year_data, formData.ebitda, formData.historical_years_data, lastFullYear])

  const hasUnifiedNormalization = unifiedAcceptedForYear.length > 0
  const unifiedTotalAdjustments = unifiedAcceptedForYear.reduce(
    (sum, item) =>
      sum + getNormalizationAmountForBase(item, Number(formData.ebitda ?? 0) || 0),
    0
  )
  const legacyHasNormalization = hasLegacyNormalization(lastFullYear)
  const hasDisplayedNormalization = hasUnifiedNormalization || legacyHasNormalization
  const displayedTotalAdjustments = hasUnifiedNormalization
    ? unifiedTotalAdjustments
    : getLegacyTotalAdjustments(lastFullYear)
  const displayedNormalizedEbitda = hasUnifiedNormalization
    ? (formData.ebitda ?? 0) + unifiedTotalAdjustments
    : getLegacyNormalizedEbitda(lastFullYear)
  const displayedAdjustmentCount = hasUnifiedNormalization
    ? unifiedAcceptedForYear.length
    : getLegacyAdjustmentCount(lastFullYear)

  const handleOpenNormalization = async (year: number) => {
    if (!sessionId) return
    const ebitdaValue = year === lastFullYear ? formData.ebitda : 0
    if (ebitdaValue === undefined) return
    await openNormalizationModal(year, ebitdaValue, sessionId)
  }

  const handleRemoveNormalization = async (year: number) => {
    if (!sessionId) return
    try {
      if (hasUnifiedNormalization) {
        const touchedYears = new Set<number>([year])
        const nextItems = unifiedItems.map((item) => {
          const appliesToYear =
            item.status === 'accepted' &&
            (item.applyAllYears || item.applyYears?.includes(year) || item.year === year)

          if (!appliesToYear) return item

          if (item.applyAllYears) {
            const remainingYears = availableYears.filter((candidateYear) => candidateYear !== year)
            if (remainingYears.length === 0) {
              return { ...item, status: 'rejected' as const, applyAllYears: false, applyYears: [] }
            }
            availableYears.forEach((candidateYear) => touchedYears.add(candidateYear))
            return {
              ...item,
              applyAllYears: false,
              applyYears: remainingYears,
              year: remainingYears.includes(item.year) ? item.year : remainingYears[0],
            }
          }

          if (item.applyYears && item.applyYears.length > 0) {
            const remainingYears = item.applyYears.filter((candidateYear) => candidateYear !== year)
            item.applyYears.forEach((candidateYear) => touchedYears.add(candidateYear))
            if (remainingYears.length === 0) {
              return { ...item, status: 'rejected' as const, applyYears: [] }
            }
            return {
              ...item,
              applyYears: remainingYears,
              year: remainingYears.includes(item.year) ? item.year : remainingYears[0],
            }
          }

          return item.year === year ? { ...item, status: 'rejected' as const } : item
        })

        setUnifiedItems(nextItems)
        useEbitdaNormalizationStore.setState((state) => {
          const remainingLegacy = { ...state.normalizations }
          touchedYears.forEach((touchedYear) => {
            delete remainingLegacy[touchedYear]
          })
          return { normalizations: remainingLegacy }
        })
        await persistUnifiedToSession(sessionId)
        await Promise.all(
          availableYears.map((persistYear) =>
            persistUnifiedToTitan(sessionId, persistYear, reportedEbitdaByYear[persistYear] ?? 0)
          )
        )
        return
      }
      await removeNormalization(sessionId, year)
    } catch {
      // Removal error handled by the store
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
              formData.number_of_employees && formData.number_of_employees > 0 && formData.revenue
                ? `Revenue per employee: €${Math.round(
                    formData.revenue / formData.number_of_employees
                  ).toLocaleString()}`
                : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <AuroraNumberInput
                label={t('revenueRequired')}
                placeholder={t('revenueExamplePlaceholder')}
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
                {hasDisplayedNormalization &&
                sessionId &&
                formData.ebitda !== undefined &&
                formData.ebitda !== null ? (
                  <NormalizedEBITDAField
                    label={t('ebitdaRequired')}
                    originalValue={formData.ebitda}
                    normalizedValue={displayedNormalizedEbitda}
                    totalAdjustments={displayedTotalAdjustments}
                    adjustmentCount={displayedAdjustmentCount}
                    lastUpdated={getLastUpdated(lastFullYear)}
                    onEdit={() => handleOpenNormalization(lastFullYear)}
                    onRemove={() => handleRemoveNormalization(lastFullYear)}
                    helpText={helpText}
                  />
                ) : (
                  <>
                    <AuroraNumberInput
                      label={t('ebitdaRequired')}
                      placeholder={t('ebitdaExamplePlaceholder')}
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
                          {t('normalizeEbitdaFor', { year: lastFullYear })}
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
