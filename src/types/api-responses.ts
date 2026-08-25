/**
 * API Response Types - Strongly Typed API Responses
 *
 * Defines comprehensive types for all API responses.
 * Eliminates 'any' types with proper TypeScript definitions.
 */

import type { Message } from './message'
import type { ValuationSession } from './valuation'

// Session API responses
export interface ValuationSessionResponse {
  session: ValuationSession
  success: boolean
  message?: string
}

export interface CreateValuationSessionResponse extends ValuationSessionResponse {
  reportId: string
}

export interface UpdateValuationSessionResponse extends ValuationSessionResponse {
  updated: boolean
}

export interface SwitchViewResponse {
  success: boolean
  message?: string
  previousView?: 'manual' | 'conversational'
  currentView: 'manual' | 'conversational'
}

// Valuation API responses
export interface SaveValuationResponse {
  success: boolean
  valuation_id: string
  message?: string
  saved_at?: string
}

export interface SaveValuationResultResponse {
  success: boolean
  /** Durable Titan valuation_reports UUID. */
  reportId?: string
  /** Temporary Venus draft identifier. */
  sessionKey?: string
  /** ValuationIQ run identifier; always val_* when present. */
  engineRunId?: string
  reportStatus?: 'draft' | 'import_review' | 'calculating' | 'ready' | 'failed'
  origin?: 'native' | 'migrated_legacy'
  message: string
  reportReady?: boolean
  session?: ValuationSession
}

// Guest/Migration API responses
export interface GuestMigrationResponse {
  success: boolean
  migrated: boolean
  message?: string
  user_session_id?: string
  migratedReports?: string[]
  migratedSessions?: string[]
  errors?: string[]
}

// Conversation API responses
export interface ConversationStatusResponse {
  exists: boolean
  status: 'active' | 'completed' | 'error'
  message_count?: number
  last_activity?: string
  session_id?: string
}

export interface ConversationHistoryResponse {
  messages: Message[]
  exists: boolean
  total_count?: number
  has_more?: boolean
}

// Utility API responses
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  services: {
    database?: 'up' | 'down'
    cache?: 'up' | 'down'
    valuation_engine?: 'up' | 'down'
  }
  version?: string
}
