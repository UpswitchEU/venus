'use client'

import { AlertTriangle, Pin } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type {
  AcknowledgeWarningRequest,
  BulkValuationRunRequest,
  ValuationDefaultsPreview,
  ValuationDefaultsRequest,
  WorkspaceClientsPreview,
} from '../ChatAssistantTypes'
import {
  buildAgentToolActionHeaders,
  compactParts,
  extractErrorMessage,
  InlineActionCard,
  mercuryPath,
  openInNewTab,
} from './shared'

export function BulkValuationRunCard({ request }: { request: BulkValuationRunRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const count = request.clientCount ?? request.clientIds?.length ?? 0
  const credits = request.estimatedCredits ?? count * 5
  const isInvalid = !request.clientIds || request.clientIds.length === 0

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.bulkValuationRunBlocked')
          : count === 1
            ? ca('proposalCards.agent.bulkValuationRunTitleSingle')
            : ca('proposalCards.agent.bulkValuationRunTitle', { count: String(count) })
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={compactParts([
        ca('proposalCards.agent.bulkValuationRunCount', { count: String(count) }),
        ca('proposalCards.agent.bulkValuationRunCredits', { credits: String(credits) }),
        typeof request.rejectedCount === 'number' && request.rejectedCount > 0
          ? ca('proposalCards.agent.bulkValuationRunRejected', {
              count: String(request.rejectedCount),
            })
          : null,
      ])}
      tone={isBlocked || isInvalid ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isInvalid ? undefined : ca('proposalCards.agent.bulkValuationRunAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.bulkValuationRunStarted')}
      onAction={
        isBlocked || isInvalid || !request.clientIds
          ? undefined
          : async () => {
              const response = await fetch('/api/valuations/bulk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...buildAgentToolActionHeaders('propose_bulk_valuation_run', request.id),
                },
                credentials: 'include',
                body: JSON.stringify({ client_ids: request.clientIds }),
              })
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function ValuationDefaultsCard({ request }: { request: ValuationDefaultsRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const change = request.change ?? {}
  const proposedKeys = Object.keys(change).filter((k) =>
    [
      'multiple_calibration_adjustment',
      'historical_ebitda_weighting_mode',
      'show_enterprise_to_equity_bridge',
    ].includes(k)
  )
  const isEmpty = !isBlocked && proposedKeys.length === 0
  const metaParts: string[] = []

  if ('multiple_calibration_adjustment' in change) {
    const v = change.multiple_calibration_adjustment
    if (v === null) {
      metaParts.push(ca('proposalCards.agent.valuationDefaultsPremiumDefault'))
    } else if (typeof v === 'number') {
      const sign = v > 0 ? '+' : ''
      metaParts.push(
        ca('proposalCards.agent.valuationDefaultsPremium', { value: `${sign}${v.toFixed(2)}` })
      )
    }
  }
  if ('historical_ebitda_weighting_mode' in change) {
    const v = change.historical_ebitda_weighting_mode
    if (v === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingDefault'))
    else if (v === 'weighted')
      metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingWeighted'))
    else metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingStandard'))
  }
  if ('show_enterprise_to_equity_bridge' in change) {
    const v = change.show_enterprise_to_equity_bridge
    if (v === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeDefault'))
    else if (v) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeShow'))
    else metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeHide'))
  }

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.valuationDefaultsBlocked')
          : ca('proposalCards.agent.valuationDefaultsTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={compactParts(metaParts)}
      tone={isBlocked || isEmpty ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isEmpty ? undefined : ca('proposalCards.agent.valuationDefaultsAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked || isEmpty
          ? undefined
          : async () => {
              const response = await fetch('/api/accountants/settings', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...buildAgentToolActionHeaders('propose_valuation_defaults', request.id),
                },
                credentials: 'include',
                body: JSON.stringify(change),
              })
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function WorkspaceClientsPreviewCard({ preview }: { preview: WorkspaceClientsPreview }) {
  const ca = useTranslations('chatAssistant')
  const isFailed = preview.status === 'failed'
  const counts = preview.counts ?? { draft: 0, invited: 0, active: 0 }
  const total = preview.totalClients ?? preview.clients?.length ?? 0
  const metaParts: string[] = [
    ca('proposalCards.agent.workspaceClientsTotal', { count: String(total) }),
    ca('proposalCards.agent.workspaceClientsActive', { count: String(counts.active) }),
    ca('proposalCards.agent.workspaceClientsInvited', { count: String(counts.invited) }),
    ca('proposalCards.agent.workspaceClientsDraft', { count: String(counts.draft) }),
  ]

  if (preview.filter?.status) {
    metaParts.push(
      ca('proposalCards.agent.workspaceClientsFilteredStatus', {
        status: preview.filter.status,
      })
    )
  }
  if (preview.filter?.search) {
    metaParts.push(
      ca('proposalCards.agent.workspaceClientsFilteredSearch', {
        search: preview.filter.search,
      })
    )
  }

  return (
    <InlineActionCard
      id={preview.id}
      title={
        isFailed
          ? ca('proposalCards.agent.workspaceClientsPreviewFailed')
          : ca('proposalCards.agent.workspaceClientsPreviewTitle')
      }
      detail={isFailed ? preview.message : preview.truncated ? preview.message : undefined}
      meta={isFailed ? undefined : compactParts(metaParts)}
      tone={isFailed ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
    />
  )
}

export function ValuationDefaultsPreviewCard({ preview }: { preview: ValuationDefaultsPreview }) {
  const ca = useTranslations('chatAssistant')
  const isFailed = preview.status === 'failed'
  const defaults = preview.defaults ?? {
    multiple_calibration_adjustment: null,
    historical_ebitda_weighting_mode: null,
    show_enterprise_to_equity_bridge: null,
  }
  const adj = defaults.multiple_calibration_adjustment
  const weighting = defaults.historical_ebitda_weighting_mode
  const bridge = defaults.show_enterprise_to_equity_bridge
  const metaParts: string[] = []

  if (adj === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsPremiumDefault'))
  else {
    const sign = adj > 0 ? '+' : ''
    metaParts.push(
      ca('proposalCards.agent.valuationDefaultsPremium', { value: `${sign}${adj.toFixed(2)}` })
    )
  }
  if (weighting === null)
    metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingDefault'))
  else if (weighting === 'weighted')
    metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingWeighted'))
  else metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingStandard'))
  if (bridge === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeDefault'))
  else if (bridge) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeShow'))
  else metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeHide'))

  return (
    <InlineActionCard
      id={preview.id}
      title={
        isFailed
          ? ca('proposalCards.agent.valuationDefaultsPreviewFailed')
          : ca('proposalCards.agent.valuationDefaultsPreviewTitle')
      }
      detail={
        isFailed
          ? preview.message
          : preview.allDefaultsAtSystem
            ? ca('proposalCards.agent.valuationDefaultsPreviewAllSystem')
            : preview.message
      }
      meta={isFailed ? undefined : compactParts(metaParts)}
      tone={isFailed ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
    />
  )
}

export function AcknowledgeWarningCard({ request }: { request: AcknowledgeWarningRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const isCapBreach = request.warningKind === 'cap_breach'
  const canOpenReview = !isBlocked && Boolean(request.code)

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked || !request.code
          ? ca('proposalCards.agent.acknowledgeWarningBlocked')
          : isCapBreach
            ? ca('proposalCards.agent.acknowledgeWarningCapTitle')
            : request.warningKind === 'defensibility'
              ? ca('proposalCards.agent.acknowledgeWarningDefensibilityTitle')
              : ca('proposalCards.agent.acknowledgeWarningTitle')
      }
      detail={
        isBlocked
          ? (request.message ?? request.reason)
          : (request.reason ?? request.message ?? ca('proposalCards.agent.acknowledgeWarningHint'))
      }
      meta={compactParts([
        isCapBreach
          ? ca('proposalCards.agent.acknowledgeWarningKindCap')
          : request.warningKind === 'defensibility'
            ? ca('proposalCards.agent.acknowledgeWarningKindDefensibility')
            : null,
        request.reportId,
      ])}
      tone={isBlocked || !request.code ? 'blocked' : 'default'}
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      actionLabel={canOpenReview ? ca('proposalCards.agent.acknowledgeWarningAction') : undefined}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        canOpenReview
          ? () => {
              openInNewTab(
                mercuryPath(locale, '/advisor/import-review', {
                  source: 'venus-ai',
                  clientId: request.clientId,
                  reportId: request.reportId,
                  warning_code: request.code,
                  warning_kind: request.warningKind,
                })
              )
            }
          : undefined
      }
    >
      {(request.summary || request.code) && (
        <div className="mt-2 rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
          {request.summary && <p className="text-foreground/65">{request.summary}</p>}
          {request.code && (
            <p className="mt-1 font-mono text-[11px] text-foreground/55 break-all">
              {ca('proposalCards.agent.acknowledgeWarningCodeLabel')}: {request.code}
            </p>
          )}
        </div>
      )}
    </InlineActionCard>
  )
}
