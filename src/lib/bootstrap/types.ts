/**
 * Session Bootstrap Types
 * 
 * World-class initialization system following Stripe/Klarna patterns.
 * These types define the complete state resolved BEFORE UI renders.
 * 
 * @module lib/bootstrap/types
 */

// ============================================================================
// Client Context Types (for accountant-for-client flow)
// ============================================================================

export interface ClientContext {
  clientUserId: string;
  clientEmail?: string;
  clientCompanyName?: string;
  accountantUserId: string;
  accountantEmail?: string;
  relationshipId: string;
  permissions: {
    canCreateValuations: boolean;
    canViewReports: boolean;
    canEditReports: boolean;
  };
}

// ============================================================================
// Identity Types
// ============================================================================

/**
 * AUTH-FIRST ARCHITECTURE: Guest flow has been removed.
 * All users must authenticate before accessing valuation features.
 * 
 * @deprecated 'guest' type is no longer supported - kept for backward compatibility during migration
 */
export type IdentityType = 'authenticated' | 'accountant_for_client';

/**
 * Identity state
 * 
 * AUTH-FIRST: Only authenticated users are supported
 */
export interface IdentityState {
  type: IdentityType;
  userId?: string;
  clientContext?: ClientContext;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ============================================================================
// Report/Session Types
// ============================================================================

export type ReportMode = 'new' | 'existing';
export type ReportStatus = 'active' | 'completed' | 'draft' | 'expired';
export type FlowType = 'manual' | 'conversational';

export interface ReportState {
  mode: ReportMode;
  reportId: string;
  hasExistingData: boolean;
  /**
   * Indicates if there's a completed valuation result (OUTPUT data).
   * Different from hasExistingData which includes INPUT data (form fields).
   * 
   * Use this to determine loading step messaging:
   * - hasValuationResult = true → "Restoring valuation package"
   * - hasValuationResult = false → "Initializing" (even if hasExistingData is true)
   */
  hasValuationResult?: boolean;
  version?: number;
  status: ReportStatus;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date;
  currentStep?: number;
}

// ============================================================================
// Prefill Data Types
// ============================================================================

export type PrefillSource = 'kbo' | 'user_profile' | 'session' | 'mercury' | 'url_params';

export interface CompanyInfo {
  companyName?: string;
  kboNumber?: string;
  vatNumber?: string;
  legalForm?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  naceCode?: string;
  naceDescription?: string;
  foundingYear?: number;
  isActive?: boolean;
}

export interface PartialFinancials {
  revenue?: number;
  ebitda?: number;
  netIncome?: number;
  totalAssets?: number;
  totalEquity?: number;
  employeeCount?: number;
  revenueGrowth?: number;
  ebitdaMargin?: number;
  // Year data for historical financials
  yearData?: {
    [year: number]: {
      revenue?: number;
      ebitda?: number;
      netIncome?: number;
    };
  };
}

export interface BusinessTypeInfo {
  id: string;
  code?: string;
  title: string;
  category?: string;
  industry?: string;
  industryMapping?: string;
  multiples?: {
    revenue?: { min: number; max: number; median: number };
    ebitda?: { min: number; max: number; median: number };
  };
}

export interface KBOCompanyEntity {
  kboNumber: string;
  companyName: string;
  legalForm?: string;
  status?: string;
  vatNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  naceCode?: string;
  naceDescription?: string;
  foundationDate?: string;
  lastUpdated?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PrefillData {
  sources: PrefillSource[];
  companyInfo?: CompanyInfo;
  financials?: PartialFinancials;
  businessType?: BusinessTypeInfo;
  kboData?: KBOCompanyEntity;
  confidence: number; // 0-1 how complete the prefill is
  fieldsPopulated: string[];
  fieldsRemaining: string[];
}

// ============================================================================
// UI Hints
// ============================================================================

export interface UIHints {
  showWelcomeBack: boolean;
  resumableSession: boolean;
  suggestedFlow: FlowType;
  prefilledFieldCount: number;
  totalFieldCount: number;
  showKboVerification: boolean;
  showAccountantBanner: boolean;
  returnUrl?: string;
  sourceApp?: string;
}

export interface CreditStatus {
  allowed: boolean;
  credits_remaining: number;
  credits_limit: number;
  requires_upgrade: boolean;
  message?: string;
  upgrade_path?: 'accountant_pro' | 'client_premium';
}

// ============================================================================
// Main Bootstrap State
// ============================================================================

export interface SessionBootstrapState {
  // Identity Resolution
  identity: IdentityState;
  
