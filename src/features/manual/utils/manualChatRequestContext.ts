import type { ChatMessage, FieldContext, NormalizationItem } from '@/components/calculator'
import type { AIChatRequest } from '@/services/ai/AIChatService'

export interface ManualChatFinancialContext {
  revenue?: unknown
  ebitda?: unknown
  yearlyFinancials?: unknown
  current_year_data?: unknown
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

export type ManualChatEnrichedFormData = ManualChatCollectedData & {
  _normalizationSummary: ManualChatNormalizationSummary
  _formCompleteness: number
  _versionCount: number
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

export function buildManualAIChatRequest(args: {
  message: string
  reportId: string | null | undefined
  currentLocale: string
  collectedData: ManualChatCollectedData
  latestFormData: ManualChatFinancialContext
  fieldContext?: FieldContext
  normalizationItems: NormalizationItem[]
  conversationId?: string | null
  chatMessages: ChatMessage[]
  versionCount: number
  audience?: AIChatRequest['audience']
}): AIChatRequest {
  return {
    message: args.message,
    sessionId: args.reportId || undefined,
    reportId: args.reportId || undefined,
    companyName: args.collectedData.companyName,
    conversationId: args.conversationId || undefined,
    fieldContext: args.fieldContext || undefined,
    normalizations: args.normalizationItems,
    formData: buildManualChatEnrichedFormData({
      collectedData: args.collectedData,
      latestFormData: args.latestFormData,
      normalizationItems: args.normalizationItems,
      versionCount: args.versionCount,
    }),
    audience: args.audience,
    locale: getManualChatLocale(args.currentLocale),
    history: buildManualChatHistory(args.chatMessages),
  }
}
