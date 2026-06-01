'use client'

import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import type { ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantMarketplaceProposalCardsProps {
  message: ChatMessage
  onApproveSellabilityRun?: (proposalId: string) => void
  onRejectSellabilityRun?: (proposalId: string) => void
  onApproveListingCreate?: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null,
    visibility?: 'public' | 'private'
  ) => void
  onRejectListingCreate?: (proposalId: string) => void
}

export function ChatAssistantMarketplaceProposalCards({
  message,
  onApproveSellabilityRun,
  onRejectSellabilityRun,
  onApproveListingCreate,
  onRejectListingCreate,
}: ChatAssistantMarketplaceProposalCardsProps) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'

  return (
    <>
      {/* Listing-create proposals — advisor handoff back to Mercury's listing wizard. */}
      {message.listingCreateRequests && message.listingCreateRequests.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.listingCreateRequests.map((req) => {
            const isPending =
              (req.status === 'pending_approval' || req.status === 'auto_approved') && !req.decision
            const isBlocked = req.status === 'blocked'
            const isApproved = req.decision === 'approved'
            const summary = req.valuationSummary
            const ccy = summary?.currency ?? 'EUR'
            const fmt = (value: string | number | null | undefined) => {
              if (value == null || value === '') return null
              const n = Number(value)
              if (Number.isFinite(n)) {
                return `${ccy === 'EUR' ? '€' : `${ccy} `}${n.toLocaleString(currencyLocale)}`
              }
              return String(value)
            }
            const midpoint = fmt(summary?.midpoint)
            const min = fmt(summary?.min)
            const max = fmt(summary?.max)
            const visibility =
              req.visibility === 'public'
                ? ca('proposalCards.listing.publicVisibility')
                : ca('proposalCards.listing.privateVisibility')

            const summaryBits: string[] = []
            if (midpoint)
              summaryBits.push(`${ca('proposalCards.listing.labelMidpoint')} ${midpoint}`)
            if (min || max) summaryBits.push(`${min ?? '—'}–${max ?? '—'}`)
            if (summary?.business_type) summaryBits.push(summary.business_type)
            if (summary?.industry) summaryBits.push(summary.industry)
            summaryBits.push(`${ca('proposalCards.listing.labelVisibility')} ${visibility}`)

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.listing.titleBlocked')
                    : summary?.business_name
                      ? ca('proposalCards.listing.titlePendingWithName', {
                          name: summary.business_name,
                        })
                      : ca('proposalCards.listing.titlePending')}
                </p>
                {req.note && <p className="text-foreground/55 text-xs mt-0.5">{req.note}</p>}
                {isBlocked && req.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{req.message}</p>
                )}
                {isPending && summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {isPending && (
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        onApproveListingCreate?.(
                          req.id,
                          req.reportId,
                          req.accountantCustomerId,
                          req.visibility
                        )
                      }
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                    >
                      {ca('proposalCards.listing.actionLabel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectListingCreate?.(req.id)}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-foreground/45 hover:text-foreground/70 transition-colors sm:min-h-0 sm:px-0"
                    >
                      {ca('proposalCards.common.buttonCancel')}
                    </button>
                  </div>
                )}
                {!isPending && !isBlocked && (
                  <p className="mt-1 text-xs text-foreground/45">
                    {isApproved
                      ? ca('proposalCards.listing.statusStarted')
                      : ca('proposalCards.common.statusCancelled')}
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Sellability-run proposals — flattened. */}
      {message.sellabilityRunRequests && message.sellabilityRunRequests.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.sellabilityRunRequests.map((req) => {
            const isPending = req.status === 'pending_approval' && !req.decision
            const isBlocked = req.status === 'blocked'
            const isApproved = req.decision === 'approved'
            const answers = req.answers
            const cur = req.currentScore
            const computed = req.computedScore

            const summaryBits: string[] = []
            if (answers?.q1_top3_concentration_pct != null)
              summaryBits.push(
                `${ca('proposalCards.sellability.labelQ1')} ${answers.q1_top3_concentration_pct}%`
              )
            if (answers?.q2_contracted_share)
              summaryBits.push(
                `${ca('proposalCards.sellability.labelQ2')} ${answers.q2_contracted_share}`
              )
            if (answers?.q3_books_cleanliness)
              summaryBits.push(
                `${ca('proposalCards.sellability.labelQ3')} ${answers.q3_books_cleanliness}`
              )
            if (cur) summaryBits.push(`${cur.score}/100 (${cur.band})`)

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.sellability.titleBlocked')
                    : computed
                      ? ca('proposalCards.sellability.computedTitle', {
                          score: computed.score,
                          band: computed.band,
                        })
                      : ca('proposalCards.sellability.titlePending')}
                </p>
                {req.note && <p className="text-foreground/55 text-xs mt-0.5">{req.note}</p>}
                {isBlocked && req.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{req.message}</p>
                )}
                {isBlocked && req.missing && req.missing.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5 font-mono">
                    {ca('proposalCards.common.missingPrefix')}
                    {req.missing.join(', ')}
                  </p>
                )}
                {isPending && summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {isPending && (
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onApproveSellabilityRun?.(req.id)}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                    >
                      {ca('proposalCards.sellability.actionLabel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectSellabilityRun?.(req.id)}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-foreground/45 hover:text-foreground/70 transition-colors sm:min-h-0 sm:px-0"
                    >
                      {ca('proposalCards.common.buttonCancel')}
                    </button>
                  </div>
                )}
                {!isPending && !isBlocked && (
                  <p className="mt-1 text-xs text-foreground/45">
                    {isApproved
                      ? computed
                        ? ca('proposalCards.sellability.computedStatus', {
                            score: computed.score,
                            band: computed.band,
                          })
                        : ca('proposalCards.sellability.statusStarted')
                      : ca('proposalCards.common.statusCancelled')}
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}
