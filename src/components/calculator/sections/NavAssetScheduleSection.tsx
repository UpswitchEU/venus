'use client'

import { Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { CurrencyInput } from '../CurrencyInput'

interface NavAssetScheduleSectionProps {
  navRealEstateAdjustment?: number
  navInventoryAdjustment?: number
  navHiddenReserves?: number
  navGoodwillWriteoff?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function NavAssetScheduleSection({
  navRealEstateAdjustment,
  navInventoryAdjustment,
  navHiddenReserves,
  navGoodwillWriteoff,
  onFieldChange,
  disabled,
}: NavAssetScheduleSectionProps) {
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
          <Building2 className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.navAssetSchedule')}
        </h3>
        <span className="text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full">
          {t('recommendedForMethod', { method: 'NAV' })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
    </motion.section>
  )
}
