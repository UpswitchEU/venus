import type {
  ChatMessage,
  FieldContext,
  NormalizationItem,
  ValuationReportData,
} from '@/components/calculator'
import type { AIChatRequest } from '@/services/ai/AIChatService'
import { type AssistantIntent, resolveAssistantIntent } from '@/services/ai/local-chat-fallback'

export interface ManualChatFinancialContext {
  revenue?: unknown
  ebitda?: unknown
  yearlyFinancials?: unknown
  current_year_data?: unknown
  _valuationSummary?: ManualChatValuationSummary
}

export type ManualChatCollectedData = ManualChatFinancialContext &
  Record<string, unknown> & {
    companyName?: string
  }

export interface ManualChatNormalizationSummary {
  total: number
  accepted: number
  pending: number
  totalAdjustment: number
  categories: Array<NormalizationItem['category']>
}

export interface ManualChatValuationSummary {
  valuation?: number
  valuationLow?: number
  valuationHigh?: number
  recommendedAskingPrice?: number
  normalizedEbitda?: number
  reportedEbitda?: number
  multiple?: number
  generatedAt?: string
}

export type ManualChatEnrichedFormData = ManualChatCollectedData & {
  _normalizationSummary: ManualChatNormalizationSummary
  _formCompleteness: number
  _versionCount: number
  _valuationSummary?: ManualChatValuationSummary
}

export function getManualChatLocale(locale: string): 'en' | 'nl' {
  return locale === 'en' || locale === 'nl' ? locale : 'nl'
}

export function getManualChatVersionCount(
  versionsByLookupId: Record<string, unknown[] | undefined>,
  lookupId: string | null | undefined
): number {
  if (!lookupId) return 0
  const versions = versionsByLookupId[lookupId]
  return Array.isArray(versions) ? versions.length : 0
}

export function buildManualChatHistory(
  chatMessages: ChatMessage[],
  limit = 10
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return chatMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-limit)
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }))
}

export function buildManualChatEnrichedFormData(args: {
  collectedData: ManualChatCollectedData
  latestFormData: ManualChatFinancialContext
  normalizationItems: NormalizationItem[]
  valuationSummary?: ManualChatValuationSummary | null
  versionCount: number
}): ManualChatEnrichedFormData {
  const accepted = args.normalizationItems.filter((item) => item.status === 'accepted')
  const pending = args.normalizationItems.filter((item) => item.status === 'pending')
  const totalAdjustment = accepted.reduce((sum, item) => sum + item.adjustment, 0)
  const categories = [...new Set(args.normalizationItems.map((item) => item.category))]
  const formFields = Object.entries(args.collectedData).filter(
    ([, value]) => value !== '' && value !== undefined && value !== null
  )

  return {
    ...args.collectedData,
    revenue: args.latestFormData.revenue ?? args.collectedData.revenue,
    ebitda: args.latestFormData.ebitda ?? args.collectedData.ebitda,
    yearlyFinancials: args.latestFormData.yearlyFinancials ?? args.collectedData.yearlyFinancials,
    current_year_data:
      args.latestFormData.current_year_data ?? args.collectedData.current_year_data,
    ...(args.valuationSummary ? { _valuationSummary: args.valuationSummary } : {}),
    _normalizationSummary: {
      total: args.normalizationItems.length,
      accepted: accepted.length,
      pending: pending.length,
      totalAdjustment,
      categories,
    },
    _formCompleteness: Math.round((formFields.length / 7) * 100),
    _versionCount: args.versionCount,
  }
}

export function buildManualChatValuationSummary(
  report: ValuationReportData | null | undefined
): ManualChatValuationSummary | null {
  if (!report) return null
  const valuation = Number(report.valuation)
  const valuationLow = Number(report.valuationLow)
  const valuationHigh = Number(report.valuationHigh)
  const recommendedAskingPrice = Number(report.recommendedAskingPrice)
  const normalizedEbitda = Number(report.normalizedEbitda)
  const reportedEbitda = Number(
    (report as ValuationReportData & { reportedEbitda?: number }).reportedEbitda ?? report.ebitda
  )
  const multiple = Number(report.multiple)
  const generatedAtDate = report.generatedAt ? new Date(report.generatedAt) : null
  const generatedAt =
    generatedAtDate && Number.isFinite(generatedAtDate.getTime())
      ? generatedAtDate.toISOString()
      : undefined

  return {
    ...(Number.isFinite(valuation) ? { valuation } : {}),
    ...(Number.isFinite(valuationLow) ? { valuationLow } : {}),
    ...(Number.isFinite(valuationHigh) ? { valuationHigh } : {}),
    ...(Number.isFinite(recommendedAskingPrice) ? { recommendedAskingPrice } : {}),
    ...(Number.isFinite(normalizedEbitda) ? { normalizedEbitda } : {}),
    ...(Number.isFinite(reportedEbitda) ? { reportedEbitda } : {}),
    ...(Number.isFinite(multiple) ? { multiple } : {}),
    ...(generatedAt ? { generatedAt } : {}),
  }
}

function normalizeManualChatLookupId(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function resolveManualChatSessionId(args: {
  audience?: AIChatRequest['audience']
  clientUserId?: string | null
  reportId?: string | null
}): string | undefined {
  const clientUserId = normalizeManualChatLookupId(args.clientUserId)
  if (args.audience === 'advisor' && clientUserId) {
    return `client_${clientUserId}`
  }
  return normalizeManualChatLookupId(args.reportId)
}

export function buildManualAIChatRequest(args: {
  message: string
  reportId: string | null | undefined
  currentLocale: string
  collectedData: ManualChatCollectedData
  latestFormData: ManualChatFinancialContext
  fieldContext?: FieldContext
  normalizationItems: NormalizationItem[]
  valuationSummary?: ManualChatValuationSummary | null
  conversationId?: string | null
  chatMessages: ChatMessage[]
  versionCount: number
  audience?: AIChatRequest['audience']
  clientUserId?: string | null
  surfaceIntent?: 'add_client' | 'kbo_lookup'
  assistantIntent?: AssistantIntent
}): AIChatRequest {
  const sessionId = resolveManualChatSessionId({
    audience: args.audience,
    clientUserId: args.clientUserId,
    reportId: args.reportId,
  })
  const reportId = normalizeManualChatLookupId(args.reportId) ?? sessionId

  return {
    message: args.message,
    sessionId,
    reportId,
    companyName: args.collectedData.companyName,
    conversationId: args.conversationId || undefined,
    fieldContext: args.fieldContext || undefined,
    normalizations: args.normalizationItems,
    ...(args.surfaceIntent ? { surfaceIntent: args.surfaceIntent } : {}),
    assistantIntent: resolveAssistantIntent(args.message, args.assistantIntent),
    formData: buildManualChatEnrichedFormData({
      collectedData: args.collectedData,
      latestFormData: args.latestFormData,
      normalizationItems: args.normalizationItems,
      valuationSummary: args.valuationSummary,
      versionCount: args.versionCount,
    }),
    audience: args.audience,
    locale: getManualChatLocale(args.currentLocale),
    history: buildManualChatHistory(args.chatMessages),
  }
}
