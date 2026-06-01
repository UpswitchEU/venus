'use client'

import { BuyerReadyCardShell, type BuyerReadyCardTone } from '@upswitch/ai-dock-shells'
import { motion } from 'framer-motion'
import { Check, FileText, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { cn } from '@/design-system/utils'
import type { BuyerReadyToolCard, ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantBuyerReadyCardsProps {
  message: ChatMessage
  onSendFollowUp?: (content: string) => void
}

type ChatAssistantTranslator = ReturnType<typeof useTranslations>
type FollowUpAction = { label: string; prompt: string; primary?: boolean }

interface BuyerReadyCardFrameProps {
  id: string
  title: string
  detail?: string | null
  meta?: string[]
  tone?: 'default' | 'blocked' | 'success'
  icon?: ReactNode
  actionPrompt?: string
  actionLabel?: string
  followUpActions?: FollowUpAction[]
  onAction?: () => Promise<void> | void
  onSendFollowUp?: (content: string) => void
  children?: ReactNode
}

const AGENT_TOOL_ACTION_NAME_HEADER = 'X-Upswitch-Agent-Tool-Name'

function buildAgentToolActionHeaders(toolName: string): Record<string, string> {
  return { [AGENT_TOOL_ACTION_NAME_HEADER]: toolName }
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
}

function humanize(value?: string | null) {
  if (!value) return null
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatBytes(value?: number) {
  if (!value || !Number.isFinite(value)) return null
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
}

function formatMoney(value: number | null | undefined, currency: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

function safeBuyerReadyPackagePath(value?: string) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/api/') || trimmed.startsWith('//')) return null
  if (trimmed.includes('\n') || trimmed.includes('\r') || trimmed.includes('?')) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed, 'https://valuation.upswitch.app')
  } catch {
    return null
  }
  if (parsed.origin !== 'https://valuation.upswitch.app') return null
  return /^\/api\/valuations\/reports\/[^/]+\/buyer-ready-package$/.test(parsed.pathname)
    ? parsed.pathname
    : null
}

function extractGeneratedEntityId(json: unknown): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const root = json as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null
  const entityId = data?.entityId ?? data?.entity_id ?? root.entityId ?? root.entity_id
  return typeof entityId === 'string' && entityId.trim() ? entityId.trim() : null
}

function extractErrorMessage(json: unknown, status: number): string {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const record = json as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return `HTTP ${status}`
}

function buyerReadyRoomUrl(locale: string, entityId: string) {
  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : 'en'
  return `/${safeLocale}/business/buyer-ready/${encodeURIComponent(entityId)}`
}

