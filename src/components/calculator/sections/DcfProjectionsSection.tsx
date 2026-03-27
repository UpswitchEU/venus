'use client'

import { TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { WaccBreakdownPanel } from './WaccBreakdownPanel'

interface DcfProjectionsSectionProps {
  dcfRevenueGrowthPct?: number
  dcfEbitdaMarginPct?: number
  dcfCapexPct?: number
  dcfNwcPct?: number
  dcfWaccPct?: number
  dcfTerminalGrowthPct?: number
  dcfExitMultiple?: number
  dcfRiskFreeRatePct?: number
  dcfEquityRiskPremiumPct?: number
  dcfBeta?: number
  dcfCostOfDebtPct?: number
  dcfDebtEquityPct?: number
  dcfTaxShieldPct?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function DcfProjectionsSection({
  dcfRevenueGrowthPct,
  dcfEbitdaMarginPct,
  dcfCapexPct,
  dcfNwcPct,
  dcfWaccPct,
  dcfTerminalGrowthPct,
  dcfExitMultiple,
  dcfRiskFreeRatePct,
  dcfEquityRiskPremiumPct,
  dcfBeta,
  dcfCostOfDebtPct,
  dcfDebtEquityPct,
  dcfTaxShieldPct,
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
          label={t('fields.dcfNwcPct')}
          value={dcfNwcPct}
          onChange={(v) => onFieldChange('dcf_nwc_pct', v)}
          placeholder="2"
          disabled={disabled}
        />
        <WaccBreakdownPanel
          currentWaccPct={dcfWaccPct}
          riskFreeRatePct={dcfRiskFreeRatePct}
          equityRiskPremiumPct={dcfEquityRiskPremiumPct}
          beta={dcfBeta}
          costOfDebtPct={dcfCostOfDebtPct}
          debtEquityPct={dcfDebtEquityPct}
          taxShieldPct={dcfTaxShieldPct}
          onFieldChange={onFieldChange}
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfTerminalGrowthPct')}
          value={dcfTerminalGrowthPct}
          onChange={(v) => onFieldChange('dcf_terminal_growth_pct', v)}
          placeholder="2"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.dcfExitMultiple')}
          value={dcfExitMultiple}
          onChange={(v) => onFieldChange('dcf_exit_multiple', v)}
          placeholder="6.0"
          disabled={disabled}
          step="0.1"
        />
      </div>
    </motion.section>
  )
}
