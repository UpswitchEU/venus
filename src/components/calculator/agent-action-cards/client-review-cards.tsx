'use client'

import { useLocale, useTranslations } from 'next-intl'
import type {
  ClientCreateRequest,
  ImportReviewRequest,
  ValuationSessionRequest,
} from '../ChatAssistantTypes'
import {
  compactParts,
  InlineActionCard,
  inferRegistryCountryFromCompanyNumber,
  mercuryPath,
  openInNewTab,
  venusValuationSessionPath,
} from './shared'

export function ClientCreateCard({ request }: { request: ClientCreateRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const companyNumber =
    typeof request.companyNumber === 'string' ? request.companyNumber.trim() : ''
  const isMissingCompanyNumber = !isBlocked && !companyNumber
  const isActionBlocked = isBlocked || isMissingCompanyNumber

  return (
    <InlineActionCard
      id={request.id}
      title={
        isActionBlocked
          ? ca('proposalCards.agent.clientCreateBlocked')
          : ca('proposalCards.agent.clientCreateTitle')
      }
      detail={
        isBlocked
          ? (request.message ?? request.reason)
          : isMissingCompanyNumber
            ? ca('proposalCards.agent.missingCompanyNumber')
            : request.message
      }
      meta={compactParts([
        request.businessName,
        companyNumber,
        request.industry,
        request.location,
        request.customerEmail,
      ])}
      tone={isActionBlocked ? 'blocked' : 'default'}
      actionLabel={ca('proposalCards.agent.clientCreateAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        isActionBlocked
          ? undefined
          : () => {
              const country = inferRegistryCountryFromCompanyNumber(companyNumber)
              openInNewTab(
                mercuryPath(locale, '/advisor/clients/create', {
                  kbo: companyNumber,
                  name: request.businessName,
                  country,
                  email: request.customerEmail,
                  source: 'venus-ai',
                })
              )
            }
      }
    />
  )
}

export function ValuationSessionCard({ request }: { request: ValuationSessionRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const synced = request.hasSyncedFinancials ? ca('proposalCards.agent.syncedFinancials') : null
  const clientId = request.clientId

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.valuationSessionBlocked')
          : ca('proposalCards.agent.valuationSessionTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : request.message}
      meta={compactParts([
        request.businessName ?? undefined,
        request.customerEmail ?? undefined,
        synced,
        request.latestValuationId ? ca('proposalCards.agent.hasPriorValuation') : null,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      actionLabel={ca('proposalCards.agent.valuationSessionAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        !isBlocked && clientId
          ? () => {
              if (typeof window !== 'undefined') {
                window.location.href = venusValuationSessionPath(locale, clientId)
              }
            }
          : undefined
      }
    />
  )
}

export function ImportReviewCard({ request }: { request: ImportReviewRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const providers = (request.accountingSources ?? [])
    .map((source) => source.provider)
    .filter(Boolean)
    .slice(0, 3)
  const flagCount =
    request.actionableFlagCount && request.actionableFlagCount > 0
      ? ca('proposalCards.agent.flagCount', { count: request.actionableFlagCount })
      : null
  const topFlags = request.topFlags ?? []

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.importReviewBlocked')
          : ca('proposalCards.agent.importReviewTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : request.message}
      meta={compactParts([
        request.businessName ?? undefined,
        providers.join(', '),
        flagCount,
        request.stpStatus ?? undefined,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      actionLabel={ca('proposalCards.agent.importReviewAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        !isBlocked && request.clientId
          ? () =>
              openInNewTab(
                mercuryPath(locale, '/advisor/import-review', {
                  clientId: request.clientId,
                  source: 'venus-ai',
                })
              )
          : undefined
      }
    >
      {topFlags.length > 0 && (
        <div className="mt-2 space-y-1">
          {topFlags.slice(0, 3).map((flag, index) => (
            <div
              key={`${flag.year ?? 'year'}-${flag.code ?? flag.field ?? index}`}
              className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground/75 truncate">
                  {flag.code ?? flag.field ?? ca('proposalCards.clientDataReadiness.flagsLabel')}
                </span>
                {flag.severity && (
                  <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                    {flag.severity}
                  </span>
                )}
              </div>
              {flag.message && (
                <p className="mt-0.5 text-foreground/55" lang={locale}>
                  {flag.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </InlineActionCard>
  )
}
