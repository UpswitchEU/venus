'use client'

import { BarChart3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'

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

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4 pt-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.revenueQuality')}
        </h3>
        <span className="text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full">
          {t('recommendedForMethod', { method: 'EV/EBITDA' })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
