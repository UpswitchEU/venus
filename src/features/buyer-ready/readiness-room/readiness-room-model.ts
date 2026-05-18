import type {
  BuyerReadinessItemStatus,
  BuyerReadinessPackage,
  BuyerReadyImSection,
  BuyerReadyRoomPayload,
  BuyerReadyVaultDoc,
  PricingRange,
} from './types'

export interface ReadinessRoomSummary {
  businessName: string
  valuationRange: string
  completionPct: number | null
  sellabilityScore: number | null
  missingDocumentCount: number
  vaultDocumentCount: number
  imSectionCount: number
  legalHandoffReady: boolean
}

export interface EvidenceIndexRow {
  id: string
  label: string
  category: string
  status: 'documented' | 'weak_evidence' | 'unsupported'
  source: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isBuyerReadinessPackage(value: unknown): value is BuyerReadinessPackage {
  if (!isRecord(value)) return false
  return (
    typeof value.status === 'string' &&
    typeof value.completionPct === 'number' &&
    isRecord(value.normalizedEarnings) &&
    Array.isArray(value.checklist) &&
    Array.isArray(value.missingDocuments)
  )
}

export function extractBuyerReadinessFromPackageResponse(
  value: unknown
): BuyerReadinessPackage | null {
  if (isBuyerReadinessPackage(value)) return value
  if (!isRecord(value)) return null
  if (isBuyerReadinessPackage(value.buyerReadiness)) return value.buyerReadiness
  const data = value.data
  if (!isRecord(data)) return null
  return isBuyerReadinessPackage(data.buyerReadiness) ? data.buyerReadiness : null
}

export function formatMoney(value: number | null | undefined, locale: string): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatValuationRange(
  range: PricingRange | null | undefined,
  locale: string
): string {
  if (!range) return '-'
  if (Number.isFinite(range.min) && Number.isFinite(range.max)) {
    return `${formatMoney(range.min, locale)} - ${formatMoney(range.max, locale)}`
  }
  return formatMoney(range.mid, locale)
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function statusTone(
  status: BuyerReadinessItemStatus | 'ready' | 'blocked' | 'documented' | 'weak_evidence'
): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (status === 'complete' || status === 'ready' || status === 'documented') return 'success'
  if (status === 'needs_attention' || status === 'weak_evidence') return 'warning'
  if (status === 'missing' || status === 'blocked') return 'destructive'
  return 'neutral'
}

export function orderedImSections(
  sections: Record<string, BuyerReadyImSection> | null | undefined
) {
  if (!sections) return []
  const preferred = [
    'cover',
    'executive_summary',
    'business_overview',
    'financial_summary',
    'normalized_ebitda_bridge',
    'customer_mix',
    'team_ownership',
    'growth_thesis',
    'deal_terms',
    'transferability_risks',
    'appendix',
  ]
  return Object.values(sections).sort((a, b) => {
    const ai = preferred.indexOf(a.section_key)
    const bi = preferred.indexOf(b.section_key)
    if (ai === -1 && bi === -1) return a.heading.localeCompare(b.heading)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

export function summarizeRoom(
  payload: BuyerReadyRoomPayload,
  locale: string
): ReadinessRoomSummary {
  const readiness = payload.buyerReadiness
  const report = payload.package?.report
  return {
    businessName: report?.businessName || payload.readinessCase?.title || 'Buyer-ready package',
    valuationRange: formatValuationRange(report?.pricingRange, locale),
    completionPct: readiness?.completionPct ?? null,
    sellabilityScore: readiness?.sellability?.score ?? null,
    missingDocumentCount: readiness?.missingDocuments.length ?? 0,
    vaultDocumentCount: payload.vaultDocs.length,
    imSectionCount: orderedImSections(payload.im?.sections).length,
    legalHandoffReady: readiness?.handoff.legalAiHandoffReady ?? false,
  }
}

export function buildEvidenceIndex(payload: BuyerReadyRoomPayload): EvidenceIndexRow[] {
  const rows: EvidenceIndexRow[] = []

  for (const doc of payload.vaultDocs) {
    rows.push({
      id: doc.id,
      label: doc.filename,
      category: doc.category,
      status: 'documented',
      source: doc.access_gate === 'after_nda' ? 'Vault after NDA' : 'Public teaser vault',
    })
  }

  for (const item of payload.buyerReadiness?.missingDocuments ?? []) {
    rows.push({
      id: item.key,
      label: item.label,
      category: 'missing_document',
      status: item.status === 'complete' ? 'documented' : 'unsupported',
      source: item.reason,
    })
  }

  for (const evidence of payload.readinessCase?.evidence ?? []) {
    rows.push({
      id: evidence.id,
      label: evidence.signalLabel,
      category: evidence.signalKey,
      status: evidence.status,
      source:
        evidence.vaultDocIds.length > 0
          ? `${evidence.vaultDocIds.length} vault document link${evidence.vaultDocIds.length === 1 ? '' : 's'}`
          : 'Readiness case evidence',
    })
  }

  return rows
}

export function buildPackageSummaryDownload(payload: BuyerReadyRoomPayload) {
  const readiness = payload.buyerReadiness
  const report = payload.package?.report
  return {
    entityId: payload.entityId,
    generatedAt: payload.generatedAt,
    businessName: report?.businessName ?? null,
    valuationRange: report?.pricingRange ?? null,
    readinessStatus: readiness?.status ?? null,
    readinessCompletionPct: readiness?.completionPct ?? null,
    sellabilityScore: readiness?.sellability?.score ?? null,
    missingDocuments: readiness?.missingDocuments ?? [],
    imVersion: payload.im?.version ?? null,
    wcTax: payload.wcTax,
    vaultDocumentCount: payload.vaultDocs.length,
    readinessCaseState: payload.readinessCase?.state ?? null,
    handoff: readiness?.handoff ?? null,
  }
}

export function docsByCategory(docs: BuyerReadyVaultDoc[]) {
  return docs.reduce<Record<string, BuyerReadyVaultDoc[]>>((acc, doc) => {
    acc[doc.category] = [...(acc[doc.category] ?? []), doc]
    return acc
  }, {})
}
