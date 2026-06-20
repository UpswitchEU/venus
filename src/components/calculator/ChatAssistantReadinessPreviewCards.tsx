'use client'

import { FormCardShell } from '@upswitch/ai-dock-shells'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  buildClientDataReadinessActions,
  buildMethodReadinessActions,
  formatMethodName,
} from './ChatAssistantAdvisoryPreviewActions'
import { advisoryTone, FollowUpButtons } from './ChatAssistantAdvisoryPreviewCardParts'
import type { ClientDataReadinessPreview, MethodReadinessPreview } from './ChatAssistantTypes'

interface ReadinessCardsProps<TPreview> {
  previews: TPreview[]
  onSendFollowUp?: (content: string) => void
}

export function ChatAssistantClientDataReadinessCards({
  previews,
  onSendFollowUp,
}: ReadinessCardsProps<ClientDataReadinessPreview>) {
  const ca = useTranslations('chatAssistant')

  if (previews.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
      {previews.map((readiness) => {
        const needsReview =
          readiness.status === 'needs_import_review' ||
          readiness.recommendedNextTool === 'open_import_review'
        const isReady = readiness.status === 'ready_for_valuation'
        const sources = (readiness.accountingSources ?? [])
          .map((source) => source.provider)
          .filter(Boolean)
          .slice(0, 4)
        const topFlags = readiness.importQualitySummary?.topFlags ?? []
        const actionableFlagCount =
          readiness.importQualitySummary?.actionableFlagCount ?? topFlags.length
        const summaryBits: string[] = []
        if (readiness.businessName) summaryBits.push(readiness.businessName)
        summaryBits.push(
          readiness.hasSyncedFinancials
            ? ca('proposalCards.clientDataReadiness.syncedLabel')
            : ca('proposalCards.clientDataReadiness.notSyncedLabel')
        )
        if (sources.length > 0) summaryBits.push(sources.join(', '))
        if (actionableFlagCount > 0) {
          summaryBits.push(
            ca('proposalCards.clientDataReadiness.flagCount', {
              count: actionableFlagCount,
            })
          )
        }
        const followUpActions = buildClientDataReadinessActions(readiness, ca)

        return (
          <motion.div
            key={readiness.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FormCardShell
              title={
                needsReview
                  ? ca('proposalCards.clientDataReadiness.titleReview')
                  : isReady
                    ? ca('proposalCards.clientDataReadiness.titleReady')
                    : ca('proposalCards.clientDataReadiness.titleBlocked')
              }
              reason={summaryBits.length > 0 ? summaryBits.join(' · ') : undefined}
              tone={advisoryTone({ blocked: needsReview, ready: isReady })}
            >
              {readiness.recommendedNextAction && (
                <p className="text-xs text-foreground/65 leading-snug">
                  <span className="font-medium text-foreground/75">
                    {ca('proposalCards.clientDataReadiness.nextActionLabel')}:
                  </span>{' '}
                  {readiness.recommendedNextAction}
                </p>
              )}
              {topFlags.length > 0 && (
                <div className="space-y-1">
                  {topFlags.slice(0, 3).map((flag, index) => (
                    <div
                      key={`${flag.year ?? 'year'}-${flag.code ?? flag.field ?? index}`}
                      className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground/75 truncate">
                          {flag.code ??
                            flag.field ??
                            ca('proposalCards.clientDataReadiness.flagsLabel')}
                        </span>
                        {flag.severity && (
                          <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                            {flag.severity}
                          </span>
                        )}
                      </div>
                      {flag.message && <p className="mt-0.5 text-foreground/55">{flag.message}</p>}
                    </div>
                  ))}
                </div>
              )}
              <FollowUpButtons actions={followUpActions} onSendFollowUp={onSendFollowUp} />
            </FormCardShell>
          </motion.div>
        )
      })}
    </div>
  )
}

export function ChatAssistantMethodReadinessCards({
  previews,
  onSendFollowUp,
}: ReadinessCardsProps<MethodReadinessPreview>) {
  const ca = useTranslations('chatAssistant')

  if (previews.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
      {previews.map((preview) => {
        const isBlocked = preview.status === 'blocked'
        const summaryBits: string[] = []
        if (preview.businessName) summaryBits.push(preview.businessName)
        if (!isBlocked) {
          summaryBits.push(
            ca('proposalCards.methodReadiness.readyCount', {
              count: preview.readyMethods.length,
            })
          )
          if (preview.blockedMethods.length > 0) {
            summaryBits.push(
              ca('proposalCards.methodReadiness.blockedCount', {
                count: preview.blockedMethods.length,
              })
            )
          }
        } else if (preview.message) {
          summaryBits.push(preview.message)
        }
        const followUpActions = buildMethodReadinessActions(preview, ca)

        return (
          <motion.div
            key={preview.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FormCardShell
              title={
                isBlocked
                  ? ca('proposalCards.methodReadiness.titleBlocked')
                  : ca('proposalCards.methodReadiness.titleReady')
              }
              reason={summaryBits.length > 0 ? summaryBits.join(' · ') : undefined}
              tone={advisoryTone({ blocked: isBlocked })}
            >
              {!isBlocked && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-foreground/[0.035] px-2 py-1.5">
                    <p className="text-[10px] font-medium uppercase text-foreground/35">
                      {ca('proposalCards.methodReadiness.readyLabel')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {preview.readyMethods.slice(0, 6).map((method) => (
                        <span
                          key={method}
                          className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] text-success/90"
                        >
                          {formatMethodName(method)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md bg-foreground/[0.025] px-2 py-1.5">
                    <p className="text-[10px] font-medium uppercase text-foreground/35">
                      {ca('proposalCards.methodReadiness.blockedLabel')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {preview.blockedMethods.slice(0, 6).map((method) => (
                        <span
                          key={method}
                          className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55"
                        >
                          {formatMethodName(method)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <FollowUpButtons actions={followUpActions} onSendFollowUp={onSendFollowUp} />
            </FormCardShell>
          </motion.div>
        )
      })}
    </div>
  )
}
