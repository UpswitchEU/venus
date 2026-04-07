'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

const SAAS_BUSINESS_TYPE_IDS = new Set([
  'software',
  'saas',
  'software_development',
  'it_services',
  'cloud_computing',
])

const TECH_CATEGORIES = new Set([
  'technology',
  'saas_software',
  'tech',
])

const EMPTY_METHODS: string[] = []

interface RevenueQualitySectionProps {
  step: number
  revContractBacklog?: number
  revRecurringAmount?: number
  revTopClientAmount?: number
  revGrossChurnPct?: number
  revCapitalizedRdAmount?: number
  effectiveMethods?: string[]
  businessTypeId?: string
  businessCategory?: string
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

function isEbitdaOnlyContext(methods: string[]): boolean {
  if (methods.length === 0) return false
  const multiples = methods.filter((m) => m !== 'upswitch_adaptive')
  return multiples.length > 0 && multiples.every((m) => m === 'ebitda_multiple')
}

function isSaasOrTech(businessTypeId?: string, businessCategory?: string): boolean {
  if (businessTypeId && SAAS_BUSINESS_TYPE_IDS.has(businessTypeId.toLowerCase())) return true
  if (businessCategory && TECH_CATEGORIES.has(businessCategory.toLowerCase())) return true
  return false
}

export function RevenueQualitySection({
  step,
  revContractBacklog,
  revRecurringAmount,
  revTopClientAmount,
  revGrossChurnPct,
  revCapitalizedRdAmount,
  effectiveMethods = EMPTY_METHODS,
  businessTypeId,
  businessCategory,
  onFieldChange,
  disabled,
}: RevenueQualitySectionProps) {
  const t = useTranslations('manualInput.methodSelector')

  const isTechSaas = useMemo(
    () => isSaasOrTech(businessTypeId, businessCategory),
    [businessTypeId, businessCategory]
  )

  const isEbitdaOnly = useMemo(
    () => isEbitdaOnlyContext(effectiveMethods),
    [effectiveMethods]
  )

  const sectionComplete = useMemo(
    () =>
      revRecurringAmount != null ||
      revTopClientAmount != null ||
      (revContractBacklog != null && Number.isFinite(revContractBacklog)) ||
      revGrossChurnPct != null ||
      (revCapitalizedRdAmount != null && Number.isFinite(revCapitalizedRdAmount)),
    [revRecurringAmount, revTopClientAmount, revContractBacklog, revGrossChurnPct, revCapitalizedRdAmount]
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
      aria-label={isEbitdaOnly ? t('sections.ebitdaQuality') : t('sections.revenueQuality')}
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={isEbitdaOnly ? t('sections.ebitdaQuality') : t('sections.revenueQuality')}
      />

      <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
        {isEbitdaOnly ? t('fields.ebitdaQualityLead') : t('fields.revenueQualityLead')}
      </p>

      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CurrencyInput
            label={t('fields.revRecurringCurrency')}
            value={revRecurringAmount}
            onChange={(v) => onFieldChange('rev_recurring_amount', v)}
            placeholder="400.000"
            disabled={disabled}
            description={t('fields.revRecurringCurrencyDescription')}
          />

          <CurrencyInput
            label={isEbitdaOnly ? t('fields.revTopClientCurrencyEbitda') : t('fields.revTopClientCurrency')}
            value={revTopClientAmount}
            onChange={(v) => onFieldChange('rev_top_client_amount', v)}
            placeholder="150.000"
            disabled={disabled}
            description={
              isEbitdaOnly
                ? t('fields.revTopClientCurrencyEbitdaTooltip')
                : t('fields.revTopClientCurrencyTooltip')
            }
          />
        </div>

        {isEbitdaOnly ? (
          isTechSaas && (
            <CurrencyInput
              label={t('fields.revCapitalizedRd')}
              value={revCapitalizedRdAmount}
              onChange={(v) => onFieldChange('rev_capitalized_rd_amount', v)}
              size="sm"
              placeholder="50.000"
              disabled={disabled}
              description={t('fields.revCapitalizedRdDescription')}
            />
          )
        ) : isTechSaas ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AdaptivePercentInput
              label={t('fields.revGrossChurnPct')}
              value={revGrossChurnPct}
              onChange={(v) => onFieldChange('rev_gross_churn_pct', v)}
              placeholder="8"
              disabled={disabled}
              description={t('fields.revGrossChurnTooltip')}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CurrencyInput
              label={t('fields.revContractBacklog')}
              value={revContractBacklog}
              onChange={(v) => onFieldChange('rev_contract_backlog', v)}
              size="sm"
              placeholder="250.000"
              disabled={disabled}
              description={t('fields.revContractBacklogDescription')}
            />
          </div>
        )}
      </div>
    </motion.section>
  )
}
