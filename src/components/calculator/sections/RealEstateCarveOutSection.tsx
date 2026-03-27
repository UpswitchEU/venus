'use client'

import { Building2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Switch } from '../../../design-system/components/Switch'
import { CurrencyInput } from '../CurrencyInput'

interface RealEstateCarveOutSectionProps {
  excludeRealEstate?: boolean
  realEstateBookValue?: number
  estimatedMarketRent?: number
  onToggleChange: (checked: boolean) => void
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function RealEstateCarveOutSection({
  excludeRealEstate,
  realEstateBookValue,
  estimatedMarketRent,
  onToggleChange,
  onFieldChange,
  disabled,
}: RealEstateCarveOutSectionProps) {
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
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-3 w-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.realEstateCarveOut')}
        </h3>
      </div>

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
                  <CurrencyInput
                    label={t('fields.realEstateBookValue')}
                    value={realEstateBookValue}
                    onChange={(value) => onFieldChange('real_estate_book_value', value)}
                    size="sm"
                    placeholder="0"
                    disabled={disabled}
                  />
                  <CurrencyInput
                    label={t('fields.estimatedMarketRent')}
                    value={estimatedMarketRent}
                    onChange={(value) => onFieldChange('estimated_market_rent', value)}
                    size="sm"
                    placeholder="0"
                    disabled={disabled}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  )
}
