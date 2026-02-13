/**
 * StreamingChat Component - Segregated Interfaces
 *
 * Breaking down the fat StreamingChatProps interface into focused interfaces
 * following Interface Segregation Principle (ISP).
 */

// Base session identification
export interface StreamingChatSessionProps {
  sessionId: string
  userId?: string
}

// Core UI configuration
export interface StreamingChatUIProps {
  className?: string
  placeholder?: string
  disabled?: boolean
}

// Message lifecycle callbacks
export interface StreamingChatMessageCallbacks {
  onMessageComplete?: (message: import('../types/message').Message) => void
  onContinueConversation?: () => void
  onViewReport?: () => void
  onNormalizeEbitda?: () => void
  onRecalculateValuation?: () => void
}

// Valuation lifecycle callbacks
export interface StreamingChatValuationCallbacks {
  onValuationComplete?: (result: import('../types/valuation').ValuationResponse) => void
  onValuationStart?: () => void
  onCalculate?: () => void | Promise<void>
  isCalculating?: boolean
}

// Report update callbacks
export interface StreamingChatReportCallbacks {
  onReportUpdate?: (htmlContent: string, progress: number) => void
  onReportSectionUpdate?: (
    section: string,
    html: string,
    phase: number,
    progress: number,
    is_fallback?: boolean,
    is_error?: boolean,
    error_message?: string
  ) => void
  onSectionLoading?: (section: string, html: string, phase: number, data?: unknown) => void
  onSectionComplete?: (event: {
    sectionId: string
    sectionName: string
    html: string
    progress: number
    phase?: number
  }) => void
  onReportComplete?: (html: string, valuationId: string) => void
  onHtmlPreviewUpdate?: (html: string, previewType: string) => void
}

// Data collection callbacks
export interface StreamingChatDataCallbacks {
  onDataCollected?: (data: import('./StreamingChat').CollectedData) => void
  onValuationPreview?: (data: import('./StreamingChat').ValuationPreviewData) => void
  onCalculateOptionAvailable?: (data: import('./StreamingChat').CalculateOptionData) => void
  onProgressUpdate?: (data: unknown) => void
}

// Context and session management
export interface StreamingChatContextCallbacks {
  onContextUpdate?: (context: unknown) => void
  onPythonSessionIdReceived?: (pythonSessionId: string) => void
}

// Conversation restoration and initialization
export interface StreamingChatRestorationProps {
  initialMessage?: string | null
  autoSend?: boolean
  initialData?: Partial<unknown>
  initialMessages?: import('../types/message').Message[]
  isRestoring?: boolean
  isSessionInitialized?: boolean
  pythonSessionId?: string | null
  isRestorationComplete?: boolean
}

// Combined segregated interface - clients can pick what they need
export interface StreamingChatProps
  extends StreamingChatSessionProps,
    StreamingChatUIProps,
    StreamingChatMessageCallbacks,
    StreamingChatValuationCallbacks,
    StreamingChatReportCallbacks,
    StreamingChatDataCallbacks,
    StreamingChatContextCallbacks,
    StreamingChatRestorationProps {}

// Define data types locally to avoid circular imports
export interface CollectedData {
  field: string
  value: string | number | boolean
  timestamp?: number
  source?: 'user_input' | 'suggestion' | 'validation'
  confidence?: number
}

export interface ValuationPreviewData {
  estimatedValue?: number
  confidence?: number
  methodology?: string
  assumptions?: Record<string, unknown>
}

export interface CalculateOptionData {
  method: string
  parameters: Record<string, unknown>
  estimatedValue?: number
}

// Re-export Message type for convenience
export type { Message } from '../types/message'
