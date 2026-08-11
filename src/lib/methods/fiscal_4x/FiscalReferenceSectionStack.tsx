'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { FiscalInputsSection } from '@/components/calculator/sections/FiscalInputsSection'
import { FiscalReferencePreviewCard } from '@/components/calculator/sections/FiscalReferencePreviewCard'
import {
  computeFiscal4xPreview,
  type Fiscal4xUnavailableReason,
  type FiscalPreviewEbitdaSource,
  resolveBookEquityFromYearRow,
} from '@/lib/omniPreview'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { shouldRenderFiscalInputs, shouldShowFiscalReferenceNotice } from './sectionEligibility'

export interface FiscalReferenceSectionStackProps {
  methods: readonly string[]
  bonusSections: readonly string[]
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  previewCurrencyFormatter: Intl.NumberFormat
  fiscalStep?: number
  firmCountryCode?: string
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
  fiscalWeightedNormalizedEbitda?: number
  fiscalWeightedHistoricalYearCount?: number
}

function fiscalPreviewUnavailableMessage(
  t: ReturnType<typeof useTranslations<'manualInput.methodSelector'>>,
  reason: Fiscal4xUnavailableReason | undefined
): string | null {
  switch (reason) {
    case 'non_be':
      return t('fields.fiscalPreviewUnavailableNonBe')
    case 'non_statutory_ebitda':
      return t('fields.fiscalPreviewUnavailableNonStatutoryEbitda')
    case 'non_positive_ebitda':
      return t('fields.fiscalPreviewUnavailableEbitda')
    case 'missing_ebitda':
      return t('fields.fiscalPreviewUnavailableMissingEbitda')
    case 'missing_book_equity':
      return t('fields.fiscalPreviewUnavailableMissingEquity')
    default:
      return null
  }
}

export function FiscalReferenceSectionStack({
  methods,
  bonusSections,
  formData,
  latestCompleteYearlyFinancial,
  previewCurrencyFormatter,
  fiscalStep,
  firmCountryCode,
  onFieldChange,
  disabled,
}: FiscalReferenceSectionStackProps) {
  const t = useTranslations('manualInput.methodSelector')
  const showFiscalNotice = shouldShowFiscalReferenceNotice(methods, firmCountryCode)
  const showFiscalInputs = shouldRenderFiscalInputs(bonusSections) && fiscalStep != null

  const fiscalPreview = useMemo(() => {
    const row = latestCompleteYearlyFinancial
    const reportedLatest =
      row != null && Number.isFinite(Number(row.ebitda)) ? Number(row.ebitda) : undefined

    const ebitdaSource = 'reported_latest_complete_year' satisfies FiscalPreviewEbitdaSource

    return computeFiscal4xPreview({
      countryCode: formData.country?.trim() || 'BE',
      ebitda: reportedLatest,
      ebitdaSource,
      bookEquity: resolveBookEquityFromYearRow(row ?? undefined),
      sharesForSale: formData.shares_for_sale ?? 100,
    })
  }, [
    latestCompleteYearlyFinancial,
    formData.country,
    formData.shares_for_sale,
  ])

  if (!showFiscalNotice && !showFiscalInputs) return null

  return (
    <>
      {showFiscalNotice && (
        <motion.div
          key="fiscal_4x_notice"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="space-y-3"
        >
          <FiscalReferencePreviewCard
            fiscalPreview={fiscalPreview}
            previewCurrencyFormatter={previewCurrencyFormatter}
            unavailableMessage={fiscalPreviewUnavailableMessage(t, fiscalPreview.unavailableReason)}
          />
        </motion.div>
      )}
      {showFiscalInputs && (
        <FiscalInputsSection
          step={fiscalStep}
          fiscalAcquisitionCost={formData.fiscal_acquisition_cost as number | undefined}
          fiscalAnchor2Value={formData.fiscal_anchor_2_value as number | undefined}
          fiscalAnchor3Value={formData.fiscal_anchor_3_value as number | undefined}
          fiscalAnchor4Value={formData.fiscal_anchor_4_value as number | undefined}
          onFieldChange={onFieldChange}
          disabled={disabled}
        />
      )}
    </>
  )
}
