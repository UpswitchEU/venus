'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { AuroraSelect, type SelectOption } from '../../../design-system/components/Select'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

type RealEstateTreatment = 'none' | 'carve_out' | 'included'

interface RealEstateCarveOutSectionProps {
  step: number
  realEstateTreatment?: RealEstateTreatment
  excludeRealEstate?: boolean
  realEstateMarketValue?: number
  realEstateBookValue?: number
  estimatedMarketRent?: number
  onTreatmentChange: (treatment: RealEstateTreatment) => void
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function RealEstateCarveOutSection({
  step,
  realEstateTreatment,
  excludeRealEstate,
  realEstateMarketValue,
  realEstateBookValue,
  estimatedMarketRent,
  onTreatmentChange,
  onFieldChange,
  disabled,
}: RealEstateCarveOutSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const treatment = realEstateTreatment ?? (excludeRealEstate ? 'carve_out' : 'none')
  const isCarveOut = treatment === 'carve_out'
  const isIncluded = treatment === 'included'

  const sectionComplete = useMemo(() => {
    if (treatment === 'none') return true
    if (treatment === 'carve_out') {
      return (
        realEstateBookValue !== undefined &&
        realEstateBookValue !== null &&
        estimatedMarketRent !== undefined &&
        estimatedMarketRent !== null
      )
    }
    return (
      realEstateBookValue !== undefined &&
      realEstateBookValue !== null &&
      realEstateMarketValue !== undefined &&
      realEstateMarketValue !== null
    )
  }, [treatment, realEstateBookValue, realEstateMarketValue, estimatedMarketRent])

  const treatmentOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: 'none',
        label: t('fields.realEstateNone'),
      },
      {
        value: 'carve_out',
        label: t('fields.realEstateCarveOutMode'),
        description: t('realEstateCarveOutHint'),
      },
      {
        value: 'included',
        label: t('fields.realEstateIncluded'),
        description: t('realEstateIncludedHint'),
      },
    ],
    [t]
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
        step={step}
        title={t('sections.realEstateCarveOut')}
      />

      <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-4">
        <div className="space-y-3">
          <AuroraSelect
            value={treatment}
            onChange={(value) => onTreatmentChange(value as RealEstateTreatment)}
            options={treatmentOptions}
            label={t('fields.realEstateTreatment')}
            size="sm"
            disabled={disabled}
          />

          <AnimatePresence initial={false}>
            {(isCarveOut || isIncluded) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-3 pt-1">
                  {isCarveOut && (
                    <div className="space-y-1.5">
                      <CurrencyInput
                        label={t('fields.estimatedMarketRent')}
                        value={estimatedMarketRent}
                        onChange={(value) => onFieldChange('estimated_market_rent', value)}
                        size="sm"
                        placeholder="0"
                        disabled={disabled}
                        truncateLabel={false}
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {t('estimatedMarketRentEbitdaHint')}
                      </p>
                    </div>
                  )}
                  {isIncluded && (
                    <div className="space-y-1.5">
                      <CurrencyInput
                        label={t('fields.realEstateMarketValue')}
                        value={realEstateMarketValue}
                        onChange={(value) => onFieldChange('real_estate_market_value', value)}
                        size="sm"
                        placeholder="0"
                        disabled={disabled}
                        truncateLabel={false}
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {t('realEstateIncludedSurplusHint')}
                      </p>
                    </div>
                  )}
                  <div>
                    <CurrencyInput
                      label={t('fields.realEstateBookValue')}
                      value={realEstateBookValue}
                      onChange={(value) => onFieldChange('real_estate_book_value', value)}
                      size="sm"
                      placeholder="0"
                      disabled={disabled}
                      truncateLabel={false}
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
