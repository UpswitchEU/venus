'use client'

import { Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { PREVIEW_DECIMALS, useManualPreviewFormatters } from '@/lib/omniPreview'
import {
  computeSdePreviewMetrics,
  isSdeOwnerCompensationSectionComplete,
} from '@/lib/sde'
import { CurrencyInput } from '../CurrencyInput'
import {
  formatPreviewMetricValue,
  PreviewMetricCard,
  roundPreviewMetric,
} from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface SdeOwnerCompensationSectionProps {
  step: number
  ownerSalaryAddback?: number
  /** Latest complete historical year (revenue + EBITDA); drives omni-aligned preview. */
  revenue?: number
  ebitda?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function SdeOwnerCompensationSection({
  step,
  ownerSalaryAddback,
  revenue,
  ebitda,
  onFieldChange,
  disabled,
}: SdeOwnerCompensationSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { sdeMultiple: metricFormatter, currency: currencyFormatter } = useManualPreviewFormatters()

  const preview = useMemo(
    () =>
      computeSdePreviewMetrics({
        revenue,
        ebitda,
        ownerSalaryAddback,
      }),
    [revenue, ebitda, ownerSalaryAddback]
  )

  const sectionComplete = useMemo(
    () => isSdeOwnerCompensationSectionComplete(ownerSalaryAddback, preview),
    [ownerSalaryAddback, preview]
  )

  const addbackSourceHint =
    preview.addbackSource === 'input'
      ? t('fields.sdePreviewAddbackSourceInput')
      : preview.addbackSource === 'estimate'
        ? t('fields.sdePreviewAddbackSourceEstimate')
        : undefined

  const unavailableMessage =
    preview.unavailableReason === 'revenue_cap'
      ? t('fields.sdePreviewUnavailableCap')
      : preview.unavailableReason === 'non_positive_ebitda'
        ? t('fields.sdePreviewUnavailableEbitda')
        : preview.unavailableReason === 'missing_financials'
          ? t('fields.sdePreviewNeedFinancials')
          : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={t('sections.sdeOwnerCompensation')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('recommendedForMethod', { method: 'SDE' })}
          </span>
        }
      />

      <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-3.5 py-3 text-[12px] leading-relaxed text-foreground/50 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-primary/50 mt-0.5 shrink-0" />
        <span>{t('sdeExplainer')}</span>
      </div>

      <CurrencyInput
        label={t('fields.ownerSalaryAddback')}
        value={ownerSalaryAddback}
        onChange={(v) => onFieldChange('owner_salary_addback', v)}
        size="sm"
        placeholder="45 000"
        disabled={disabled}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            {t('sections.sdeDerivedMetrics')}
          </h4>
          <span className="text-[10px] text-foreground/45">{t('fields.sdePreviewAutoCalculated')}</span>
        </div>
        {unavailableMessage && !preview.available ? (
          <p className="text-[11px] leading-snug text-foreground/50">{unavailableMessage}</p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <PreviewMetricCard
            label={t('fields.sdePreviewBenchmarkSalary')}
            value={
              preview.ownerSalaryEstimate != null
                ? currencyFormatter.format(
                    roundPreviewMetric(preview.ownerSalaryEstimate, PREVIEW_DECIMALS.sdeMultiple)
                  )
                : '—'
            }
          />
          <PreviewMetricCard
            label={t('fields.sdePreviewAddbackUsed')}
            value={
              preview.actualAddback != null
                ? currencyFormatter.format(
                    roundPreviewMetric(preview.actualAddback, PREVIEW_DECIMALS.sdeMultiple)
                  )
                : '—'
            }
            hint={addbackSourceHint}
          />
          <PreviewMetricCard
            label={t('fields.sdePreviewAdjustedSde')}
            value={
              preview.sde != null
                ? currencyFormatter.format(
                    roundPreviewMetric(preview.sde, PREVIEW_DECIMALS.sdeMultiple)
                  )
                : '—'
            }
          />
          <PreviewMetricCard
            label={t('fields.sdePreviewSdeMultiple')}
            value={formatPreviewMetricValue(
              preview.adjustedSdeMultiple,
              metricFormatter,
              PREVIEW_DECIMALS.sdeMultiple,
              'x'
            )}
          />
          <PreviewMetricCard
            label={t('fields.sdePreviewImpliedEv')}
            value={
              preview.impliedEnterpriseValue != null
                ? currencyFormatter.format(
                    roundPreviewMetric(
                      preview.impliedEnterpriseValue,
                      PREVIEW_DECIMALS.sdeMultiple
                    )
                  )
                : '—'
            }
          />
        </div>
        <p className="text-[10px] leading-snug text-foreground/40">{t('fields.sdePreviewFootnote')}</p>
      </div>
    </motion.section>
  )
}
