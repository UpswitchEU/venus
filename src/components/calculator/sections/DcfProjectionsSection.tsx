'use client'

import { TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { AdaptivePercentInput } from './AdaptivePercentInput'

interface DcfProjectionsSectionProps {
  dcfRevenueGrowthPct?: number
  dcfEbitdaMarginPct?: number
  dcfCapexPct?: number
  dcfWaccPct?: number
  dcfTerminalGrowthPct?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function DcfProjectionsSection({
  dcfRevenueGrowthPct,
  dcfEbitdaMarginPct,
  dcfCapexPct,
  dcfWaccPct,
  dcfTerminalGrowthPct,
  onFieldChange,
  disabled,
}: DcfProjectionsSectionProps) {
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
          <TrendingUp className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.dcfProjections')}
        </h3>
        <span className="text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full">
          {t('recommendedForMethod', { method: 'DCF' })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AdaptivePercentInput
          label={t('fields.dcfRevenueGrowthPct')}
          value={dcfRevenueGrowthPct}
          onChange={(v) => onFieldChange('dcf_revenue_growth_pct', v)}
          placeholder="5"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfEbitdaMarginPct')}
          value={dcfEbitdaMarginPct}
          onChange={(v) => onFieldChange('dcf_ebitda_margin_pct', v)}
          placeholder="15"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfCapexPct')}
          value={dcfCapexPct}
          onChange={(v) => onFieldChange('dcf_capex_pct', v)}
          placeholder="3"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfWaccPct')}
          value={dcfWaccPct}
          onChange={(v) => onFieldChange('dcf_wacc_pct', v)}
          placeholder="10"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfTerminalGrowthPct')}
          value={dcfTerminalGrowthPct}
          onChange={(v) => onFieldChange('dcf_terminal_growth_pct', v)}
          placeholder="2"
          disabled={disabled}
        />
      </div>
    </motion.section>
  )
}
