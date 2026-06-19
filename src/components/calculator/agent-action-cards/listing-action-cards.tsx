'use client'

import { Eye, EyeOff, Pin, Share2, ShieldX } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import type {
  ListingFieldUpdateRequest,
  ListingVisibilityRequest,
  NormalizationDismissRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  ValuationMethodPreferenceRequest,
} from '../ChatAssistantTypes'
import {
  buildAgentToolActionHeaders,
  buildShareUrl,
  clampNumber,
  compactParts,
  DEFAULT_SHARE_TOKEN_EXPIRES_DAYS,
  extractErrorMessage,
  fallbackMethodLabel,
  InlineActionCard,
  listingSettingsPath,
  MAX_SHARE_TOKEN_EXPIRES_DAYS,
  MAX_SHARE_TOKEN_USES,
  MIN_SHARE_TOKEN_EXPIRES_DAYS,
  MIN_SHARE_TOKEN_USES,
  openInNewTab,
} from './shared'

export function ListingVisibilityCard({ request }: { request: ListingVisibilityRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const targetIsPublic = request.visibility === 'public'

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.listingVisibilityBlocked')
          : targetIsPublic
            ? ca('proposalCards.agent.listingVisibilityPublic')
            : ca('proposalCards.agent.listingVisibilityPrivate')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([request.businessName, request.visibility])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={targetIsPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.listingVisibilityAction')}
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.listingId) throw new Error(ca('proposalCards.agent.missingListing'))
              if (!request.visibility) throw new Error(ca('proposalCards.agent.missingVisibility'))
              const response = await fetch(
                `/api/listings/${encodeURIComponent(request.listingId)}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_listing_visibility', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ visibility: request.visibility }),
                }
              )
              if (response.status === 404) {
                openInNewTab(listingSettingsPath(locale, request.listingId, 'visibility'))
                return
              }
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function ShareTokenCard({ request }: { request: ShareTokenRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const [expiresInDays, setExpiresInDays] = useState(
    clampNumber(
      request.expiresInDays ?? DEFAULT_SHARE_TOKEN_EXPIRES_DAYS,
      MIN_SHARE_TOKEN_EXPIRES_DAYS,
      MAX_SHARE_TOKEN_EXPIRES_DAYS
    )
  )
  const [maxUsesText, setMaxUsesText] = useState(
    typeof request.maxUses === 'number' ? String(request.maxUses) : ''
  )
  const [label, setLabel] = useState(request.label ?? '')
  const [mintedUrl, setMintedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.shareTokenBlocked')
          : request.businessName
            ? ca('proposalCards.agent.shareTokenTitleWithName', { name: request.businessName })
            : ca('proposalCards.agent.shareTokenTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([
        ca('proposalCards.agent.shareTokenExpires', { count: expiresInDays }),
        maxUsesText.trim()
          ? ca('proposalCards.agent.shareTokenMaxUses', { count: Number(maxUsesText) || 0 })
          : ca('proposalCards.agent.shareTokenUnlimited'),
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<Share2 className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.shareTokenAction')}
      actionSuccessLabel={ca('proposalCards.agent.shareTokenMinted')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.listingId) throw new Error(ca('proposalCards.agent.missingListing'))
              const rawMaxUses = maxUsesText.trim().length > 0 ? Number(maxUsesText) : null
              const body: Record<string, unknown> = { expiresInDays }
              if (rawMaxUses !== null) {
                body.maxUses = clampNumber(rawMaxUses, MIN_SHARE_TOKEN_USES, MAX_SHARE_TOKEN_USES)
              }
              const trimmedLabel = label.trim()
              if (trimmedLabel.length > 0) body.label = trimmedLabel
              const response = await fetch(
                `/api/listings/${encodeURIComponent(request.listingId)}/share-tokens`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_share_token', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify(body),
                }
              )
              if (response.status === 404) {
                openInNewTab(listingSettingsPath(locale, request.listingId, 'share-token'))
                return
              }
              const json = (await response.json().catch(() => ({}))) as {
                success?: boolean
                data?: { token?: string }
                message?: string
                error?: string
              }
              if (!response.ok || !json.data?.token) {
                throw new Error(extractErrorMessage(json, response.status))
              }
              setMintedUrl(buildShareUrl(request.listingId, json.data.token))
            }
      }
    >
      {!isBlocked && !mintedUrl && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">
              {ca('proposalCards.agent.shareTokenDaysLabel')}
            </span>
            <input
              type="number"
              min={MIN_SHARE_TOKEN_EXPIRES_DAYS}
              max={MAX_SHARE_TOKEN_EXPIRES_DAYS}
              value={expiresInDays}
              onChange={(event) =>
                setExpiresInDays(
                  clampNumber(
                    Number(event.target.value),
                    MIN_SHARE_TOKEN_EXPIRES_DAYS,
                    MAX_SHARE_TOKEN_EXPIRES_DAYS
                  )
                )
              }
              className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">
              {ca('proposalCards.agent.shareTokenUsesLabel')}
            </span>
            <input
              type="number"
              min={MIN_SHARE_TOKEN_USES}
              max={MAX_SHARE_TOKEN_USES}
              value={maxUsesText}
              placeholder={ca('proposalCards.agent.shareTokenUnlimited')}
              onChange={(event) => setMaxUsesText(event.target.value)}
              className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs"
            />
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">
              {ca('proposalCards.agent.shareTokenLabel')}
            </span>
            <input
              value={label}
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs"
            />
          </label>
        </div>
      )}
      {mintedUrl && (
        <div className="mt-2 space-y-2">
          <input
            readOnly
            value={mintedUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-success/20 bg-success/5 px-2 py-1.5 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(mintedUrl).catch(() => undefined)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            }}
            className="text-xs font-medium text-primary/85 hover:text-primary"
          >
            {copied
              ? ca('proposalCards.agent.shareTokenCopied')
              : ca('proposalCards.agent.shareTokenCopy')}
          </button>
        </div>
      )}
    </InlineActionCard>
  )
}

export function ShareTokenRevokeCard({ request }: { request: ShareTokenRevokeRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.shareTokenRevokeBlocked')
          : ca('proposalCards.agent.shareTokenRevokeTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([request.businessName, request.tokenLabel, request.tokenHint])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<ShieldX className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.shareTokenRevokeAction')}
      actionSuccessLabel={ca('proposalCards.agent.shareTokenRevoked')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.listingId) throw new Error(ca('proposalCards.agent.missingListing'))
              if (!request.tokenId) throw new Error(ca('proposalCards.agent.missingToken'))
              const response = await fetch(
                `/api/listings/${encodeURIComponent(
                  request.listingId
                )}/share-tokens/${encodeURIComponent(request.tokenId)}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_share_token_revoke', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({}),
                }
              )
              if (response.status === 404) {
                openInNewTab(listingSettingsPath(locale, request.listingId, 'share-token'))
                return
              }
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function ValuationMethodPreferenceCard({
  request,
}: {
  request: ValuationMethodPreferenceRequest
}) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const isClear = request.method === null
  const methodLabel =
    typeof request.method === 'string' ? fallbackMethodLabel(request.method) : null

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.valuationMethodPreferenceBlocked')
          : isClear
            ? request.businessName
              ? ca('proposalCards.agent.valuationMethodPreferenceClearWithName', {
                  name: request.businessName,
                })
              : ca('proposalCards.agent.valuationMethodPreferenceClear')
            : methodLabel && request.businessName
              ? ca('proposalCards.agent.valuationMethodPreferencePinWithName', {
                  method: methodLabel,
                  name: request.businessName,
                })
              : methodLabel
                ? ca('proposalCards.agent.valuationMethodPreferencePin', { method: methodLabel })
                : ca('proposalCards.agent.valuationMethodPreferenceTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([
        request.businessName,
        isClear ? ca('proposalCards.agent.valuationMethodPreferenceDefault') : methodLabel,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isClear
          ? ca('proposalCards.agent.valuationMethodPreferenceClearAction')
          : ca('proposalCards.agent.valuationMethodPreferencePinAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.clientId) throw new Error(ca('proposalCards.agent.missingClient'))
              if (request.method === undefined) {
                throw new Error(ca('proposalCards.agent.missingMethod'))
              }
              const response = await fetch(
                `/api/accountants/clients/${encodeURIComponent(
                  request.clientId
                )}/valuation-method-preference`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders(
                      'propose_valuation_method_preference',
                      request.id
                    ),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ value: request.method }),
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function NormalizationDismissCard({ request }: { request: NormalizationDismissRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const isInvalid = !isBlocked && (!request.reportId || !request.adjustmentId)

  const metaParts: string[] = []
  if (request.category)
    metaParts.push(
      ca('proposalCards.agent.normalizationDismissCategory', {
        category: request.category,
      })
    )
  if (typeof request.amount === 'number') {
    const sign = request.amount > 0 ? '+' : ''
    metaParts.push(
      ca('proposalCards.agent.normalizationDismissAmount', {
        value: `${sign}${request.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      })
    )
  }

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.normalizationDismissBlocked')
          : ca('proposalCards.agent.normalizationDismissTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={isBlocked ? undefined : compactParts(metaParts)}
      tone={isBlocked || isInvalid ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isInvalid ? undefined : ca('proposalCards.agent.normalizationDismissAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.normalizationDismissRemoved')}
      onAction={
        isBlocked || isInvalid || !request.reportId || !request.adjustmentId
          ? undefined
          : async () => {
              const response = await fetch(
                `/api/valuations/${encodeURIComponent(
                  request.reportId as string
                )}/adjustments/${encodeURIComponent(request.adjustmentId as string)}`,
                {
                  method: 'DELETE',
                  headers: {
                    ...buildAgentToolActionHeaders('propose_normalization_dismiss', request.id),
                  },
                  credentials: 'include',
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function ListingFieldUpdateCard({ request }: { request: ListingFieldUpdateRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const change = request.change ?? {}
  const proposedKeys = Object.keys(change).filter((k) =>
    ['title', 'summary', 'description', 'asking_price'].includes(k)
  )
  const isEmpty = !isBlocked && (proposedKeys.length === 0 || !request.listingId)
  const metaParts: string[] = []

  if ('title' in change) {
    const v = change.title
    metaParts.push(
      v === null
        ? ca('proposalCards.agent.listingFieldUpdateTitleCleared')
        : ca('proposalCards.agent.listingFieldUpdateTitleSet', {
            value: typeof v === 'string' ? v.slice(0, 40) : '',
          })
    )
  }
  if ('asking_price' in change) {
    const v = change.asking_price
    metaParts.push(
      v === null
        ? ca('proposalCards.agent.listingFieldUpdatePriceCleared')
        : ca('proposalCards.agent.listingFieldUpdatePriceSet', {
            value:
              typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '',
          })
    )
  }
  if ('summary' in change) metaParts.push(ca('proposalCards.agent.listingFieldUpdateSummary'))
  if ('description' in change)
    metaParts.push(ca('proposalCards.agent.listingFieldUpdateDescription'))

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.listingFieldUpdateBlocked')
          : ca('proposalCards.agent.listingFieldUpdateTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={isBlocked ? undefined : compactParts(metaParts)}
      tone={isBlocked || isEmpty ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isEmpty ? undefined : ca('proposalCards.agent.listingFieldUpdateAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked || isEmpty || !request.listingId
          ? undefined
          : async () => {
              const response = await fetch(
                `/api/listings/${encodeURIComponent(request.listingId as string)}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_listing_field_update', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify(change),
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}
