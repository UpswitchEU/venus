'use client'

import { useTranslations } from 'next-intl'

/**
 * Integration Step Panel
 *
 * First step in valuation flow — CSV export or manual input (calculator bootstrap).
 * ICP path: native integrations (Yuki/Exact) live in Mercury; CSV here is **not** Hermes
 * ledger ingestion — see `apps/venus/docs/CSV_IMPORT_POSITIONING.md`.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronRight, FileSpreadsheet, Keyboard, Upload } from 'lucide-react'
import { useState } from 'react'
import {
  CSVMappingPreview,
  CSVUploadCard,
  type MappedAccount,
  NormalisationReviewPanel,
  type ParsedCSVData,
  type SuggestedNormalisation,
} from '@/components/integrations'
import { YukiConnectModal } from '@/components/integrations/YukiConnectModal'
import { trackNormalizationAcceptAll } from '@/lib/analytics'
import { Badge } from '@/design-system/components/Badge'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { GlassCard } from '@/design-system/components/GlassCard'
import { Body, Caption, Heading } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'
import type { AccountingBatchPayload } from '@/services/api/accounting'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

type IntegrationStep = 'select' | 'upload' | 'mapping' | 'review' | 'complete'

export interface IntegrationStepPanelProps {
  onComplete: (method: 'csv' | 'manual', data?: MappedAccount[]) => void
  onYukiImported?: (payload: AccountingBatchPayload) => void
  onSkip?: () => void
  className?: string
}

// ─────────────────────────────────────────
// CSV-derived normalisation suggestions (no fabricated defaults)
// ─────────────────────────────────────────

type TranslateFn = (key: string) => string

const generateNormalisations = (
  accounts: MappedAccount[],
  t: TranslateFn
): SuggestedNormalisation[] => {
  // Generate smart normalisation suggestions based on account data
  const suggestions: SuggestedNormalisation[] = []

  // Find owner-related expenses (common normalisation)
  const ownerExpenses = accounts.filter(
    (a) => a.category === 'expense' && /eigenaar|directeur|dga|auto|pension/i.test(a.description)
  )

  ownerExpenses.forEach((account, i) => {
    const values = Object.values(account.values) as number[]
    const avgValue = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1)

    if (avgValue > 5000) {
      suggestions.push({
        id: `norm-${i}`,
        category: account.description,
        description: t('potentialNormalisation'),
        amount: Math.round(avgValue * 0.4), // Suggest 40% normalisation
        reason: t('privateUseDetected'),
        status: 'pending',
      })
    }
  })

  // No fabricated defaults: ledger-driven suggestions only (imported CSV mapping).
  // Full normalisation review remains in the main calculator (UnifiedNormalizationModal).
  return suggestions.slice(0, 5) // Max 5 suggestions
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function IntegrationStepPanel({
  onComplete,
  onYukiImported,
  onSkip,
  className,
}: IntegrationStepPanelProps) {
  const t = useTranslations('integrationStep')
  const [step, setStep] = useState<IntegrationStep>('select')
  const [parsedCSV, setParsedCSV] = useState<ParsedCSVData | null>(null)
  const [mappedAccounts, setMappedAccounts] = useState<MappedAccount[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedNormalisation[]>([])
  const [showYukiModal, setShowYukiModal] = useState(false)

  // Handlers
  const handleCSVSelected = (file: File, data: ParsedCSVData) => {
    setParsedCSV(data)
    setStep('mapping')
  }

  const handleMappingConfirmed = (accounts: MappedAccount[]) => {
    setMappedAccounts(accounts)
    setSuggestions(generateNormalisations(accounts, t))
    setStep('review')
  }

  const handleAccept = (id: string) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'accepted' } : s)))
  }

  const handleReject = (id: string) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'rejected' } : s)))
  }

  const handleAcceptAll = () => {
    const pendingCount = suggestions.filter((s) => s.status === 'pending').length
    if (pendingCount > 0) {
      trackNormalizationAcceptAll(pendingCount)
    }
    setSuggestions((prev) =>
      prev.map((s) => (s.status === 'pending' ? { ...s, status: 'accepted' } : s))
    )
  }

  const handleContinue = () => {
    onComplete('csv', mappedAccounts)
  }

  const handleManualInput = () => {
    onComplete('manual')
  }

  const handleBackToUpload = () => {
    setStep('upload')
    setParsedCSV(null)
  }

  const handleBackToMapping = () => {
    setStep('mapping')
  }

  // Render based on step
  return (
    <>
      <div className={cn('space-y-6', className)}>
        {/* Step: Select Integration Method */}
        {step === 'select' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="w-7 h-7 text-primary" />
            </div>
            <Heading level={2} className="text-xl mb-2">
              {t('title')}
            </Heading>
            <Body className="text-foreground/60 max-w-md mx-auto">{t('subtitle')}</Body>
          </div>

          {/* Integration Options */}
          <div className="grid gap-4 max-w-lg mx-auto">
            {/* CSV Upload Card - Primary Option */}
            <GlassCard
              className="p-5 cursor-pointer hover:bg-foreground/[0.02] transition-colors border-primary/20"
              onClick={() => setStep('upload')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Heading level={3} className="text-base">
                      {t('ledgerUpload')}
                    </Heading>
                    <Badge variant="primary" size="sm">
                      {t('recommended')}
                    </Badge>
                  </div>
                  <Caption className="text-foreground/50">{t('ledgerUploadCaption')}</Caption>
                </div>
                <ChevronRight className="w-5 h-5 text-foreground/30" />
              </div>
            </GlassCard>

            {/* Native Yuki connection */}
            <div className="relative">
              <GlassCard
                className="p-5 cursor-pointer hover:bg-foreground/[0.02] transition-colors"
                onClick={() => setShowYukiModal(true)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-foreground/[0.06] flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6 text-foreground/40" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Heading level={3} className="text-base text-foreground/70">
                        {t('directIntegration')}
                      </Heading>
                      <Badge variant="primary" size="sm">
                        Yuki
                      </Badge>
                    </div>
                    <Caption className="text-foreground/50">
                      Connect Yuki directly, pull 3-5 fiscal years, and continue with a prefilled normalization flow.
                    </Caption>
                  </div>
                  <ChevronRight className="w-5 h-5 text-foreground/30" />
                </div>
              </GlassCard>
            </div>

            {/* Manual Input */}
            <GlassCard
              className="p-5 cursor-pointer hover:bg-foreground/[0.02] transition-colors"
              onClick={handleManualInput}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-foreground/[0.06] flex items-center justify-center">
                  <Keyboard className="w-6 h-6 text-foreground/50" />
                </div>
                <div className="flex-1">
                  <Heading level={3} className="text-base">
                    {t('manualInput')}
                  </Heading>
                  <Caption className="text-foreground/50">{t('manualInputCaption')}</Caption>
                </div>
                <ChevronRight className="w-5 h-5 text-foreground/30" />
              </div>
            </GlassCard>
          </div>

          {/* Skip option */}
          {onSkip && (
            <div className="text-center mt-8">
              <button
                onClick={onSkip}
                className="text-sm text-foreground/40 hover:text-foreground/60 transition-colors"
              >
                {t('skipAndStart')}
              </button>
            </div>
          )}
          </motion.div>
        )}

      {/* Step: CSV Upload */}
        {step === 'upload' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto"
          >
            <CSVUploadCard onFileSelected={handleCSVSelected} onSkip={handleManualInput} />

            <div className="mt-4">
              <Button variant="ghost" onClick={() => setStep('select')}>
                {t('backToOptions')}
              </Button>
            </div>
          </motion.div>
        )}

      {/* Step: Mapping Preview */}
        {step === 'mapping' && parsedCSV && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <CSVMappingPreview
              parsedData={parsedCSV}
              onConfirm={handleMappingConfirmed}
              onBack={handleBackToUpload}
            />
          </motion.div>
        )}

      {/* Step: Review Normalisations */}
        {step === 'review' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
          {/* Success Banner */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <Check className="w-5 h-5 text-primary" />
            <Body size="sm" className="font-medium">
              {t('accountsImported', {
                accounts: mappedAccounts.length,
                years: parsedCSV?.fiscalYears.length || 0,
              })}
            </Body>
          </div>

          {/* Normalisation Review */}
          <NormalisationReviewPanel
            suggestions={suggestions}
            onAccept={handleAccept}
            onReject={handleReject}
            onAcceptAll={handleAcceptAll}
          />

            {/* Navigation */}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={handleBackToMapping}>
                {t('backToMapping')}
              </Button>
              <Button variant="primary" onClick={handleContinue}>
                {t('continueToEstimate')}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        )}
      </div>
      <YukiConnectModal
        open={showYukiModal}
        onOpenChange={setShowYukiModal}
        onImported={(payload) => {
          onYukiImported?.(payload)
          onComplete('manual')
        }}
      />
    </>
  )
}

export default IntegrationStepPanel
