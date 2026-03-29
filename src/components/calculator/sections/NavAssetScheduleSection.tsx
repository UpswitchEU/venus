'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { computeNavAdjustmentsSum, useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import { PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface NavAssetScheduleSectionProps {
  step: number
  navRealEstateAdjustment?: number
  navInventoryAdjustment?: number
  navHiddenReserves?: number
  navGoodwillWriteoff?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function NavAssetScheduleSection({
  step,
  navRealEstateAdjustment,
  navInventoryAdjustment,
  navHiddenReserves,
  navGoodwillWriteoff,
  onFieldChange,
  disabled,
}: NavAssetScheduleSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { currency: currencyFormatter } = useManualPreviewFormatters()

  const sectionComplete = useMemo(
    () =>
      [
        navRealEstateAdjustment,
        navInventoryAdjustment,
        navHiddenReserves,
        navGoodwillWriteoff,
      ].some((v) => v != null && Number.isFinite(v)),
    [navRealEstateAdjustment, navInventoryAdjustment, navHiddenReserves, navGoodwillWriteoff]
  )

  const adjustmentSum = useMemo(
    () =>
      computeNavAdjustmentsSum({
        navRealEstateAdjustment,
        navInventoryAdjustment,
        navHiddenReserves,
        navGoodwillWriteoff,
      }),
    [
      navRealEstateAdjustment,
      navInventoryAdjustment,
      navHiddenReserves,
      navGoodwillWriteoff,
    ]
  )

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
        title={t('sections.navAssetSchedule')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('recommendedForMethod', { method: 'NAV' })}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CurrencyInput
          label={t('fields.navRealEstateAdjustment')}
          value={navRealEstateAdjustment}
          onChange={(v) => onFieldChange('nav_real_estate_adjustment', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.navInventoryAdjustment')}
          value={navInventoryAdjustment}
          onChange={(v) => onFieldChange('nav_inventory_adjustment', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.navHiddenReserves')}
          value={navHiddenReserves}
          onChange={(v) => onFieldChange('nav_hidden_reserves', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.navGoodwillWriteoff')}
          value={navGoodwillWriteoff}
          onChange={(v) => onFieldChange('nav_goodwill_writeoff', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            {t('sections.navDerivedMetrics')}
          </h4>
          <span className="text-[10px] text-foreground/45">{t('fields.navPreviewFootnote')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PreviewMetricCard
            label={t('fields.navAdjustmentsSum')}
            value={currencyFormatter.format(adjustmentSum)}
          />
        </div>
      </div>
    </motion.section>
  )
}
