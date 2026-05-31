'use client'

import { FormCardShell, type FormCardTone } from '@upswitch/ai-dock-shells'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type {
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ChatMessage,
  ClientDataReadinessPreview,
  ListingPreview,
  MethodReadinessPreview,
} from './ChatAssistantTypes'

interface ChatAssistantAdvisoryPreviewCardsProps {
  message: ChatMessage
  onSendFollowUp?: (content: string) => void
}

type ChatAssistantTranslator = ReturnType<typeof useTranslations>
type FollowUpAction = { label: string; prompt: string; primary?: boolean }

function formatMethodName(method: string) {
  return method
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function listingSubject(preview: Pick<ListingPreview, 'reportId' | 'sourceBusinessName'>) {
  if (preview.reportId) return `valuation report ${preview.reportId}`
  if (preview.sourceBusinessName) return preview.sourceBusinessName
  return 'this business'
}

function buyerProfileSubject(
  preview: Pick<BuyerProfilePreview, 'reportId' | 'sourceBusinessName'>
) {
  if (preview.reportId) return `valuation report ${preview.reportId}`
  if (preview.sourceBusinessName) return preview.sourceBusinessName
  return 'this business'
}

function buildListingGapPrompt(preview: ListingPreview) {
  const hint = preview.nextActionHint?.trim()
  if (hint) return hint
  const fields = preview.missingFields?.filter(Boolean) ?? []
  if (fields.length > 0) {
    return `Help me complete the missing listing fields for ${listingSubject(preview)}: ${fields.join(
      ', '
    )}.`
  }
  return `Help me get the listing ready for ${listingSubject(preview)}.`
}

function buildBuyerProfileGapPrompt(preview: BuyerProfilePreview) {
  const fields = preview.listingReadiness?.missingFields?.filter(Boolean) ?? []
  if (fields.length > 0) {
    return `Help me complete the missing listing fields for ${buyerProfileSubject(
      preview
    )}: ${fields.join(', ')}.`
  }
  return `Help me get the buyer profile ready for ${buyerProfileSubject(preview)}.`
}

function bootstrapSubject(bootstrap: BelgianCompanyBootstrap) {
  if (bootstrap.identity?.legalName) return bootstrap.identity.legalName
  if (bootstrap.identity?.kboNumber) return `KBO ${bootstrap.identity.kboNumber}`
  return 'this company'
}

function buildBelgianBootstrapActions(
  bootstrap: BelgianCompanyBootstrap,
  ca: ChatAssistantTranslator
): FollowUpAction[] {
  const subject = bootstrapSubject(bootstrap)
  const isBlocked = bootstrap.status === 'blocked' || bootstrap.status === 'failed'
  if (isBlocked) {
    return [
      {
        label: ca('proposalCards.belgianBootstrap.resolveGapsAction'),
        prompt: `Help me bootstrap ${subject} from KBO/NBB public data and resolve the data gaps.`,
        primary: true,
      },
    ]
  }
  return [
    {
      label: ca('proposalCards.belgianBootstrap.createClientAction'),
      prompt: `Create an advisor client for ${subject} from this KBO/NBB public-data bootstrap.`,
      primary: true,
    },
    {
      label: ca('proposalCards.belgianBootstrap.connectAccountingAction'),
      prompt: `Connect accounting data for ${subject} and continue onboarding.`,
    },
    {
      label: ca('proposalCards.belgianBootstrap.startValuationAction'),
      prompt: `Start a valuation for ${subject} using the public data, then ask me for any missing inputs.`,
    },
  ]
}

function clientReadinessSubject(readiness: ClientDataReadinessPreview) {
  if (readiness.businessName) return readiness.businessName
  if (readiness.clientId) return `client ${readiness.clientId}`
  return 'this client'
}

function buildClientDataReadinessActions(
  readiness: ClientDataReadinessPreview,
  ca: ChatAssistantTranslator
): FollowUpAction[] {
  const subject = clientReadinessSubject(readiness)
  const needsReview =
    readiness.status === 'needs_import_review' ||
    readiness.recommendedNextTool === 'open_import_review'
  const isReady = readiness.status === 'ready_for_valuation'
  if (needsReview) {
    return [
      {
        label: ca('proposalCards.clientDataReadiness.openReviewAction'),
        prompt: `Open the import review for ${subject} and walk me through the accounting flags.`,
        primary: true,
      },
      {
        label: ca('proposalCards.clientDataReadiness.resolveDataAction'),
        prompt: `Help me resolve client data readiness for ${subject}.`,
      },
    ]
  }
  if (isReady) {
    return [
      {
        label: ca('proposalCards.clientDataReadiness.startValuationAction'),
        prompt: `Start a valuation for ${subject} using the synced accounting data.`,
        primary: true,
      },
      {
        label: ca('proposalCards.clientDataReadiness.resolveDataAction'),
        prompt: `Review client data readiness for ${subject} before valuation.`,
      },
    ]
  }
  return [
    {
      label: ca('proposalCards.clientDataReadiness.connectAccountingAction'),
      prompt: `Help me connect or import accounting data for ${subject}.`,
      primary: true,
    },
    {
      label: ca('proposalCards.clientDataReadiness.enterFiguresAction'),
      prompt: `Enter financials manually for ${subject}: revenue + EBITDA by fiscal year.`,
    },
    {
      label: ca('proposalCards.clientDataReadiness.resolveDataAction'),
      prompt: `Help me resolve client data readiness for ${subject}.`,
    },
  ]
}

function methodReadinessSubject(preview: MethodReadinessPreview) {
  if (preview.businessName) return preview.businessName
  if (preview.reportId) return `valuation report ${preview.reportId}`
  return 'this valuation'
}

function methodsForPrompt(methods: string[]) {
  const names = methods.map(formatMethodName).filter(Boolean).slice(0, 6)
  return names.length > 0 ? names.join(', ') : 'the available methods'
}

function buildMethodReadinessActions(
  preview: MethodReadinessPreview,
  ca: ChatAssistantTranslator
): FollowUpAction[] {
  const subject = methodReadinessSubject(preview)
  if (preview.status === 'blocked') {
    return [
      {
        label: ca('proposalCards.methodReadiness.resolveAction'),
        prompt: `Help me resolve valuation-method readiness for ${subject}.`,
        primary: true,
      },
      {
        label: ca('proposalCards.methodReadiness.explainAction'),
        prompt: `Explain the valuation-method readiness for ${subject} and recommend the next best method.`,
      },
    ]
  }

  const actions: FollowUpAction[] = []
  if (preview.readyMethods.length > 0) {
    actions.push({
      label: ca('proposalCards.methodReadiness.runReadyAction'),
      prompt: `Run the ready valuation methods for ${subject}: ${methodsForPrompt(
        preview.readyMethods
      )}.`,
      primary: true,
    })
  }
  if (preview.blockedMethods.length > 0) {
    actions.push({
      label: ca('proposalCards.methodReadiness.unlockMethodsAction'),
      prompt: `Help me unlock these valuation methods for ${subject}: ${methodsForPrompt(
        preview.blockedMethods
      )}.`,
    })
  }
  actions.push({
    label: ca('proposalCards.methodReadiness.explainAction'),
    prompt: `Explain the valuation-method readiness for ${subject} and recommend the next best method.`,
  })
  return actions
}

function FollowUpButtons({
  actions,
  onSendFollowUp,
}: {
  actions: FollowUpAction[]
  onSendFollowUp?: (content: string) => void
}) {
  if (typeof onSendFollowUp !== 'function' || actions.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
      {actions.map((action) => (
        <button
          key={`${action.label}-${action.prompt}`}
          type="button"
          onClick={() => onSendFollowUp(action.prompt)}
          className={cn(
            'transition-colors',
            action.primary
              ? 'font-medium text-primary/85 hover:text-primary'
              : 'text-foreground/55 hover:text-foreground/75'
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

function advisoryTone({ blocked, ready }: { blocked?: boolean; ready?: boolean }): FormCardTone {
  if (blocked) return 'warning'
  if (ready) return 'success'
  return 'idle'
}

export function ChatAssistantAdvisoryPreviewCards({
  message,
  onSendFollowUp,
}: ChatAssistantAdvisoryPreviewCardsProps) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'

  return (
    <>
      {/* Belgian public-data bootstrap — read-only KBO/NBB context before data connection. */}
      {message.belgianCompanyBootstraps && message.belgianCompanyBootstraps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.belgianCompanyBootstraps.map((bootstrap) => {
            const isBlocked = bootstrap.status === 'blocked' || bootstrap.status === 'failed'
            const fmtEuros = (value: number | null | undefined) =>
              value != null && Number.isFinite(Number(value))
                ? `€${Number(value).toLocaleString(currencyLocale)}`
                : null
            const summaryBits: string[] = []
            if (bootstrap.identity?.legalName) summaryBits.push(bootstrap.identity.legalName)
            if (bootstrap.identity?.kboNumber) summaryBits.push(bootstrap.identity.kboNumber)
            if (bootstrap.identity?.city) summaryBits.push(bootstrap.identity.city)
            if (!isBlocked && bootstrap.filingSummary?.filingYear) {
              summaryBits.push(
                ca('proposalCards.belgianBootstrap.filingYear', {
                  year: bootstrap.filingSummary.filingYear,
                })
              )
            }
            const revenue = fmtEuros(bootstrap.filingSummary?.revenue)
            const ebitda = fmtEuros(bootstrap.filingSummary?.ebitda)
            const equity = fmtEuros(bootstrap.valuationPreview?.equityMid)
            if (revenue)
              summaryBits.push(`${ca('proposalCards.valuation.labelRevenue')} ${revenue}`)
            if (ebitda) summaryBits.push(`EBITDA ${ebitda}`)
            if (equity)
              summaryBits.push(`${ca('proposalCards.belgianBootstrap.equityPreview')} ${equity}`)
            const followUpActions = buildBelgianBootstrapActions(bootstrap, ca)

            return (
              <motion.div
                key={bootstrap.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.belgianBootstrap.titleBlocked')
                    : ca('proposalCards.belgianBootstrap.titleReady')}
                </p>
                {bootstrap.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{bootstrap.message}</p>
                )}
                {summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {!isBlocked && (
                  <div className="mt-2 space-y-1.5">
                    <div className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground/80 truncate">
                          {bootstrap.identity?.legalName ??
                            bootstrap.identity?.kboNumber ??
                            ca('proposalCards.belgianBootstrap.identityTitle')}
                        </span>
                        {bootstrap.identity?.isActive != null && (
                          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                            {bootstrap.identity.isActive
                              ? ca('proposalCards.belgianBootstrap.active')
                              : ca('proposalCards.belgianBootstrap.inactive')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-foreground/55">
                        {bootstrap.identity?.kboNumber && (
                          <span>{bootstrap.identity.kboNumber}</span>
                        )}
                        {bootstrap.identity?.legalForm && (
                          <span>{bootstrap.identity.legalForm}</span>
                        )}
                        {bootstrap.identity?.city && <span>{bootstrap.identity.city}</span>}
                        {bootstrap.identity?.naceDescription && (
                          <span>{bootstrap.identity.naceDescription}</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
                        <p className="text-[10px] font-medium uppercase text-foreground/35">
                          {ca('proposalCards.belgianBootstrap.filingTitle')}
                        </p>
                        <p className="mt-0.5 text-foreground/65 leading-snug">
                          {bootstrap.filingSummary?.filingYear
                            ? ca('proposalCards.belgianBootstrap.filingYear', {
                                year: bootstrap.filingSummary.filingYear,
                              })
                            : ca('proposalCards.belgianBootstrap.noFiling')}
                        </p>
                        {bootstrap.filingSummary?.dataHealthMessage && (
                          <p className="mt-0.5 text-[10px] text-foreground/45">
                            {bootstrap.filingSummary.dataHealthMessage}
                          </p>
                        )}
                      </div>
                      <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
                        <p className="text-[10px] font-medium uppercase text-foreground/35">
                          {ca('proposalCards.belgianBootstrap.benchmarkTitle')}
                        </p>
                        <p className="mt-0.5 text-foreground/65 leading-snug">
                          {bootstrap.benchmark?.businessTypeTitle ??
                            ca('proposalCards.belgianBootstrap.noBenchmark')}
                        </p>
                        {bootstrap.benchmark?.evEbitdaMedian != null && (
                          <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
                            {Number(bootstrap.benchmark.evEbitdaMedian).toFixed(1)}x
                          </p>
                        )}
                      </div>
                      <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
                        <p className="text-[10px] font-medium uppercase text-foreground/35">
                          {ca('proposalCards.belgianBootstrap.previewTitle')}
                        </p>
                        <p className="mt-0.5 text-foreground/65 leading-snug">
                          {fmtEuros(bootstrap.valuationPreview?.equityMid) ??
                            ca('proposalCards.belgianBootstrap.noPreview')}
                        </p>
                        {bootstrap.valuationPreview?.ebitdaYear && (
                          <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
                            EBITDA {bootstrap.valuationPreview.ebitdaYear}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <FollowUpButtons actions={followUpActions} onSendFollowUp={onSendFollowUp} />
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Client-data readiness — Hermes checkpoint before valuation handoff. */}
      {message.clientDataReadinessPreviews && message.clientDataReadinessPreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.clientDataReadinessPreviews.map((readiness) => {
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
                          {flag.message && (
                            <p className="mt-0.5 text-foreground/55">{flag.message}</p>
                          )}
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
      )}

      {/* Method-readiness previews — read-only ValuationIQ method coverage. */}
      {message.methodReadinessPreviews && message.methodReadinessPreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.methodReadinessPreviews.map((preview) => {
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
      )}

      {/* Listing previews — read-only anonymized marketplace draft. */}
      {message.listingPreviews && message.listingPreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.listingPreviews.map((listingPreview) => {
            const isBlocked = listingPreview.status === 'blocked'
            const preview = listingPreview.preview
            const summaryBits: string[] = []
            if (preview?.title) summaryBits.push(preview.title)
            else if (listingPreview.sourceBusinessName)
              summaryBits.push(listingPreview.sourceBusinessName)
            if (preview?.sector) summaryBits.push(preview.sector)
            else if (preview?.industry) summaryBits.push(preview.industry)
            if (preview?.region) summaryBits.push(preview.region)
            else if (preview?.province) summaryBits.push(preview.province)
            if (preview?.revenueRange) summaryBits.push(preview.revenueRange)
            if (preview?.employeeRange) summaryBits.push(preview.employeeRange)
            if (!isBlocked && listingPreview.missingFields?.length) {
              summaryBits.push(
                ca('proposalCards.listingPreview.missingPrefix', {
                  fields: listingPreview.missingFields.join(', '),
                })
              )
            }
            const canContinue = typeof onSendFollowUp === 'function'
            const subject = listingSubject(listingPreview)

            return (
              <motion.div
                key={listingPreview.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.listingPreview.titleBlocked')
                    : ca('proposalCards.listingPreview.titleReady')}
                </p>
                {listingPreview.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{listingPreview.message}</p>
                )}
                {summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {!isBlocked && preview && (
                  <div className="mt-2 rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground/80 truncate">
                        {preview.title ??
                          listingPreview.sourceBusinessName ??
                          ca('proposalCards.listingPreview.untitled')}
                      </span>
                      <div className="shrink-0 flex items-center gap-1">
                        {preview.hasVerifiedValuation && (
                          <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] text-success/90">
                            {ca('proposalCards.listingPreview.verified')}
                          </span>
                        )}
                        {preview.ndaRequired && (
                          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                            {ca('proposalCards.listingPreview.nda')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-foreground/55">
                      {preview.businessType && <span>{preview.businessType}</span>}
                      {preview.sector && <span>{preview.sector}</span>}
                      {preview.region && <span>{preview.region}</span>}
                      {preview.revenueRange && <span>{preview.revenueRange}</span>}
                      {preview.employeeRange && <span>{preview.employeeRange}</span>}
                    </div>
                  </div>
                )}
                {canContinue && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    {isBlocked ? (
                      <button
                        type="button"
                        onClick={() => onSendFollowUp(buildListingGapPrompt(listingPreview))}
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('proposalCards.listingPreview.resolveGapsAction')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSendFollowUp(`Profile likely buyers for ${subject}.`)}
                          className="text-primary/85 hover:text-primary transition-colors font-medium"
                        >
                          {ca('proposalCards.listingPreview.profileBuyersAction')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSendFollowUp(
                              `Prepare a private marketplace listing draft for ${subject}.`
                            )
                          }
                          className="text-foreground/55 hover:text-foreground/75 transition-colors"
                        >
                          {ca('proposalCards.listingPreview.createDraftAction')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Buyer-profile previews — read-only bridge before listing approval. */}
      {message.buyerProfilePreviews && message.buyerProfilePreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.buyerProfilePreviews.map((preview) => {
            const isBlocked = preview.status === 'blocked'
            const missing = preview.listingReadiness?.missingFields ?? []
            const summaryBits: string[] = []
            if (preview.sourceBusinessName) summaryBits.push(preview.sourceBusinessName)
            if (!isBlocked && preview.buyerSegments?.length) {
              summaryBits.push(
                ca('proposalCards.buyerProfile.segmentCount', {
                  count: preview.buyerSegments.length,
                })
              )
            }
            if (!isBlocked) {
              summaryBits.push(
                missing.length > 0
                  ? ca('proposalCards.buyerProfile.missingPrefix', {
                      fields: missing.join(', '),
                    })
                  : ca('proposalCards.buyerProfile.ready')
              )
            }
            const canContinue = typeof onSendFollowUp === 'function'
            const hasListingGaps = isBlocked || missing.length > 0
            const subject = buyerProfileSubject(preview)

            return (
              <motion.div
                key={preview.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.buyerProfile.titleBlocked')
                    : ca('proposalCards.buyerProfile.titleReady')}
                </p>
                {preview.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{preview.message}</p>
                )}
                {summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {!isBlocked && preview.buyerSegments && preview.buyerSegments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {preview.buyerSegments.slice(0, 3).map((segment) => (
                      <div
                        key={segment.id ?? segment.label}
                        className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground/80 truncate">
                            {segment.label}
                          </span>
                          {segment.fitScore != null && (
                            <span className="shrink-0 font-mono text-foreground/45">
                              {segment.fitScore}/100
                            </span>
                          )}
                        </div>
                        {segment.recommendedAngle && (
                          <p className="mt-0.5 text-foreground/55">{segment.recommendedAngle}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canContinue && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        onSendFollowUp(
                          hasListingGaps
                            ? buildBuyerProfileGapPrompt(preview)
                            : `Prepare a private marketplace listing draft for ${subject}.`
                        )
                      }
                      className="text-primary/85 hover:text-primary transition-colors font-medium"
                    >
                      {hasListingGaps
                        ? ca('proposalCards.buyerProfile.resolveGapsAction')
                        : ca('proposalCards.buyerProfile.createListingAction')}
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Business-type picker — sector/NACE/catalogue shortlist. Click a row to
            send a follow-up so the agent can use the selected type for
            benchmarks, method readiness, profile completion, or valuation. */}
      {message.businessTypeSearchResults && message.businessTypeSearchResults.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.businessTypeSearchResults.map((picker) => {
            const hasResults = picker.results.length > 0
            const isFailed = picker.status === 'failed'
            const countLabel = !hasResults
              ? picker.query.length > 0
                ? `No business types found for "${picker.query}"`
                : 'No business types found'
              : picker.totalFound === 1
                ? `Found ${picker.totalFound} business type for "${picker.query}"`
                : `Found ${picker.totalFound} business types for "${picker.query}"`
            return (
              <motion.div
                key={picker.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground font-medium">Business type catalogue</p>
                <p className="text-foreground/55 text-xs mt-0.5">{countLabel}</p>
                {isFailed && (
                  <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                    {picker.error ?? 'The business-type catalogue is temporarily unavailable.'}
                  </p>
                )}
                {!isFailed && picker.note && (
                  <p className="text-foreground/55 text-xs italic mt-1">{picker.note}</p>
                )}
                {hasResults && (
                  <div className="mt-2 space-y-1">
                    {picker.results.slice(0, 10).map((result) => {
                      const taxonomy = [result.sector, result.industry, result.category]
                        .filter(Boolean)
                        .join(' · ')
                      const methods = (result.preferredMultiples ?? []).slice(0, 3).join(', ')
                      const benchmarkHint =
                        result.benchmarkStatus === 'resolver_required'
                          ? 'Multiples require benchmark resolver'
                          : result.benchmarkMessage
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            if (typeof onSendFollowUp !== 'function') return
                            onSendFollowUp(`Use business type ${result.title} (${result.id})`)
                          }}
                          disabled={typeof onSendFollowUp !== 'function'}
                          className="w-full text-left rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus:outline-none focus:bg-foreground/[0.06] transition-colors disabled:cursor-default disabled:opacity-70 disabled:hover:bg-foreground/[0.035]"
                          aria-label={`Use business type ${result.title}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground/85 truncate">
                              {result.title}
                            </span>
                            <span className="shrink-0 font-mono text-foreground/55">
                              {result.id}
                            </span>
                          </div>
                          {taxonomy && (
                            <p className="mt-0.5 text-foreground/55 truncate">{taxonomy}</p>
                          )}
                          {result.description && (
                            <p className="mt-1 text-foreground/60 line-clamp-2">
                              {result.description}
                            </p>
                          )}
                          {(methods || benchmarkHint) && (
                            <p className="mt-1 text-foreground/45 truncate">
                              {[methods, benchmarkHint].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Registry-search picker — KBO/KVK hit list. Click a row to fire a
            follow-up "Use {name} ({registry} {number})" message so the agent
            can chain to bootstrap_belgian_company or create_client without
            the user re-typing the company. Mirrors Mercury's
            RegistrySearchResultsCard. */}
      {message.registrySearchResults && message.registrySearchResults.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.registrySearchResults.map((picker) => {
            const isFailed =
              picker.status === 'failed' || picker.coverageWarning === 'upstream_degraded'
            const isMissing = picker.coverageWarning === 'kvk_not_in_dataset'
            const hasHits = picker.hits.length > 0
            const heading =
              picker.registry === 'KVK' ? 'Dutch KVK registry' : 'Belgian KBO registry'
            const countLabel = !hasHits
              ? picker.query.length > 0
                ? `No matches found for "${picker.query}"`
                : 'No matches found'
              : picker.totalFound === 1
                ? `Found ${picker.totalFound} match for "${picker.query}"`
                : `Found ${picker.totalFound} matches for "${picker.query}"`
            const formatNumber = (num: string) => {
              if (picker.registry === 'KBO' && /^\d{10}$/.test(num)) {
                return `${num.slice(0, 4)}.${num.slice(4, 7)}.${num.slice(7, 10)}`
              }
              return num
            }
            return (
              <motion.div
                key={picker.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground font-medium">{heading}</p>
                <p className="text-foreground/55 text-xs mt-0.5">{countLabel}</p>
                {isFailed && (
                  <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                    The registry was temporarily unavailable. Try the company number directly, or
                    retry in a moment.
                  </p>
                )}
                {isMissing && (
                  <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                    Not in Overheid.io&apos;s public-data mirror. Verify the KVK number — about 4%
                    of Handelsregister entries fall in this gap.
                  </p>
                )}
                {hasHits && (
                  <div className="mt-2 space-y-1">
                    {picker.hits.slice(0, 10).map((hit) => {
                      const sector = hit.businessTypeTitle ?? hit.naceDescription ?? null
                      const location = hit.city
                        ? hit.postalCode
                          ? `${hit.postalCode} ${hit.city}`
                          : hit.city
                        : null
                      const display = formatNumber(hit.companyNumber)
                      return (
                        <button
                          key={`${picker.registry}-${hit.companyNumber}`}
                          type="button"
                          onClick={() => {
                            if (typeof onSendFollowUp !== 'function') return
                            const ref = `${picker.registry} ${hit.companyNumber}`
                            onSendFollowUp(`Use ${hit.companyName} (${ref})`)
                          }}
                          disabled={typeof onSendFollowUp !== 'function'}
                          className="w-full text-left rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus:outline-none focus:bg-foreground/[0.06] transition-colors disabled:cursor-default disabled:opacity-70 disabled:hover:bg-foreground/[0.035]"
                          aria-label={`Use ${hit.companyName}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground/85 truncate">
                              {hit.companyName}
                              {hit.legalForm && (
                                <span className="text-foreground/55 font-normal">
                                  {' '}
                                  · {hit.legalForm}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-foreground/55">{display}</span>
                          </div>
                          {(location || sector) && (
                            <p className="mt-0.5 text-foreground/55 truncate">
                              {[location, sector].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}
