'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { Badge } from '@/design-system/components/Badge'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { GlassCard } from '@/design-system/components/GlassCard'
import { Body, Caption, Heading, Mono } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'
import { formatCurrency } from './yukiIntegrationFormatters'
import type { NormalisationReviewProps } from './yukiIntegrationTypes'

export function NormalisationReviewPanel({
  suggestions,
  onAccept,
  onReject,
  onAcceptAll,
  className,
}: NormalisationReviewProps) {
  const ca = useTranslations('chatAssistant')
  const pendingCount = suggestions.filter((s) => s.status === 'pending').length
  const acceptedCount = suggestions.filter((s) => s.status === 'accepted').length
  const isEmpty = suggestions.length === 0

  return (
    <GlassCard className={cn('p-6', className)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level={3} className="text-lg mb-1">
            {ca('suggestedNormalizations')}
          </Heading>
          <Caption className="text-foreground/50">
            {isEmpty
              ? ca('noLedgerSuggestionsCaption')
              : pendingCount > 0
                ? ca('normalizationsToReview', { count: pendingCount })
                : ca('normalizationsAccepted', { count: acceptedCount })}
          </Caption>
        </div>

        {!isEmpty && pendingCount > 0 && (
          <Button variant="primary" size="sm" onClick={onAcceptAll}>
            {ca('acceptAll')}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isEmpty ? (
          <Body size="sm" className="text-foreground/60 leading-relaxed">
            {ca('noLedgerSuggestionsBody')}
          </Body>
        ) : null}
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion) => (
            <motion.div
              key={suggestion.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={cn(
                'flex items-start gap-4 p-4 rounded-xl',
                'border transition-all',
                suggestion.status === 'pending'
                  ? 'bg-foreground/[0.02] border-foreground/[0.06]'
                  : suggestion.status === 'accepted'
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-foreground/[0.01] border-foreground/[0.04] opacity-50'
              )}
            >
              <div className="w-20 shrink-0">
                <Mono className="text-lg font-semibold text-primary">
                  {formatCurrency(suggestion.amount)}
                </Mono>
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <Body
                  size="sm"
                  className={cn('font-medium', LEDGER_LABEL_TEXT_CLASSES)}
                  title={suggestion.category}
                >
                  {suggestion.category}
                </Body>
                {suggestion.description &&
                  suggestion.description.trim().length > 0 &&
                  suggestion.description.trim() !== suggestion.category.trim() && (
                    <Caption
                      className={cn('text-foreground/65', LEDGER_LABEL_TEXT_CLASSES)}
                      title={suggestion.description}
                    >
                      {suggestion.description}
                    </Caption>
                  )}
                <Caption
                  className={cn('text-foreground/50', LEDGER_LABEL_TEXT_CLASSES)}
                  title={suggestion.reason}
                >
                  {suggestion.reason}
                </Caption>
              </div>

              {suggestion.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onReject(suggestion.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                    aria-label={ca('reject')}
                  >
                    <X className="w-4 h-4 text-foreground/40" />
                  </button>
                  <button
                    onClick={() => onAccept(suggestion.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 hover:bg-primary/20 transition-colors"
                    aria-label={ca('accept')}
                  >
                    <Check className="w-4 h-4 text-primary" />
                  </button>
                </div>
              )}

              {suggestion.status === 'accepted' && (
                <Badge variant="primary" size="sm">
                  {ca('accepted')}
                </Badge>
              )}
              {suggestion.status === 'rejected' && (
                <Badge variant="neutral" size="sm">
                  {ca('rejected')}
                </Badge>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
