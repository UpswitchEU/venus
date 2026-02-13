/**
 * UI Handlers - Focused event handlers for UI-related streaming events
 *
 * Single Responsibility: Handle progress updates, data collection, suggestions, and HTML previews
 * Extracted from StreamEventHandler to follow SRP
 *
 * NOTE: This handler is flow-agnostic. Session updates should be handled through
 * callbacks, which are provided by the appropriate flow (Manual or Conversational).
 *
 * @module services/chat/handlers/ui/UIHandlers
 */

import type { ValuationRequest } from '../../../../types/valuation'
import { chatLogger } from '../../../../utils/logger'
import { StreamEventHandlerCallbacks } from '../../StreamEventHandler'

export class UIHandlers {
  private callbacks: StreamEventHandlerCallbacks

  constructor(callbacks: StreamEventHandlerCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * Map conversational field names to ValuationRequest structure
   * Handles nested fields (e.g., 'revenue' -> 'current_year_data.revenue')
   * Failproof: Validates inputs and handles edge cases
   */
  private mapConversationalFieldToSessionData(
    field: string,
    value: any,
    metadata?: any
  ): Partial<ValuationRequest> {
    // Failproof: Validate inputs
    if (!field || typeof field !== 'string') {
      chatLogger.warn('Invalid field name in mapConversationalFieldToSessionData', {
        field,
        fieldType: typeof field,
      })
      return {}
    }

    if (value === undefined || value === null) {
      chatLogger.debug('Skipping null/undefined value in field mapping', { field })
      return {}
    }

    // Field mapping from conversational names to ValuationRequest structure
    // CRITICAL: This must include ALL fields that can be collected in conversational flow
    const fieldMap: Record<string, string> = {
      // Basic company information
      company_name: 'company_name',
      business_type: 'business_type',
      business_type_id: 'business_type_id',
      country_code: 'country_code',
      founding_year: 'founding_year',
      industry: 'industry',
      business_model: 'business_model',

      // Business structure and ownership
      business_structure: 'business_type', // Maps to business_type (company/sole_trader)
      shares_for_sale: 'shares_for_sale',
      number_of_owners: 'number_of_owners',
      number_of_employees: 'number_of_employees',
      employee_count: 'number_of_employees', // Alias

      // Financial data (current year)
      revenue: 'current_year_data.revenue',
      ebitda: 'current_year_data.ebitda',
      net_income: 'current_year_data.net_income',
      total_assets: 'current_year_data.total_assets',
      total_debt: 'current_year_data.total_debt',
      cash: 'current_year_data.cash',
      current_year: 'current_year_data.year',

      // Historical data
      provide_historical_data: 'provide_historical_data', // Boolean flag
      historical_years_data: 'historical_years_data', // Array of year data

      // Additional financial metrics
      recurring_revenue_percentage: 'recurring_revenue_percentage',

      // Owner profiling (if collected)
      owner_role: 'owner_role',
      owner_hours: 'owner_hours',
      delegation_capability: 'delegation_capability',
      succession_plan: 'succession_plan',

      // Additional business context
      business_description: 'business_description',
      business_highlights: 'business_highlights',
      reason_for_selling: 'reason_for_selling',
      city: 'city',
    }

    const targetPath = fieldMap[field] || field

    // Failproof: Validate targetPath
    if (!targetPath || typeof targetPath !== 'string') {
      chatLogger.warn('Invalid targetPath in field mapping', {
        field,
        targetPath,
        availableFields: Object.keys(fieldMap).slice(0, 10), // Log first 10 for debugging
      })
      // CRITICAL FIX: If field is not in map, try to use it directly (for new fields)
      // This ensures backward compatibility and handles new fields gracefully
      if (field && typeof field === 'string') {
        chatLogger.info('Using unmapped field directly', {
          field,
          value,
        })
        // Return the field as-is - let the backend handle validation
        return { [field]: value } as any
      }
      return {}
    }

    // Build nested update object
    const sessionUpdate: Partial<ValuationRequest> = {}

    if (targetPath.includes('.')) {
      const parts = targetPath.split('.')
      if (parts.length !== 2) {
        chatLogger.warn('Unexpected nested path format', {
          field,
          targetPath,
          partsCount: parts.length,
        })
        return {}
      }

      const [parent, child] = parts

      // CRITICAL FIX: For nested objects like current_year_data, we need to merge
      // not overwrite, so we preserve existing data
      const existingParent = sessionUpdate[parent as keyof ValuationRequest] as any
      if (existingParent && typeof existingParent === 'object') {
        sessionUpdate[parent as keyof ValuationRequest] = {
          ...existingParent,
          [child]: value,
        } as any
      } else {
        sessionUpdate[parent as keyof ValuationRequest] = {
          [child]: value,
        } as any
      }
    } else {
      sessionUpdate[targetPath as keyof ValuationRequest] = value as any
    }

    // CRITICAL FIX: Handle metadata for ALL fields, not just business_type
    // Many fields have metadata that contains additional important data
    if (metadata && Object.keys(metadata).length > 0) {
      chatLogger.debug('Processing metadata for field', {
        field,
        metadataKeys: Object.keys(metadata),
      })

      // Handle business_type metadata (most complex case)
      if (field === 'business_type' || field === 'business_type_id') {
        chatLogger.info('Saving business_type with metadata', {
          business_type: value,
          metadata: metadata,
          has_id: !!metadata.id,
          has_industry: !!metadata.industry,
        })

        // Save business_type_id if present (CRITICAL for backend validation)
        if (metadata.id) {
          sessionUpdate.business_type_id = metadata.id
          chatLogger.info('✅ Saved business_type_id from metadata', {
            business_type_id: metadata.id,
          })
        }

        // Save industry if present (auto-derived from business_type_id)
        if (metadata.industry || metadata.industry_mapping) {
          sessionUpdate.industry = metadata.industry || metadata.industry_mapping
          chatLogger.info('✅ Saved industry from metadata', {
            industry: sessionUpdate.industry,
          })
        }
      }

      // Handle company_name metadata (may include KBO registration data)
      if (field === 'company_name' && metadata.registration_number) {
        // Store KBO data in business_context (extend with any for custom fields)
        if (!sessionUpdate.business_context) {
          sessionUpdate.business_context = {} as any
        }
        sessionUpdate.business_context = {
          ...sessionUpdate.business_context,
          kbo_registration: metadata.registration_number,
          legal_form: metadata.legal_form,
        } as any
        chatLogger.debug('✅ Saved KBO registration data from metadata', {
          registration_number: metadata.registration_number,
        })
      }

      // Handle current_year_data.year if provided in metadata
      if (field === 'revenue' || field === 'ebitda') {
        if (metadata.year && !sessionUpdate.current_year_data?.year) {
          // Ensure current_year_data object exists
          if (!sessionUpdate.current_year_data) {
            sessionUpdate.current_year_data = { year: metadata.year } as any
          } else {
            sessionUpdate.current_year_data = {
              ...sessionUpdate.current_year_data,
              year: metadata.year,
            } as any
          }
          chatLogger.debug('✅ Saved year from metadata', {
            year: metadata.year,
          })
        }
      }

      // Handle any other metadata fields that map directly to ValuationRequest
      // This is a catch-all for fields that might have metadata we want to save
      const metadataFieldMap: Record<string, keyof ValuationRequest> = {
        industry_mapping: 'industry',
        category: 'business_type',
      }

      for (const [metaKey, requestKey] of Object.entries(metadataFieldMap)) {
        if (metadata[metaKey] && !sessionUpdate[requestKey]) {
          sessionUpdate[requestKey] = metadata[metaKey] as any
          chatLogger.debug(`✅ Saved ${metaKey} from metadata to ${requestKey}`, {
            [metaKey]: metadata[metaKey],
          })
        }
      }
    }

    return sessionUpdate
  }

  /**
   * Handle progress update events
   */
  handleProgressUpdate(data: any): void {
    chatLogger.debug('Progress update received', {
      progress: data.progress,
      message: data.message,
      step: data.step,
    })

    this.callbacks.onProgressUpdate?.(data)
  }

  /**
   * Handle progress summary events
   */
  handleProgressSummary(data: any): void {
    chatLogger.info('Progress summary received', {
      summary: data.summary,
      totalSteps: data.total_steps,
      completedSteps: data.completed_steps,
      dataKeys: Object.keys(data),
    })

    // Progress summary typically contains overall progress information
    this.callbacks.onProgressUpdate?.(data)
  }

  /**
   * Handle data collected events
   */
  handleDataCollected(data: any): void {
    const collectedData = data.data || data.collected_data || data
    const field = collectedData.field || collectedData.field_name || collectedData.key
    const value = collectedData.value
    const source = collectedData.source || 'backend'

    chatLogger.info('Data collected', {
      field,
      hasValue: value !== undefined,
      source,
      dataKeys: Object.keys(collectedData),
    })

    // Update collected data state
    this.callbacks.setCollectedData((prev) => ({
      ...prev,
      [field]: value,
    }))

    // CRITICAL: Auto-save collected data through callback
    // NOTE: The callback should handle session store updates for the appropriate flow
    // Failproof: Handle all edge cases gracefully
    try {
      // Validate we have an onDataCollected callback
      if (!this.callbacks.onDataCollected) {
        chatLogger.debug('[Chat] No onDataCollected callback, skipping auto-save', { field })
        return
      }

      // CRITICAL: Handle all value types including empty strings, zero, false
      // Empty strings are valid for some fields (e.g., business_description can be empty)
      // Zero is valid for numeric fields (e.g., number_of_employees can be 0)
      // False is valid for boolean fields (e.g., provide_historical_data can be false)
      const isValidValue = value !== undefined && value !== null && value !== ''

      // Exception: Allow empty strings for text fields that might legitimately be empty
      const textFields = [
        'business_description',
        'business_highlights',
        'reason_for_selling',
        'city',
      ]
      const isEmptyStringAllowed =
        typeof value === 'string' && value === '' && textFields.includes(field)

      if (field && (isValidValue || isEmptyStringAllowed)) {
        // Map conversational field names to ValuationRequest structure
        const sessionDataUpdate = this.mapConversationalFieldToSessionData(
          field,
          value,
          collectedData.metadata
        )

        // Validate update object is not empty
        if (!sessionDataUpdate || Object.keys(sessionDataUpdate).length === 0) {
          chatLogger.warn('[Chat] Skipping auto-save: empty sessionDataUpdate', {
            field,
            value,
            hasMetadata: !!collectedData.metadata,
            metadataKeys: collectedData.metadata ? Object.keys(collectedData.metadata) : [],
          })
          return
        }

        chatLogger.debug('[Chat] Mapped collected data for auto-save', {
          field,
          sessionDataKeys: Object.keys(sessionDataUpdate),
        })
      } else {
        chatLogger.debug('[Chat] Skipping auto-save: invalid field or value', {
          field,
          hasValue: value !== undefined,
          valueType: typeof value,
        })
      }
    } catch (error) {
      // Failproof: Never let auto-save break the conversation flow
      chatLogger.error('[Chat] Unexpected error in data collection', {
        field,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      // Continue conversation flow - don't throw
    }

    // Call data collected callback (which should handle session updates)
    this.callbacks.onDataCollected?.(collectedData)
  }

  /**
   * Handle suggestion offered events
   */
  handleSuggestionOffered(data: any): void {
    const suggestions = data.suggestions || data.options || []
    const field = data.field || data.for_field

    chatLogger.info('Suggestions offered', {
      field,
      suggestionCount: suggestions.length,
      suggestions: suggestions.slice(0, 3), // Log first 3 suggestions
    })

    // Add suggestion message to chat
    this.callbacks.addMessage({
      type: 'suggestion',
      content: data.message || data.content || 'Here are some suggestions:',
      metadata: {
        suggestions,
        originalValue: data.original_value,
        field,
      },
      isComplete: true,
    })
  }

  /**
   * Handle clarification needed events
   */
  handleClarificationNeeded(data: any): void {
    const field = data.field || data.clarification_field
    const message = data.message || data.content || 'Please provide more information.'
    const options = data.options || data.suggestions || []
    const inputType = data.input_type || 'text'

    chatLogger.info('Clarification needed', {
      field,
      inputType,
      hasOptions: options.length > 0,
      optionCount: options.length,
      messageLength: message.length,
    })

    // Add clarification message to chat
    this.callbacks.addMessage({
      type: 'ai',
      content: message,
      metadata: {
        needs_confirmation: true,
        clarification_field: field,
        collected_field: field,
        input_type: inputType,
        suggestions: options, // Store as 'suggestions' for consistency with backend and MessageItem
        options, // Keep for backward compatibility
        clarification_message: message,
      },
      isComplete: true,
    })
  }

  /**
   * Handle HTML preview events
   */
  handleHtmlPreview(data: any): void {
    const html = data.html || data.content || ''
    const previewType = data.preview_type || data.type || 'progressive'

    chatLogger.info('HTML preview received', {
      previewType,
      htmlLength: html.length,
      hasHtml: !!html,
    })

    this.callbacks.onHtmlPreviewUpdate?.(html, previewType)
  }

  /**
   * Handle error events
   */
  handleError(data: any): void {
    const errorMessage =
      data.message || data.content || data.error || 'An unexpected error occurred'
    const errorType = data.error_type || data.type || 'unknown'
    const isRetryable = data.retryable !== false

    chatLogger.error('Streaming error received', {
      errorType,
      errorMessage: errorMessage.substring(0, 100),
      isRetryable,
      dataKeys: Object.keys(data),
    })

    // Add error message to chat
    this.callbacks.addMessage({
      type: 'system',
      content: `Error: ${errorMessage}${isRetryable ? ' Please try again.' : ''}`,
      isComplete: true,
    })

    // Hide streaming indicators on error
    this.callbacks.setIsStreaming(false)
    this.callbacks.setIsTyping?.(false)
    this.callbacks.setIsThinking?.(false)

    // Track error in model performance if metrics are available
    if (data.metrics) {
      this.callbacks.trackModelPerformance?.({
        ...data.metrics,
        error_occurred: true,
        error_type: errorType,
      })
    }

    // Track conversation completion as failed
    this.callbacks.trackConversationCompletion?.(false, false)
  }
}
