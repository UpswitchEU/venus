import type { User } from '../../contexts/AuthContextTypes'
import type { BuyerReadinessPackage } from '../buyerReadiness'
import type { ValuationRequest, YearDataInput } from './request'
import type { ValuationResponse } from './response'

// =============================================================================
// VALUATION TOOLBAR TYPES
// =============================================================================

export interface ValuationInputData {
  revenue: number
  ebitda: number
  industry: string
  country_code: string
  founding_year?: number
  employees?: number
  business_model?: string
  historical_years_data?: YearDataInput[]
  total_debt?: number
  cash?: number
  metrics?: {
    gross_margin: number
    ebitda_margin: number
    ebit_margin: number
    net_margin: number
    return_on_assets: number
    return_on_equity: number
    current_ratio: number
    quick_ratio: number
    cash_ratio: number
    debt_to_equity: number
    debt_to_assets: number
    interest_coverage: number
    asset_turnover: number
    inventory_turnover: number
    receivables_turnover: number
    payables_turnover: number
    revenue_growth: number
    financial_health_description: string
  }
}

export interface ValuationToolbarProps {
  onRefresh?: () => void
  onDownload?: () => void
  onFullScreen?: () => void
  isGenerating?: boolean
  user?: User | null
  valuationName?: string
  valuationId?: string
  activeTab?: 'preview' | 'history'
  onTabChange?: (tab: 'preview' | 'history') => void
  companyName?: string
  valuationMethod?: string
  // M&A Workflow: Version management
  versions?: import('../ValuationVersion').ValuationVersion[]
  activeVersion?: number
  onVersionSelect?: (versionNumber: number) => void
}

// NEW: Dual format display type
export interface ValuationAdjustmentDisplay {
  percentageFormat: string
  multipleFormat: string
  baseMultiple: number
  adjustedMultiple: number
  multipleImpact: number
  isApplicable: boolean
}

// =============================================================================
// UNIFIED VALUATION SESSION TYPES
// =============================================================================

/**
 * Unified ValuationSession that both manual and AI-guided flows populate
 * Extends ValuationRequest with session metadata for unified data management
 */
export interface ValuationSession {
  // Session metadata
  reportId: string // Durable Titan report UUID after first save
  sessionKey?: string // Temporary val_* concept/session identity
  engineRunId?: string // ValuationIQ val_* calculation identity
  reportStatus?: 'draft' | 'import_review' | 'calculating' | 'ready' | 'failed'
  origin?: 'native' | 'migrated_legacy'
  currentView: 'manual' | 'conversational' // Current UI view
  dataSource: 'manual' | 'conversational' | 'mixed' // Tracks which flow provided data
  status?: 'active' | 'completed' | 'expired' | string
  reportReady?: boolean
  name?: string // Custom valuation name (e.g., "Amadeus report")

  // Timestamps
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  lastSyncedAt?: Date // Last time data was synced between flows
  calculatedAt?: Date // When valuation was calculated

  // Data completeness tracking (0-100)
  completeness?: number

  // Partial data collection (incremental updates)
  partialData: Partial<ValuationRequest>

  // Complete session data (merged from partialData)
  // This is the canonical ValuationRequest that will be sent for calculation
  sessionData?: Partial<ValuationRequest>

  // Valuation result data (for completed valuations)
  valuationResult?: ValuationResponse // Full valuation result including calculations
  htmlReport?: string // Generated HTML report
  buyerReadiness?: BuyerReadinessPackage // Pre-transaction readiness package from Titan
}
