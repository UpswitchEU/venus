'use client'

import { Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'

interface SaasMetricsSectionProps {
  saasArr?: number
  saasMrr?: number
  saasChurnPct?: number
  saasNrrPct?: number
  saasCac?: number
  saasCustomerConcentrationPct?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function SaasMetricsSection({
  saasArr,
  saasMrr,
  saasChurnPct,
  saasNrrPct,
  saasCac,
  saasCustomerConcentrationPct,
  onFieldChange,
  disabled,
}: SaasMetricsSectionProps) {
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
          <Zap className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.saasMetrics')}
        </h3>
        <span className="text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full">
          {t('shownForBusinessType', {
            businessType: t('businessTypes.saasSoftware'),
          })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CurrencyInput
          label={t('fields.saasArr')}
          value={saasArr}
          onChange={(v) => onFieldChange('saas_arr', v)}
          size="sm"
          placeholder="500.000"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.saasMrr')}
          value={saasMrr}
          onChange={(v) => onFieldChange('saas_mrr', v)}
          size="sm"
          placeholder="42.000"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasChurnPct')}
          value={saasChurnPct}
          onChange={(v) => onFieldChange('saas_churn_pct', v)}
          placeholder="5"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasNrrPct')}
          value={saasNrrPct}
          onChange={(v) => onFieldChange('saas_nrr_pct', v)}
          placeholder="110"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.saasCac')}
          value={saasCac}
          onChange={(v) => onFieldChange('saas_cac', v)}
          size="sm"
          placeholder="1.500"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasCustomerConcentrationPct')}
          value={saasCustomerConcentrationPct}
          onChange={(v) => onFieldChange('saas_customer_concentration_pct', v)}
          placeholder="20"
          disabled={disabled}
        />
      </div>
    </motion.section>
  )
}
