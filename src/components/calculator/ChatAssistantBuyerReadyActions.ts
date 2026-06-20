import type { useTranslations } from 'next-intl'
import type { BuyerReadyToolCard } from './ChatAssistantTypes'

export type ChatAssistantTranslator = ReturnType<typeof useTranslations>
export type FollowUpAction = { label: string; prompt: string; primary?: boolean }

const AGENT_TOOL_ACTION_NAME_HEADER = 'X-Upswitch-Agent-Tool-Name'

export function buildAgentToolActionHeaders(toolName: string): Record<string, string> {
  return { [AGENT_TOOL_ACTION_NAME_HEADER]: toolName }
}

export function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
}

export function humanize(value?: string | null) {
  if (!value) return null
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatBytes(value?: number) {
  if (!value || !Number.isFinite(value)) return null
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
}

export function formatMoney(value: number | null | undefined, currency: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function safeBuyerReadyPackagePath(value?: string) {
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

export function extractGeneratedEntityId(json: unknown): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const root = json as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null
  const entityId = data?.entityId ?? data?.entity_id ?? root.entityId ?? root.entity_id
  return typeof entityId === 'string' && entityId.trim() ? entityId.trim() : null
}

export function extractErrorMessage(json: unknown, status: number): string {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const record = json as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return `HTTP ${status}`
}

export function buyerReadyRoomUrl(locale: string, entityId: string) {
  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : 'en'
  return `/${safeLocale}/business/buyer-ready/${encodeURIComponent(entityId)}`
}

function packageSubject(entityId?: string | null) {
  return entityId ? `buyer-ready package ${entityId}` : 'the current buyer-ready package'
}

export function buildPackageGapPrompt(
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

export function buildBuyerReadyPackageActions(
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

export function buildDdChecklistActions(
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

export function buildDataRoomActions(
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

export function buildLegalReadinessActions(
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
