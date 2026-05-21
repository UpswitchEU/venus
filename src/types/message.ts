/**
 * Message Types - Strongly Typed Message Interfaces
 *
 * Defines comprehensive types for chat messages and their metadata.
 * Eliminates 'any' types with proper TypeScript definitions.
 */

// Base message metadata types - comprehensive to cover all usage
export interface BaseMessageMetadata {
  input_type?: string
  collected_field?: string
  clarification_field?: string
  field?: string
  session_id?: string
  user_id?: string
  timestamp?: number
  // Additional properties used in the codebase
  is_ai_help?: boolean
  ai_response?: string
  button_text?: string
  clarification_message?: string
  persistedToolResults?: Array<{
    id?: string
    toolName: string
    result: unknown
  }>
  // Allow additional unknown properties for flexibility
  [key: string]: unknown
}

export interface ValuationMessageMetadata extends BaseMessageMetadata {
  input_type: 'cta_button'
  collected_field: 'valuation_confirmed'
  valuation_id?: string
  valuation_status?: string
}

export interface DataCollectionMetadata extends BaseMessageMetadata {
  input_type: 'text_input' | 'select' | 'checkbox' | 'radio' | 'textarea'
  collected_field: string
  value?: string | number | boolean
  validation_status?: 'valid' | 'invalid'
  validation_errors?: string[]
}

export interface StreamingMetadata extends BaseMessageMetadata {
  stream_id?: string
  chunk_index?: number
  total_chunks?: number
  is_last_chunk?: boolean
}

export interface AIMessageMetadata extends BaseMessageMetadata {
  model?: string
  temperature?: number
  tokens_used?: number
  confidence_score?: number
  reasoning_steps?: string[]
}

// Union type for all possible metadata
export type MessageMetadata =
  | BaseMessageMetadata
  | ValuationMessageMetadata
  | DataCollectionMetadata
  | StreamingMetadata
  | AIMessageMetadata
  | Record<string, unknown> // Fallback for unknown metadata structures

// Strongly typed message interface
export interface Message {
  id: string
  type: 'user' | 'ai' | 'system' | 'suggestion'
  role?: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
  isComplete?: boolean
  metadata?: MessageMetadata
}
