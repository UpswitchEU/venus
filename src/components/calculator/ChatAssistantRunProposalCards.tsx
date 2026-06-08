'use client'

import { ProposalCardShell, type ProposalCardTone } from '@upswitch/ai-dock-shells'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import type { ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantRunProposalCardsProps {
  message: ChatMessage
  onApproveValuationRun?: (proposalId: string, reportId?: string, methods?: string[] | null) => void
  onRejectValuationRun?: (proposalId: string) => void
  onApproveReportGeneration?: (proposalId: string, reportId?: string) => void
  onRejectReportGeneration?: (proposalId: string) => void
}

function proposalTone(
  status: 'pending_approval' | 'blocked',
  decision?: 'approved' | 'rejected'
): ProposalCardTone {
  if (decision === 'approved') return 'success'
  if (decision === 'rejected') return 'rejected'
  if (status === 'blocked') return 'warning'
  return 'idle'
}

export function ChatAssistantRunProposalCards({
  message,
  onApproveValuationRun,
  onRejectValuationRun,
  onApproveReportGeneration,
  onRejectReportGeneration,
}: ChatAssistantRunProposalCardsProps) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'

  return (
    <>
      {/* Valuation-run proposals — flattened to plain text + single action. */}
      {message.valuationRunRequests && message.valuationRunRequests.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.valuationRunRequests.map((req) => {
            const isPending = req.status === 'pending_approval' && !req.decision
            const isBlocked = req.status === 'blocked'
            const isApproved = req.decision === 'approved'
            const summary = req.inputsSummary
            const revenueNum = summary?.revenue ? Number(summary.revenue) : null
            const ebitdaNormNum = summary?.ebitda_normalized
              ? Number(summary.ebitda_normalized)
              : null
            const ebitdaNum = summary?.ebitda ? Number(summary.ebitda) : null
            const ebitdaForDisplay = ebitdaNormNum ?? ebitdaNum

            // Compose a single, dense one-line summary so the user sees what
            // will run without scanning a data grid.
            const summaryBits: string[] = []
            if (revenueNum !== null)
              summaryBits.push(
                `${ca('proposalCards.valuation.labelRevenue')} €${revenueNum.toLocaleString(currencyLocale)}`
              )
            if (ebitdaForDisplay !== null)
              summaryBits.push(
                `EBITDA${ebitdaNormNum ? '*' : ''} €${ebitdaForDisplay.toLocaleString(currencyLocale)}`
              )
            if (summary?.business_type) summaryBits.push(summary.business_type)
            if (summary && summary.applied_normalizations > 0)
              summaryBits.push(
                `${summary.applied_normalizations} ${ca('proposalCards.valuation.labelAppliedNormalisations')}`
              )
            if (req.estimatedCredits != null)
              summaryBits.push(
                ca('proposalCards.common.creditsLabel', { count: req.estimatedCredits })
              )

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <ProposalCardShell
                  title={
                    isBlocked
                      ? ca('proposalCards.valuation.titleBlocked')
                      : summary?.business_name
                        ? ca('proposalCards.valuation.titlePendingWithName', {
                            name: summary.business_name,
                          })
                        : ca('proposalCards.valuation.titlePending')
                  }
                  subhead={
                    req.note ??
                    (isBlocked ? req.message : undefined) ??
                    (isPending && summaryBits.length > 0 ? summaryBits.join(' · ') : undefined)
                  }
                  reason={req.reason}
                  tone={proposalTone(req.status, req.decision)}
                  primaryLabel={isPending ? ca('proposalCards.valuation.actionLabel') : undefined}
                  onPrimary={
                    isPending
                      ? () => onApproveValuationRun?.(req.id, req.reportId, req.methods)
                      : undefined
                  }
                  rejectLabel={isPending ? ca('proposalCards.common.buttonCancel') : undefined}
                  onReject={isPending ? () => onRejectValuationRun?.(req.id) : undefined}
                  successNote={
                    isApproved
                      ? ca('proposalCards.valuation.statusStarted')
                      : req.decision === 'rejected'
                        ? ca('proposalCards.common.statusCancelled')
                        : undefined
                  }
                >
                  {isBlocked && req.missing && req.missing.length > 0 ? (
                    <p className="text-foreground/55 text-xs mt-1 font-mono">
                      {ca('proposalCards.common.missingPrefix')}
                      {req.missing.join(', ')}
                    </p>
                  ) : null}
                </ProposalCardShell>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Report-generation proposals — flattened. */}
      {message.reportGenerationRequests && message.reportGenerationRequests.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.reportGenerationRequests.map((req) => {
            const isPending = req.status === 'pending_approval' && !req.decision
            const isBlocked = req.status === 'blocked'
            const isApproved = req.decision === 'approved'
            const result = req.resultSummary
            const ccy = result?.currency ?? 'EUR'
            const fmt = (n: number | null | undefined) =>
              n != null && Number.isFinite(n)
                ? `${ccy === 'EUR' ? '€' : `${ccy} `}${Number(n).toLocaleString(currencyLocale)}`
                : null
            const midpoint = fmt(result?.midpoint)
            const min = fmt(result?.min)
            const max = fmt(result?.max)

            const summaryBits: string[] = []
            if (midpoint) summaryBits.push(midpoint)
            if (min || max) summaryBits.push(`${min ?? '—'}–${max ?? '—'}`)
            if (result?.valuation_method) summaryBits.push(result.valuation_method)
            if (result?.confidence_score != null)
              summaryBits.push(
                `${result.confidence_score}% ${ca('proposalCards.report.labelConfidence').toLowerCase()}`
              )

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <ProposalCardShell
                  title={
                    isBlocked
                      ? ca('proposalCards.report.titleBlocked')
                      : result?.business_name
                        ? ca('proposalCards.report.titlePendingWithName', {
                            name: result.business_name,
                          })
                        : ca('proposalCards.report.titlePending')
                  }
                  subhead={
                    req.note ??
                    (isBlocked ? req.message : undefined) ??
                    (isPending && summaryBits.length > 0 ? summaryBits.join(' · ') : undefined)
                  }
                  reason={req.reason}
                  tone={proposalTone(req.status, req.decision)}
                  primaryLabel={isPending ? ca('proposalCards.report.actionLabel') : undefined}
                  onPrimary={
                    isPending ? () => onApproveReportGeneration?.(req.id, req.reportId) : undefined
                  }
                  rejectLabel={isPending ? ca('proposalCards.common.buttonCancel') : undefined}
                  onReject={isPending ? () => onRejectReportGeneration?.(req.id) : undefined}
                  successNote={
                    isApproved
                      ? ca('proposalCards.report.statusStarted')
                      : req.decision === 'rejected'
                        ? ca('proposalCards.common.statusCancelled')
                        : undefined
                  }
                />
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}
