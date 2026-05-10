'use client'

/**
 * Calculation Breakdown Modal
 *
 * Shows detailed methodology and calculation steps for the valuation.
 * Provides transparency for accountants to verify the numbers.
 */

import { motion } from 'framer-motion'
import { Calculator, Info, Scale, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraButton, Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system'
import { springDefault } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'

export interface CalculationBreakdownModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report?: {
    companyName: string
    valuation: number
    ebitda: number
    multiple: number
  } | null
}

export function CalculationBreakdownModal({
  open,
  onOpenChange,
  report,
}: CalculationBreakdownModalProps) {
  const t = useTranslations('calculationBreakdown')
  const locale = useLocale() as 'nl' | 'en'
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  if (!report) return null

  const steps = [
    {
      icon: Calculator,
      label: t('stepEbitda'),
      value: formatCurrency(report.ebitda),
      description: t('stepEbitdaDesc'),
    },
    {
      icon: TrendingUp,
      label: t('stepMultiple'),
      value: `${report.multiple.toFixed(1)}×`,
      description: t('stepMultipleDesc'),
    },
    {
      icon: Scale,
      label: t('stepValue'),
      value: formatCurrency(report.valuation),
      description: t('stepValueDesc'),
      highlight: true,
    },
  ]

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            {t('title')}
          </ModalTitle>
        </ModalHeader>

        <div className="py-4 space-y-4">
          <div className="px-4 py-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
            <p className="text-xs text-foreground/50 uppercase tracking-wider">{t('company')}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{report.companyName}</p>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springDefault, delay: index * 0.1 }}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg transition-colors',
                  step.highlight ? 'bg-primary/5 border border-primary/20' : 'bg-foreground/[0.02]'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    step.highlight ? 'bg-primary/10' : 'bg-foreground/[0.06]'
                  )}
                >
                  <step.icon
                    className={cn(
                      'w-4 h-4',
                      step.highlight ? 'text-primary' : 'text-foreground/50'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/70">{step.label}</span>
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold',
                        step.highlight ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {step.value}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/40 mt-0.5">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="px-4 py-3 rounded-lg bg-muted/50 border border-foreground/[0.06]">
            <p className="text-xs text-foreground/50 mb-2">{t('formula')}</p>
            <code className="text-sm font-mono text-foreground">
              {formatCurrency(report.ebitda)} × {report.multiple.toFixed(1)} ={' '}
              {formatCurrency(report.valuation)}
            </code>
          </div>

          <p className="text-xs text-foreground/40 px-1">{t('multipleNote')}</p>
        </div>

        <div className="flex justify-end pt-2 border-t border-foreground/[0.06]">
          <AuroraButton variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </AuroraButton>
        </div>
      </ModalContent>
    </Modal>
  )
}
