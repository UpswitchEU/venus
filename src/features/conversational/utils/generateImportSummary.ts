/**
 * Generate Import Summary Message
 *
 * Creates a summary message when switching from manual to conversational flow
 * with pre-filled data, showing what data was imported
 */

import type { Message } from '../../../types/message'
import type { ValuationRequest } from '../../../types/valuation'

export function generateImportSummaryMessage(
  sessionData: Partial<ValuationRequest>
): Omit<Message, 'id' | 'timestamp'> {
  // Failproof: Validate input
  if (!sessionData || typeof sessionData !== 'object') {
    return {
      type: 'ai',
      role: 'assistant',
      content: `📋 **Switched to conversational flow**\n\nI'm ready to help you collect valuation data. What would you like to tell me about your business?`,
      isComplete: true,
      isStreaming: false,
      metadata: {
        session_phase: 'manual_import',
        imported_fields: 0,
        is_summary: true,
        error: 'invalid_session_data',
      },
    }
  }

  const fields: string[] = []

  // Collect filled fields with failproof validation
  try {
    if (sessionData.company_name && typeof sessionData.company_name === 'string') {
      fields.push(`**Company**: ${sessionData.company_name}`)
    }

    if (sessionData.business_type_id) {
      const businessType =
        typeof sessionData.business_type === 'string'
          ? sessionData.business_type
          : String(sessionData.business_type_id)
      fields.push(`**Business Type**: ${businessType}`)
    }

    if (sessionData.country_code && typeof sessionData.country_code === 'string') {
      fields.push(`**Country**: ${sessionData.country_code}`)
    }

    if (sessionData.founding_year) {
      const year =
        typeof sessionData.founding_year === 'number'
          ? sessionData.founding_year
          : parseInt(String(sessionData.founding_year), 10)
      if (!isNaN(year)) {
        fields.push(`**Founded**: ${year}`)
      }
    }

    // Failproof: Handle nested current_year_data safely
    if (sessionData.current_year_data && typeof sessionData.current_year_data === 'object') {
      const currentYearData = sessionData.current_year_data as any

      if (currentYearData.revenue !== undefined && currentYearData.revenue !== null) {
        try {
          const revenue =
            typeof currentYearData.revenue === 'number'
              ? currentYearData.revenue
              : parseFloat(String(currentYearData.revenue))
          if (!isNaN(revenue)) {
            fields.push(
              `**Revenue**: €${revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            )
          }
        } catch (e) {
          // Skip invalid revenue
        }
      }

      if (currentYearData.ebitda !== undefined && currentYearData.ebitda !== null) {
        try {
          const ebitda =
            typeof currentYearData.ebitda === 'number'
              ? currentYearData.ebitda
              : parseFloat(String(currentYearData.ebitda))
          if (!isNaN(ebitda)) {
            fields.push(
              `**EBITDA**: €${ebitda.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            )
          }
        } catch (e) {
          // Skip invalid ebitda
        }
      }
    }

    if (sessionData.number_of_employees !== undefined && sessionData.number_of_employees !== null) {
      const employees =
        typeof sessionData.number_of_employees === 'number'
          ? sessionData.number_of_employees
          : parseInt(String(sessionData.number_of_employees), 10)
      if (!isNaN(employees)) {
        fields.push(`**Employees**: ${employees}`)
      }
    }

    if (sessionData.number_of_owners !== undefined && sessionData.number_of_owners !== null) {
      const owners =
        typeof sessionData.number_of_owners === 'number'
          ? sessionData.number_of_owners
          : parseInt(String(sessionData.number_of_owners), 10)
      if (!isNaN(owners)) {
        fields.push(`**Owners**: ${owners}`)
      }
    }

    if (sessionData.shares_for_sale !== undefined && sessionData.shares_for_sale !== null) {
      const shares =
        typeof sessionData.shares_for_sale === 'number'
          ? sessionData.shares_for_sale
          : parseFloat(String(sessionData.shares_for_sale))
      if (!isNaN(shares)) {
        fields.push(`**Shares for Sale**: ${shares}%`)
      }
    }
  } catch (error) {
    // Failproof: If field collection fails, still return a valid message
    console.error('Error collecting fields for import summary', error)
  }

  // Build summary message
  const content =
    fields.length > 0
      ? `📋 **Data imported from manual form**\n\nI've loaded the following information:\n\n${fields.join('\n')}\n\n✅ You can continue this conversation to modify any of these values or add additional information.`
      : `📋 **Switched to conversational flow**\n\nI'm ready to help you collect valuation data. What would you like to tell me about your business?`

  return {
    type: 'ai',
    role: 'assistant',
    content: '', // Empty content - will be rendered as ConversationSummaryBlock component
    isComplete: true,
    isStreaming: false,
    metadata: {
      session_phase: 'manual_import',
      imported_fields: fields.length,
      is_summary: true,
      collected_data: sessionData, // Include collected data for inline rendering
    },
  }
}

/**
 * Check if session has data but no conversation messages
 * This indicates a manual → conversational flow switch with pre-filled data
 */
export function shouldGenerateImportSummary(
  sessionData: Partial<ValuationRequest> | undefined,
  messages: Message[]
): boolean {
  // No messages in conversation
  const hasNoMessages = messages.length === 0

  // Has meaningful data in session
  const hasData = !!(
    sessionData?.company_name ||
    sessionData?.business_type_id ||
    sessionData?.current_year_data?.revenue ||
    sessionData?.current_year_data?.ebitda
  )

  return hasNoMessages && hasData
}
