/**
 * Generate Conversation from Form Data
 *
 * Creates synthetic conversation messages from manual form data
 * This enables Manual → Conversational flow with conversation history
 */

import { getCountryByCode } from '../config/countries'
import type { Message } from '../types/message'
import type { ValuationFormData } from '../types/valuation'
import { dateLikeToUnixMs } from './date-like'
import { normalizeCurrentYearForFiling } from './fiscalYear'
import { resolveFormEbitda, resolveFormRevenue } from './versionDiffDetection'

/**
 * Generate conversation messages that represent manual form data
 * These messages appear as if the user had a conversation that collected this data
 */
export function generateConversationFromFormData(
  formData: ValuationFormData,
  reportId: string
): Message[] {
  const messages: Message[] = []
  const baseTimestamp = new Date()
  const baseMs = dateLikeToUnixMs(baseTimestamp) ?? Date.now()

  // Helper to add message pair (AI question + User answer)
  const addMessagePair = (
    question: string,
    answer: string,
    field: string,
    metadata?: any,
    delay: number = 1000
  ) => {
    // AI Question
    messages.push({
      id: `msg-${reportId}-${field}-q-${Date.now()}-${Math.random()}`,
      type: 'ai',
      role: 'assistant',
      content: question,
      timestamp: new Date(baseMs + messages.length * delay),
      isComplete: true,
      isStreaming: false,
      metadata: {
        collected_field: field,
        session_phase: 'data_collection',
        generated_from_manual: true,
        ...metadata,
      },
    })

    // User Answer
    messages.push({
      id: `msg-${reportId}-${field}-a-${Date.now()}-${Math.random()}`,
      type: 'user',
      role: 'user',
      content: answer,
      timestamp: new Date(baseMs + messages.length * delay),
      isComplete: true,
      isStreaming: false,
      metadata: {
        field,
        value: answer,
        source: 'manual_form',
        generated_from_manual: true,
      },
    })
  }

  // Business Type
  if (formData.business_type_id) {
    addMessagePair(
      'What type of business do you run?',
      formData.business_type || formData.business_type_id,
      'business_type',
      { business_type_id: formData.business_type_id }
    )
  }

  // Company Name
  if (formData.company_name) {
    addMessagePair("What's your company name?", formData.company_name, 'company_name')
  }

  // Founding Year
  if (formData.founding_year) {
    addMessagePair(
      'When did your business start trading?',
      formData.founding_year.toString(),
      'founding_year'
    )
  }

  // Country
  const resolvedCountryCode =
    formData.country_code?.trim() || (formData as { country?: string }).country?.trim()
  if (resolvedCountryCode) {
    const label = getCountryByCode(resolvedCountryCode)?.name ?? resolvedCountryCode
    addMessagePair('Select your primary operating country', label, 'country_code', {
      country_code: resolvedCountryCode,
    })
  }

  // Business Structure
  if (formData.business_type) {
    const structureLabel =
      formData.business_type === 'sole-trader' ? 'Sole Trader' : 'Limited Company'
    addMessagePair('What is your business structure?', structureLabel, 'business_type')
  }

  // Number of Owners
  if (formData.number_of_owners) {
    addMessagePair(
      'How many active owner-managers work in the business?',
      formData.number_of_owners.toString(),
      'number_of_owners',
      { number_of_owners: formData.number_of_owners }
    )
  }

  // Number of Employees
  if (formData.number_of_employees !== undefined && formData.number_of_employees !== null) {
    addMessagePair(
      'How many Full-Time Equivalent (FTE) employees do you have?',
      formData.number_of_employees.toString(),
      'number_of_employees',
      { number_of_employees: formData.number_of_employees }
    )
  }

  // Revenue (explicit finite only; 0 is valid — matches buildValuationRequest resolution)
  const hasExplicitRevenue =
    (formData.revenue != null && Number.isFinite(Number(formData.revenue))) ||
    (formData.current_year_data?.revenue != null &&
      Number.isFinite(Number(formData.current_year_data.revenue)))
  if (hasExplicitRevenue) {
    const revenue = resolveFormRevenue(formData)
    const year = normalizeCurrentYearForFiling(
      formData.current_year_data?.year,
      formData.filing_year_confirmed
    )
    addMessagePair(`What was your revenue in ${year}?`, `€${revenue.toLocaleString()}`, 'revenue', {
      revenue,
      year,
    })
  }

  // EBITDA
  const hasExplicitEbitda =
    (formData.ebitda != null && Number.isFinite(Number(formData.ebitda))) ||
    (formData.current_year_data?.ebitda != null &&
      Number.isFinite(Number(formData.current_year_data.ebitda)))
  if (hasExplicitEbitda) {
    const ebitda = resolveFormEbitda(formData)
    const year = normalizeCurrentYearForFiling(
      formData.current_year_data?.year,
      formData.filing_year_confirmed
    )
    addMessagePair(`What was your EBITDA in ${year}?`, `€${ebitda.toLocaleString()}`, 'ebitda', {
      ebitda,
      year,
    })
  }

  // Historical Data
  if (formData.historical_years_data && formData.historical_years_data.length > 0) {
    addMessagePair(
      'Would you like to provide historical financial data to improve valuation accuracy?',
      'Yes',
      'provide_historical_data',
      { has_historical_data: true }
    )
  } else {
    addMessagePair(
      'Would you like to provide historical financial data to improve valuation accuracy?',
      'No',
      'provide_historical_data',
      { has_historical_data: false }
    )
  }

  // Add a final summary message
  if (messages.length > 0) {
    messages.push({
      id: `msg-${reportId}-summary-${Date.now()}-${Math.random()}`,
      type: 'ai',
      role: 'assistant',
      content: `Great! I have all the information from your manual entry. You can now calculate the valuation or continue the conversation to provide additional details.`,
      timestamp: new Date(baseMs + messages.length * 1000),
      isComplete: true,
      isStreaming: false,
      metadata: {
        session_phase: 'ready_for_valuation',
        generated_from_manual: true,
      },
    })
  }

  return messages
}

/**
 * Check if conversation was generated from manual form data
 */
export function isGeneratedConversation(messages: Message[]): boolean {
  return messages.some((msg) => msg.metadata?.generated_from_manual === true)
}

/**
 * Get the collected data from generated conversation
 */
export function extractDataFromGeneratedConversation(messages: Message[]): Record<string, any> {
  const data: Record<string, any> = {}

  for (const message of messages) {
    if (message.type === 'user' && message.metadata?.field && message.metadata?.value) {
      const field = message.metadata.field
      if (typeof field === 'string') {
        data[field] = message.metadata.value
      }
    }
  }

  return data
}
