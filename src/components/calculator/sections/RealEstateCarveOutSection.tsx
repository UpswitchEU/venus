'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { Switch } from '../../../design-system/components/Switch'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface RealEstateCarveOutSectionProps {
  step: number
  excludeRealEstate?: boolean
  realEstateBookValue?: number
  estimatedMarketRent?: number
  onToggleChange: (checked: boolean) => void
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function RealEstateCarveOutSection({
  step,
  excludeRealEstate,
  realEstateBookValue,
  estimatedMarketRent,
  onToggleChange,
  onFieldChange,
  disabled,
}: RealEstateCarveOutSectionProps) {
  const t = useTranslations('manualInput.methodSelector')

  const sectionComplete = useMemo(() => {
    if (!excludeRealEstate) return true
    return (
      realEstateBookValue !== undefined &&
      realEstateBookValue !== null &&
      estimatedMarketRent !== undefined &&
      estimatedMarketRent !== null
    )
  }, [excludeRealEstate, realEstateBookValue, estimatedMarketRent])

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
        step={step}
        title={t('sections.realEstateCarveOut')}
      />

      <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4">
        <div className="space-y-3">
          <Switch
            checked={Boolean(excludeRealEstate)}
            onChange={onToggleChange}
            label={t('fields.excludeRealEstate')}
            description={t('realEstateCarveOutHint')}
            disabled={disabled}
          />

          <AnimatePresence initial={false}>
            {excludeRealEstate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <CurrencyInput
                      label={t('fields.estimatedMarketRent')}
                      value={estimatedMarketRent}
                      onChange={(value) => onFieldChange('estimated_market_rent', value)}
                      size="sm"
                      placeholder="0"
                      disabled={disabled}
                    />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t('estimatedMarketRentEbitdaHint')}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <CurrencyInput
                      label={t('fields.realEstateBookValue')}
                      value={realEstateBookValue}
                      onChange={(value) => onFieldChange('real_estate_book_value', value)}
                      size="sm"
                      placeholder="0"
                      disabled={disabled}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  )
}
