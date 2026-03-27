'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface RevenueQualitySectionProps {
  revRecurringPct?: number
  revTopClientConcentrationPct?: number
  revContractBacklog?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function RevenueQualitySection({
  revRecurringPct,
  revTopClientConcentrationPct,
  revContractBacklog,
  onFieldChange,
  disabled,
}: RevenueQualitySectionProps) {
  const t = useTranslations('manualInput.methodSelector')

  const sectionComplete = useMemo(
    () =>
      revRecurringPct != null ||
      revTopClientConcentrationPct != null ||
      (revContractBacklog != null && Number.isFinite(revContractBacklog)),
    [revRecurringPct, revTopClientConcentrationPct, revContractBacklog]
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4 pt-2"
    >
      <ValuationSectionHeader
        complete={sectionComplete}
        title={t('sections.revenueQuality')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('recommendedForMethod', { method: 'EV/EBITDA' })}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AdaptivePercentInput
          label={t('fields.revRecurringPct')}
          value={revRecurringPct}
          onChange={(v) => onFieldChange('rev_recurring_pct', v)}
          placeholder="60"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.revTopClientConcentrationPct')}
          value={revTopClientConcentrationPct}
          onChange={(v) => onFieldChange('rev_top_client_concentration_pct', v)}
          placeholder="15"
          disabled={disabled}
        />
        <div className="col-span-2">
          <CurrencyInput
            label={t('fields.revContractBacklog')}
            value={revContractBacklog}
            onChange={(v) => onFieldChange('rev_contract_backlog', v)}
            size="sm"
            placeholder="250.000"
            disabled={disabled}
          />
        </div>
      </div>
    </motion.section>
  )
}
