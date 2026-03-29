'use client'

import { Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface SdeOwnerCompensationSectionProps {
  step: number
  ownerSalaryAddback?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function SdeOwnerCompensationSection({
  step,
  ownerSalaryAddback,
  onFieldChange,
  disabled,
}: SdeOwnerCompensationSectionProps) {
  const t = useTranslations('manualInput.methodSelector')

  const sectionComplete = useMemo(
    () => ownerSalaryAddback != null && Number.isFinite(ownerSalaryAddback) && ownerSalaryAddback > 0,
    [ownerSalaryAddback]
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
        title={t('sections.sdeOwnerCompensation')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('recommendedForMethod', { method: 'SDE' })}
          </span>
        }
      />

      <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-3.5 py-3 text-[12px] leading-relaxed text-foreground/50 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-primary/50 mt-0.5 shrink-0" />
        <span>{t('sdeExplainer')}</span>
      </div>

      <CurrencyInput
        label={t('fields.ownerSalaryAddback')}
        value={ownerSalaryAddback}
        onChange={(v) => onFieldChange('owner_salary_addback', v)}
        size="sm"
        placeholder="45 000"
        disabled={disabled}
      />
    </motion.section>
  )
}
