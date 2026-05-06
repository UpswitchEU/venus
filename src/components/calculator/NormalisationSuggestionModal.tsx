'use client'

/**
 * Normalisation Suggestion Modal
 *
 * Modal that opens when AI suggests a normalization from the Chat Co-pilot.
 * Shows the suggested adjustment aligned with Yuki/Exact grootboek codes.
 */

import { AlertCircle, Check, Edit2, FileSpreadsheet, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  AuroraButton,
  AuroraInput,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'

export interface NormalisationSuggestion {
  id: string
  field: string
  label: string
  grootboekCode?: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  currentValue?: number
  suggestedValue: number
  adjustment: number
  reason: string
  sourceRef?: string
  marketBenchmark?: number
  confidence?: 'high' | 'medium' | 'low'
}

export interface NormalisationSuggestionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestion: NormalisationSuggestion | null
  onAccept: (suggestion: NormalisationSuggestion, customValue?: number) => void
  onReject: (suggestion: NormalisationSuggestion) => void
  companyName?: string
}

const categoryIcons: Record<NormalisationSuggestion['category'], string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
  depreciation: '📉',
  other: '📋',
}

export function NormalisationSuggestionModal({
  open,
  onOpenChange,
  suggestion,
  onAccept,
  onReject,
}: NormalisationSuggestionModalProps) {
  const t = useTranslations('normalizationHub.suggestionModal')
  const locale = useLocale()
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  const categoryLabels: Record<NormalisationSuggestion['category'], string> = {
    salary: t('categories.salary'),
    rent: t('categories.rent'),
    vehicle: t('categories.vehicle'),
    'one-time': t('categories.oneTime'),
    personal: t('categories.personal'),
    depreciation: t('categories.depreciation'),
    other: t('categories.other'),
  }

  const [isEditing, setIsEditing] = useState(false)
  const [customValue, setCustomValue] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)

  if (!suggestion) return null

  const handleAccept = () => {
    setIsProcessing(true)
    const finalValue =
      isEditing && customValue ? parseFloat(customValue.replace(/[^0-9.-]/g, '')) : undefined

    setTimeout(() => {
      onAccept(suggestion, finalValue)
      setIsProcessing(false)
      setIsEditing(false)
      setCustomValue('')
      onOpenChange(false)
    }, 300)
  }

  const handleReject = () => {
    onReject(suggestion)
    onOpenChange(false)
  }

  const startEditing = () => {
    setIsEditing(true)
    setCustomValue(suggestion.suggestedValue.toString())
  }

  const confidenceColors = {
    high: 'text-success bg-success/10 border-success/20',
    medium: 'text-warning bg-warning/10 border-warning/30',
    low: 'text-foreground/50 bg-foreground/5 border-foreground/10',
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-lg">
        <ModalHeader>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
              {categoryIcons[suggestion.category]}
            </div>
            <div className="min-w-0 flex-1">
              <ModalTitle className="text-base">{t('title')}</ModalTitle>
              <p
                className={cn('text-xs text-foreground/50 mt-0.5', LEDGER_LABEL_TEXT_CLASSES)}
                title={`${categoryLabels[suggestion.category]} · ${suggestion.label}`}
              >
                {categoryLabels[suggestion.category]} · {suggestion.label}
              </p>
            </div>
          </div>
        </ModalHeader>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {suggestion.sourceRef && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-foreground/[0.04] border border-foreground/[0.08] text-foreground/60">
                <FileSpreadsheet className="w-3 h-3" />
                {suggestion.sourceRef}
              </span>
            )}
            {suggestion.confidence && (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
                  confidenceColors[suggestion.confidence]
                )}
              >
                {suggestion.confidence === 'high' && `✓ ${t('confidenceHigh')}`}
                {suggestion.confidence === 'medium' && `○ ${t('confidenceMedium')}`}
                {suggestion.confidence === 'low' && `? ${t('confidenceLow')}`}
              </span>
            )}
          </div>

          <div className="p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.08]">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-1">
                  {t('currentValue')}
                </p>
                <p className="text-lg font-mono font-semibold text-foreground/60 line-through">
                  {suggestion.currentValue !== undefined
                    ? formatCurrency(suggestion.currentValue)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-1">
                  {t('adjustment')}
                </p>
                <p
                  className={cn(
                    'text-lg font-mono font-semibold',
                    suggestion.adjustment > 0 ? 'text-success' : 'text-secondary'
                  )}
                >
                  {suggestion.adjustment > 0 ? '+' : ''}
                  {formatCurrency(suggestion.adjustment)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-primary uppercase tracking-wider mb-1">
                  {t('suggestion')}
                </p>
                {isEditing ? (
                  <AuroraInput
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="text-center font-mono text-lg h-8"
                    placeholder="€..."
                    autoFocus
                  />
                ) : (
                  <p className="text-lg font-mono font-bold text-foreground">
                    {formatCurrency(suggestion.suggestedValue)}
                  </p>
                )}
              </div>
            </div>
            {suggestion.marketBenchmark && (
              <div className="mt-3 pt-3 border-t border-foreground/[0.06] text-center">
                <p className="text-[10px] text-foreground/40">
                  {t('marketBenchmark')}: {formatCurrency(suggestion.marketBenchmark)}
                </p>
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground mb-0.5">{t('reasonTitle')}</p>
                <p className={cn('text-xs text-foreground/60', LEDGER_LABEL_TEXT_CLASSES)}>
                  {suggestion.reason}
                </p>
              </div>
            </div>
          </div>

          {suggestion.grootboekCode && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/50">{t('ledgerAccount')}</span>
              <span className="font-mono text-foreground/70 px-2 py-0.5 rounded bg-foreground/[0.04] border border-foreground/[0.06]">
                {suggestion.grootboekCode}
              </span>
            </div>
          )}
        </div>

        <ModalFooter className="flex-col sm:flex-row gap-2">
          {!isEditing && (
            <AuroraButton
              variant="ghost"
              onClick={startEditing}
              className="w-full sm:w-auto gap-1.5"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {t('edit')}
            </AuroraButton>
          )}
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <AuroraButton
              variant="secondary"
              onClick={handleReject}
              disabled={isProcessing}
              className="flex-1 sm:flex-none gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              {t('reject')}
            </AuroraButton>
            <AuroraButton
              variant="primary"
              onClick={handleAccept}
              disabled={isProcessing}
              className="flex-1 sm:flex-none gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t('apply')}
            </AuroraButton>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default NormalisationSuggestionModal