function BuyerReadyCardFrame({
  id,
  title,
  detail,
  meta = [],
  tone = 'default',
  icon,
  actionPrompt,
  actionLabel,
  followUpActions = [],
  onAction,
  onSendFollowUp,
  children,
}: BuyerReadyCardFrameProps) {
  const ca = useTranslations('chatAssistant')
  const [decision, setDecision] = useState<'idle' | 'sent' | 'dismissed' | 'submitting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const canAct =
    decision === 'idle' &&
    (typeof onAction === 'function' || (typeof onSendFollowUp === 'function' && actionPrompt))
  const shellTone: BuyerReadyCardTone =
    decision === 'sent'
      ? 'success'
      : decision === 'dismissed'
        ? 'rejected'
        : tone === 'blocked'
          ? 'warning'
          : tone === 'success'
            ? 'success'
            : 'idle'

  const handleAction = async () => {
    if (!canAct) return
    setError(null)
    if (onAction) {
      setDecision('submitting')
      try {
        await onAction()
        setDecision('sent')
      } catch (err) {
        setDecision('idle')
        setError(err instanceof Error ? err.message : ca('proposalCards.buyerReady.failed'))
      }
      return
    }
    if (actionPrompt) {
      onSendFollowUp?.(actionPrompt)
      setDecision('sent')
    }
  }

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <BuyerReadyCardShell
        title={title}
        subtitle={detail}
        tone={shellTone}
        primaryLabel={
          decision === 'idle' && canAct
            ? (actionLabel ?? ca('proposalCards.buyerReady.action'))
            : undefined
        }
        onPrimary={decision === 'idle' && canAct ? handleAction : undefined}
        rejectLabel={
          decision === 'idle' && (actionLabel || canAct)
            ? ca('proposalCards.common.buttonCancel')
            : undefined
        }
        onReject={
          decision === 'idle' && (actionLabel || canAct)
            ? () => setDecision('dismissed')
            : undefined
        }
        isInFlight={decision === 'submitting'}
        successNote={decision === 'sent' ? ca('proposalCards.buyerReady.generated') : undefined}
        rejectedNote={
          decision === 'dismissed' ? ca('proposalCards.common.statusCancelled') : undefined
        }
        errorMessage={error}
      >
        {icon || meta.length > 0 ? (
          <div className="flex items-start gap-2">
            {icon ? <div className="mt-0.5 shrink-0 text-primary/80">{icon}</div> : null}
            {meta.length > 0 ? (
              <p className="text-foreground/55 leading-snug">{meta.join(' · ')}</p>
            ) : null}
          </div>
        ) : null}
        {children}
        {decision === 'submitting' ? (
          <p className="text-primary/80">{ca('proposalCards.buyerReady.generating')}</p>
        ) : null}
        {decision === 'idle' &&
        typeof onSendFollowUp === 'function' &&
        followUpActions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 sm:gap-3">
            {followUpActions.map((action) => (
              <button
                key={`${id}-${action.label}-${action.prompt}`}
                type="button"
                onClick={() => onSendFollowUp(action.prompt)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-3 transition-colors touch-manipulation sm:min-h-0 sm:px-0',
                  action.primary
                    ? 'font-medium text-primary/85 hover:text-primary'
                    : 'text-foreground/55 hover:text-foreground/75'
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </BuyerReadyCardShell>
    </motion.div>
  )
}

function packageSubject(entityId?: string | null) {
  return entityId ? `buyer-ready package ${entityId}` : 'the current buyer-ready package'
}

function buildPackageGapPrompt(
  card: Extract<BuyerReadyToolCard, { kind: 'buyer_package_status' }>
) {
  const details = compactParts([
    card.missingRequiredArtifactTypes.length > 0
      ? `missing artifacts: ${card.missingRequiredArtifactTypes.map(humanize).filter(Boolean).join(', ')}`
      : null,
    card.openInputCount > 0 ? `${card.openInputCount} open inputs` : null,
    card.checklist.redCount > 0 || card.checklist.yellowCount > 0
      ? `diligence: ${card.checklist.redCount} missing, ${card.checklist.yellowCount} review`
      : null,
  ])
  const suffix = details.length > 0 ? ` (${details.join('; ')})` : ''
  return `Help me resolve buyer-ready package gaps for ${packageSubject(card.entityId)}${suffix}.`
}

function buildBuyerReadyPackageActions(
  card: Extract<BuyerReadyToolCard, { kind: 'buyer_package_status' }>,
  ca: ChatAssistantTranslator
) {
  const subject = packageSubject(card.entityId)
  const hasGaps =
    card.missingRequiredArtifactTypes.length > 0 ||
    card.openInputCount > 0 ||
    card.checklist.redCount > 0 ||
    card.checklist.yellowCount > 0
  const actions: FollowUpAction[] = []
  if (hasGaps) {
    actions.push({
      label: ca('proposalCards.buyerReady.resolveGapsAction'),
      prompt: buildPackageGapPrompt(card),
      primary: true,
    })
  }
  actions.push(
    {
      label: ca('proposalCards.buyerReady.reviewDiligenceAction'),
      prompt: `Review the diligence checklist for ${subject}.`,
    },
    {
      label: ca('proposalCards.buyerReady.reviewDataRoomAction'),
      prompt: `Review the data room manifest for ${subject}.`,
    },
    {
      label: ca('proposalCards.buyerReady.checkLegalAction'),
      prompt: `Check legal readiness for ${subject}.`,
    }
  )
  return actions
}

function buildDdChecklistActions(
  card: Extract<BuyerReadyToolCard, { kind: 'dd_checklist' }>,
  ca: ChatAssistantTranslator
) {
  const subject = packageSubject(card.entityId)
  const openItems = card.items.filter((item) => item.status === 'red' || item.status === 'yellow')
  const firstOpenItem = openItems[0]
  const openCategorySummary = openItems
    .slice(0, 5)
    .map((item) => humanize(item.category))
    .filter(Boolean)
    .join(', ')
  const actions: FollowUpAction[] = []
  if (openItems.length > 0) {
    actions.push({
      label: ca('proposalCards.buyerReady.resolveDdGapsAction'),
      prompt: `Help me resolve the diligence checklist gaps for ${subject}: ${openCategorySummary}.`,
      primary: true,
    })
  }
  if (firstOpenItem) {
    const category = humanize(firstOpenItem.category) ?? firstOpenItem.category
    actions.push({
      label: ca('proposalCards.buyerReady.uploadEvidenceAction'),
      prompt: `Prepare a data-room upload for ${category} in ${subject}.`,
    })
    actions.push({
      label: ca('proposalCards.buyerReady.proposeOverrideAction'),
      prompt: `Propose a diligence status override for ${category} in ${subject}.`,
    })
  }
  actions.push({
    label:
      openItems.length > 0
        ? ca('proposalCards.buyerReady.reviewDataRoomAction')
        : ca('proposalCards.buyerReady.checkLegalAction'),
    prompt:
      openItems.length > 0
        ? `Review the data room manifest for ${subject}.`
        : `Check legal readiness for ${subject}.`,
  })
  return actions
}

function buildDataRoomActions(
  card: Extract<BuyerReadyToolCard, { kind: 'data_room_manifest' }>,
  ca: ChatAssistantTranslator
) {
  const subject = packageSubject(card.entityId)
  const hasDocs = card.docCount > 0 || card.docs.length > 0
  const actions: FollowUpAction[] = [
    {
      label: ca('proposalCards.buyerReady.uploadDocumentAction'),
      prompt: `Prepare a data-room upload for ${subject}.`,
      primary: true,
    },
  ]
  if (hasDocs) {
    actions.push({
      label: ca('proposalCards.buyerReady.checkLegalAction'),
      prompt: `Check legal readiness for ${subject}.`,
    })
    actions.push({
      label: ca('proposalCards.buyerReady.preparePublishAction'),
      prompt: `Check release gates and prepare package publication for ${subject}.`,
    })
  } else {
    actions.push({
      label: ca('proposalCards.buyerReady.reviewPackageAction'),
      prompt: `Review the buyer-ready package status for ${subject}.`,
    })
  }
  return actions
}

function buildLegalReadinessActions(
  card: Extract<BuyerReadyToolCard, { kind: 'legal_readiness' }>,
  ca: ChatAssistantTranslator
) {
  const subject = packageSubject(card.entityId)
  const gateIssues = card.items.filter(
    (item) => item.status === 'blocked' || item.status === 'review'
  )
  const firstGateIssue = gateIssues[0]
  const gateSummary = gateIssues
    .slice(0, 5)
    .map((item) => item.title)
    .filter(Boolean)
    .join(', ')
  const needsCounsel = card.counselReviewRequired || card.blockedCount > 0
  const actions: FollowUpAction[] = []
  if (needsCounsel) {
    actions.push({
      label: ca('proposalCards.buyerReady.lawyerHandoffAction'),
      prompt: `Request a lawyer handoff for ${subject}${
        firstGateIssue
          ? ` about ${humanize(firstGateIssue.category) ?? firstGateIssue.category}`
          : ''
      }.`,
      primary: true,
    })
  } else {
    actions.push({
      label: ca('proposalCards.buyerReady.publishAction'),
      prompt: `Check release gates and prepare package publication for ${subject}.`,
      primary: true,
    })
  }
  if (gateIssues.length > 0) {
    actions.push({
      label: ca('proposalCards.buyerReady.resolveGatesAction'),
      prompt: `Help me resolve legal readiness gates for ${subject}: ${gateSummary}.`,
    })
  } else {
    actions.push({
      label: ca('proposalCards.buyerReady.inviteBuyerAction'),
      prompt: `Prepare a buyer invitation for ${subject}.`,
    })
  }
  actions.push({
    label: ca('proposalCards.buyerReady.reviewPackageAction'),
    prompt: `Review the buyer-ready package status for ${subject}.`,
  })
  return actions
}

function MiniRows({
  rows,
}: {
  rows: Array<{ key: string; title: string; detail?: string | null; badge?: string | null }>
}) {
  if (rows.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      {rows.slice(0, 4).map((row) => (
        <div key={row.key} className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground/75 truncate">{row.title}</span>
            {row.badge && (
              <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                {row.badge}
              </span>
            )}
          </div>
          {row.detail && <p className="mt-0.5 text-foreground/55">{row.detail}</p>}
        </div>
      ))}
    </div>
  )
}

function BuyerReadyCard({
  card,
  onSendFollowUp,
}: {
  card: BuyerReadyToolCard
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const trafficLight = (green: number, yellow: number, red: number) =>
    ca('proposalCards.buyerReady.trafficLight', { green, yellow, red })

  const generateBuyerReadyPackage = async (
    request: Extract<BuyerReadyToolCard, { kind: 'buyer_package_generation' }>
  ) => {
    const path =
      safeBuyerReadyPackagePath(request.submitPath) ??
      (request.reportId
        ? `/api/valuations/reports/${encodeURIComponent(request.reportId)}/buyer-ready-package`
        : null)
    if (!path) throw new Error(ca('proposalCards.buyerReady.endpointMissing'))

    const body: Record<string, unknown> = {}
    if (request.regionLabel) body.regionLabel = request.regionLabel
    if (request.countryCode) body.countryCode = request.countryCode
    if (request.readinessCaseId) body.readinessCaseId = request.readinessCaseId

    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAgentToolActionHeaders('generate_buyer_ready_package'),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const json: unknown = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(extractErrorMessage(json, response.status))

    const entityId = extractGeneratedEntityId(json)
    if (entityId && typeof window !== 'undefined') {
      window.open(buyerReadyRoomUrl(locale, entityId), '_blank', 'noopener,noreferrer')
    }
  }

  switch (card.kind) {
    case 'buyer_package_generation':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={
            card.status === 'blocked'
              ? ca('proposalCards.buyerReady.generateBlockedTitle')
              : ca('proposalCards.buyerReady.generateTitle')
          }
          detail={card.reason ?? card.message}
          meta={compactParts([
            card.resultSummary?.businessName,
            card.resultSummary?.valuationMethod
              ? humanize(card.resultSummary.valuationMethod)
              : null,
            formatMoney(card.resultSummary?.midpoint, card.resultSummary?.currency ?? 'EUR'),
            card.regionLabel,
            card.countryCode,
          ])}
          tone={card.status === 'blocked' ? 'blocked' : 'success'}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          actionPrompt={
            card.status === 'pending_approval'
              ? `Generate buyer-ready package and information memorandum for report ${card.reportId ?? 'the current report'}`
              : undefined
          }
          actionLabel={ca('proposalCards.buyerReady.generateAction')}
          onAction={
            card.status === 'pending_approval' ? () => generateBuyerReadyPackage(card) : undefined
          }
          onSendFollowUp={onSendFollowUp}
        />
      )

    case 'buyer_package_status':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.packageTitle')}
          detail={compactParts([humanize(card.packageStatus), humanize(card.releaseStatus)]).join(
            ' · '
          )}
          meta={compactParts([
            ca('proposalCards.buyerReady.artifactsReady', {
              included: card.includedArtifactCount,
              required: card.requiredArtifactCount,
            }),
            trafficLight(
              card.checklist.greenCount,
              card.checklist.yellowCount,
              card.checklist.redCount
            ),
            card.openInputCount > 0
              ? ca('proposalCards.buyerReady.openInputs', { count: card.openInputCount })
              : null,
          ])}
          tone={card.missingRequiredArtifactTypes.length === 0 ? 'success' : 'default'}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          followUpActions={buildBuyerReadyPackageActions(card, ca)}
          onSendFollowUp={onSendFollowUp}
        >
          {card.missingRequiredArtifactTypes.length > 0 && (
            <p className="mt-1.5 text-xs text-foreground/55 leading-snug">
              {ca('proposalCards.common.missingPrefix')}
              {card.missingRequiredArtifactTypes.map(humanize).filter(Boolean).join(', ')}
            </p>
          )}
        </BuyerReadyCardFrame>
      )

    case 'dd_checklist':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.ddTitle')}
          detail={humanize(card.overallStatus)}
          meta={[trafficLight(card.greenCount, card.yellowCount, card.redCount)]}
          icon={<Check className="h-3.5 w-3.5" />}
          followUpActions={buildDdChecklistActions(card, ca)}
          onSendFollowUp={onSendFollowUp}
        >
          <MiniRows
            rows={card.items.map((item) => ({
              key: item.category,
              title: humanize(item.category) ?? item.category,
              detail: item.reason,
              badge: humanize(item.status),
            }))}
          />
        </BuyerReadyCardFrame>
      )

    case 'data_room_manifest':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.dataRoomTitle')}
          meta={[
            ca('proposalCards.buyerReady.docsIndexed', { count: card.docCount }),
            ca('proposalCards.buyerReady.ndaSigned', { count: card.ndaSignedBuyerCount }),
          ]}
          icon={<FileText className="h-3.5 w-3.5" />}
          followUpActions={buildDataRoomActions(card, ca)}
          onSendFollowUp={onSendFollowUp}
        >
          <MiniRows
            rows={card.docs.map((doc) => ({
              key: `${doc.filename}-${doc.version}`,
              title: doc.filename,
              detail: compactParts([humanize(doc.category), humanize(doc.accessGate)]).join(' · '),
              badge: `v${doc.version}`,
            }))}
          />
        </BuyerReadyCardFrame>
      )

    case 'legal_readiness':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.legalTitle')}
          detail={compactParts([
            card.jurisdiction,
            humanize(card.dealStructure),
            humanize(card.buyerReleaseStatus),
          ]).join(' · ')}
          meta={[
            ca('proposalCards.buyerReady.legalCounts', {
              clear: card.clearCount,
              review: card.reviewCount,
              blocked: card.blockedCount,
            }),
          ]}
          tone={card.blockedCount > 0 || card.counselReviewRequired ? 'blocked' : 'default'}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          followUpActions={buildLegalReadinessActions(card, ca)}
          onSendFollowUp={onSendFollowUp}
        >
          <MiniRows
            rows={card.items.map((item) => ({
              key: item.category,
              title: item.title,
              detail: compactParts([item.reason, item.requiredBefore]).join(' · '),
              badge: humanize(item.status),
            }))}
          />
        </BuyerReadyCardFrame>
      )

    case 'data_room_upload':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.uploadTitle')}
          detail={card.reason}
          meta={compactParts([
            card.label,
            humanize(card.category),
            humanize(card.accessGate),
            card.accept,
            formatBytes(card.maxSizeBytes),
          ])}
          icon={<UploadCloud className="h-3.5 w-3.5" />}
          actionPrompt={`Upload ${card.label || card.category} to the buyer-ready data room`}
          onSendFollowUp={onSendFollowUp}
        />
      )

    case 'dd_override':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.overrideTitle')}
          detail={card.rationale}
          meta={compactParts([humanize(card.category), humanize(card.newStatus)])}
          actionPrompt={`Mark ${card.category} DD item as ${card.newStatus}: ${card.rationale}`}
          onSendFollowUp={onSendFollowUp}
        />
      )

    case 'im_regenerate':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.imTitle')}
          detail={card.reason}
          meta={compactParts([
            ca('proposalCards.buyerReady.section', { section: humanize(card.sectionKey) ?? '' }),
            card.currentConfidence
              ? ca('proposalCards.buyerReady.confidence', {
                  confidence: humanize(card.currentConfidence) ?? card.currentConfidence,
                })
              : null,
          ])}
          actionPrompt={`Regenerate IM section ${card.sectionKey}`}
          onSendFollowUp={onSendFollowUp}
        />
      )

    case 'buyer_invitation':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.invitationTitle')}
          detail={card.reason}
          meta={compactParts([
            card.buyerName,
            card.buyerEmail,
            card.ndaRequired ? ca('proposalCards.buyerReady.ndaRequired') : null,
          ])}
          actionPrompt={`Invite buyer ${card.buyerEmail} to the buyer-ready package`}
          onSendFollowUp={onSendFollowUp}
        />
      )

    case 'package_publish': {
      const publishBlockerDetails =
        compactParts([
          card.reason,
          card.missingArtifactTypes.map(humanize).filter(Boolean).join(', '),
        ]).join(' · ') || 'review the missing artifacts and legal release gates'

      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={
            card.status === 'blocked'
              ? ca('proposalCards.buyerReady.publishBlockedTitle')
              : ca('proposalCards.buyerReady.publishTitle')
          }
          detail={card.reason}
          meta={compactParts([
            humanize(card.packageStatus),
            humanize(card.releaseStatus),
            card.legalReleaseStatus ? humanize(card.legalReleaseStatus) : null,
            card.includedArtifactCount > 0
              ? ca('proposalCards.buyerReady.includedArtifacts', {
                  count: card.includedArtifactCount,
                })
              : null,
          ])}
          tone={card.status === 'blocked' ? 'blocked' : 'success'}
          actionPrompt={
            card.status === 'pending_approval' ? 'Publish buyer-ready package' : undefined
          }
          followUpActions={
            card.status === 'blocked'
              ? [
                  {
                    label: ca('proposalCards.buyerReady.resolveGapsAction'),
                    prompt: `Help me resolve buyer-ready package publication blockers: ${publishBlockerDetails}.`,
                    primary: true,
                  },
                ]
              : []
          }
          onSendFollowUp={onSendFollowUp}
        >
          {card.missingArtifactTypes.length > 0 && (
            <p className="mt-1.5 text-xs text-foreground/55 leading-snug">
              {ca('proposalCards.common.missingPrefix')}
              {card.missingArtifactTypes.map(humanize).filter(Boolean).join(', ')}
            </p>
          )}
          <MiniRows
            rows={card.notReadyArtifacts.map((artifact) => ({
              key: artifact.artifactType,
              title: humanize(artifact.artifactType) ?? artifact.artifactType,
              detail: artifact.reason,
              badge: humanize(artifact.status),
            }))}
          />
        </BuyerReadyCardFrame>
      )
    }

    case 'lawyer_handoff':
      return (
        <BuyerReadyCardFrame
          id={card.id}
          title={ca('proposalCards.buyerReady.lawyerTitle')}
          detail={card.handoffReason}
          meta={compactParts([humanize(card.urgency), humanize(card.legalItemCategory)])}
          tone="blocked"
          actionPrompt={`Request lawyer handoff for ${card.legalItemCategory ?? 'buyer-ready package'}`}
          onSendFollowUp={onSendFollowUp}
        />
      )
  }
}

export function ChatAssistantBuyerReadyCards({
  message,
  onSendFollowUp,
}: ChatAssistantBuyerReadyCardsProps) {
  if (!message.buyerReadyCards || message.buyerReadyCards.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-2">
      {message.buyerReadyCards.map((card) => (
        <BuyerReadyCard key={card.id} card={card} onSendFollowUp={onSendFollowUp} />
      ))}
    </div>
  )
}