  // Report Resolution
  report: ReportState;
  
  // Prefillable Data (from all sources)
  prefillData: PrefillData;
  
  // UI Hints
  ui: UIHints;
  
  // Credit Status (optional - only present if credit check was performed)
  creditStatus?: CreditStatus;
  
  // Metadata
  bootstrapVersion: string;
  bootstrappedAt: Date;
  bootstrapDurationMs: number;
}

// ============================================================================
// Bootstrap Context (input to bootstrap process)
// ============================================================================

/**
 * Bootstrap context (input to bootstrap process)
 * 
 * AUTH-FIRST: guestSessionId removed - authentication required
 */
export interface BootstrapContext {
  url: string;
  reportId?: string;
  clientToken?: string;
  clientId?: string; // Client relationship ID for accountant flow when no clientToken
  prefilledQuery?: string;
  flow?: FlowType;
  mode?: 'edit' | 'view';
  version?: number;
  locale?: string;
  embedded?: boolean;
  returnUrl?: string;
  sourceApp?: string;
  cookies?: string;
}

/**
 * Bootstrap hints
 * 
 * AUTH-FIRST: hasGuestSessionId removed - authentication required
 */
export interface BootstrapHints {
  hasClientToken: boolean;
  hasReportId: boolean;
  hasPrefilledQuery: boolean;
  isNewReport: boolean;
  isEmbedded: boolean;
  requestedFlow: FlowType | null;
  requestedMode: 'edit' | 'view' | null;
  locale: string;
}

// ============================================================================
// Resolver Types
// ============================================================================

export interface ResolverResult<T> {
  success: boolean;
  data: T;
  error?: string;
  source?: string;
  durationMs: number;
}

export interface BootstrapResolver<T> {
  resolve(context: BootstrapContext, hints: BootstrapHints): Promise<ResolverResult<T>>;
  fallback(): T;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Bootstrap API request
 * 
 * AUTH-FIRST: guestSessionId removed - authentication required
 */
export interface BootstrapRequest {
  reportId?: string;
  clientToken?: string;
  prefilledQuery?: string;
  flow?: FlowType;
  mode?: 'edit' | 'view';
  version?: number;
  locale?: string;
}

export interface BootstrapResponse {
  success: boolean;
  data?: {
    identity: IdentityState;
    report: ReportState;
    prefill: PrefillData;
    ui: UIHints;
  };
  error?: string;
  bootstrapDurationMs: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class BootstrapError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export const BootstrapErrorCodes = {
  AUTH_FAILED: 'AUTH_FAILED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  CLIENT_CONTEXT_INVALID: 'CLIENT_CONTEXT_INVALID',
  KBO_LOOKUP_FAILED: 'KBO_LOOKUP_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type BootstrapErrorCode = typeof BootstrapErrorCodes[keyof typeof BootstrapErrorCodes];

// ============================================================================
// Constants
// ============================================================================

export const BOOTSTRAP_VERSION = '2.0.0';

/**
 * AUTH-FIRST: Authentication is now required for all valuation operations.
 * Guest flow has been removed to simplify architecture and improve data quality.
 */
export const REQUIRE_AUTH_FOR_VALUATION = true;

export const DEFAULT_IDENTITY: IdentityState = {
  type: 'authenticated',
};

export const DEFAULT_REPORT: ReportState = {
  mode: 'new',
  reportId: '',
  hasExistingData: false,
  hasValuationResult: false,
  status: 'draft',
};

export const DEFAULT_PREFILL: PrefillData = {
  sources: [],
  confidence: 0,
  fieldsPopulated: [],
  fieldsRemaining: [
    'company_name',
    'business_type_id',
    'industry',
    'country_code',
    'founding_year',
    'employee_count',
    'revenue',
    'ebitda',
  ],
};

export const DEFAULT_UI_HINTS: UIHints = {
  showWelcomeBack: false,
  resumableSession: false,
  suggestedFlow: 'manual',
  prefilledFieldCount: 0,
  totalFieldCount: 25,
  showKboVerification: false,
  showAccountantBanner: false,
};

export const DEFAULT_BOOTSTRAP_STATE: SessionBootstrapState = {
  identity: DEFAULT_IDENTITY,
  report: DEFAULT_REPORT,
  prefillData: DEFAULT_PREFILL,
  ui: DEFAULT_UI_HINTS,
  bootstrapVersion: BOOTSTRAP_VERSION,
  bootstrappedAt: new Date(),
  bootstrapDurationMs: 0,
};
