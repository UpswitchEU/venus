'use client'

/**
 * Chat Assistant Drawer
 *
 * Slide-in drawer for the AI co-pilot. Always available, contextual to current field.
 * Implements bi-directional sync: Chat commands update form fields, and vice versa.
 *
 * YC Advisor Pattern: "The Chat is the Navigator, not the Pilot"
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCheck,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { springDefault } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import { trackAIAssistantMessage, trackAIAssistantOpen } from '@/lib/analytics'

// ─────────────────────────────────────────
// SMART NUMBER & COMMAND PARSING
// ─────────────────────────────────────────

interface ParsedValue {
  field: string
  label: string
  value: number
  originalText: string
}

interface ParsedCommand {
  type: 'normalize' | 'set' | 'add'
  field: string
  label: string
  value: number
  originalText: string
}

/**
 * Parse normalization commands from user input
 * Supports: "Normaliseer eigenaarssalaris naar €60k", "Set EBITDA to 500k", etc.
 */
function parseNormalizationCommands(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = []
  const _lowerText = text.toLowerCase()

  // Dutch command patterns
  const normalizePatterns = [
    // "Normaliseer eigenaarssalaris naar €60k"
    /normalis(?:eer|atie)?\s+([a-zà-ÿ\s]+?)\s+(?:naar|op|tot)\s+[€]?\s*([\d.,]+)\s*(k|m|miljoen|duizend)?/gi,
    // "Zet huurkosten op €24k"
    /zet\s+([a-zà-ÿ\s]+?)\s+(?:naar|op)\s+[€]?\s*([\d.,]+)\s*(k|m)?/gi,
    // "Pas autokosten aan naar €18k"
    /pas\s+([a-zà-ÿ\s]+?)\s+aan\s+(?:naar|op)\s+[€]?\s*([\d.,]+)\s*(k|m)?/gi,
    // "Voeg €35k toe aan eenmalige kosten"
    /voeg\s+[€]?\s*([\d.,]+)\s*(k|m)?\s+toe\s+(?:aan|bij)\s+([a-zà-ÿ\s]+)/gi,
  ]

  // English patterns for flexibility
  const englishPatterns = [
    /normalize\s+([a-z\s]+?)\s+to\s+[€$]?\s*([\d.,]+)\s*(k|m)?/gi,
    /set\s+([a-z\s]+?)\s+to\s+[€$]?\s*([\d.,]+)\s*(k|m)?/gi,
  ]

  // Field name mapping (Dutch/English to internal field names)
  const fieldMappings: Record<string, { field: string; label: string }> = {
    eigenaarssalaris: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    eigenaarsalaris: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    salaris: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    loon: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    'owner salary': { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    huur: { field: 'rent', label: 'Huurkosten' },
    huurkosten: { field: 'rent', label: 'Huurkosten' },
    huisvestingskosten: { field: 'rent', label: 'Huurkosten' },
    rent: { field: 'rent', label: 'Huurkosten' },
    auto: { field: 'vehicle', label: 'Autokosten' },
    autokosten: { field: 'vehicle', label: 'Autokosten' },
    voertuig: { field: 'vehicle', label: 'Autokosten' },
    voertuigkosten: { field: 'vehicle', label: 'Autokosten' },
    car: { field: 'vehicle', label: 'Autokosten' },
    ebitda: { field: 'ebitda', label: 'EBITDA' },
    winst: { field: 'ebitda', label: 'EBITDA' },
    eenmalige: { field: 'oneTime', label: 'Eenmalige kosten' },
    'eenmalige kosten': { field: 'oneTime', label: 'Eenmalige kosten' },
    'juridische kosten': { field: 'oneTime', label: 'Eenmalige kosten' },
    privé: { field: 'personal', label: 'Privékosten' },
    privékosten: { field: 'personal', label: 'Privékosten' },
    familie: { field: 'personal', label: 'Privékosten' },
    familieleden: { field: 'personal', label: 'Privékosten' },
  }

  const parseValue = (numStr: string, suffix?: string): number => {
    let value = parseFloat(numStr.replace(/\./g, '').replace(',', '.'))
    if (suffix) {
      const s = suffix.toLowerCase()
      if (s === 'k' || s === 'duizend') value *= 1000
      else if (s === 'm' || s === 'miljoen') value *= 1000000
    }
    return value
  }

  const findField = (fieldText: string): { field: string; label: string } | null => {
    const normalized = fieldText.trim().toLowerCase()
    for (const [key, mapping] of Object.entries(fieldMappings)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return mapping
      }
    }
    return null
  }

  // Process all patterns
  ;[...normalizePatterns, ...englishPatterns].forEach((pattern) => {
    let match
    const regex = new RegExp(pattern.source, pattern.flags)
    while ((match = regex.exec(text)) !== null) {
      let fieldText: string
      let numStr: string
      let suffix: string | undefined

      // Handle different capture group orders
      if (match[1].match(/[\d.,]/)) {
        // Pattern like "Voeg €35k toe aan eenmalige kosten"
        numStr = match[1]
        suffix = match[2]
        fieldText = match[3]
      } else {
        fieldText = match[1]
        numStr = match[2]
        suffix = match[3]
      }

      const fieldMapping = findField(fieldText)
      if (fieldMapping) {
        const value = parseValue(numStr, suffix)
        if (!commands.find((c) => c.field === fieldMapping.field && c.value === value)) {
          commands.push({
            type: 'normalize',
            field: fieldMapping.field,
            label: fieldMapping.label,
            value,
            originalText: match[0],
          })
        }
      }
    }
  })

  return commands
}

/**
 * Parse financial values from user input text (enhanced)
 * Supports formats: 500k, 500K, €500.000, 500000, 2.5M, 2,5M
 */
function parseFinancialValues(text: string): ParsedValue[] {
  const results: ParsedValue[] = []
  const lowerText = text.toLowerCase()

  // Number patterns: 500k, 500K, €500.000, 500000, 2.5M, 2,5M
  const numberPatterns = [
    // K suffix: 500k, 500K
    /(\d+(?:[.,]\d+)?)\s*k\b/gi,
    // M suffix: 2.5M, 2,5M
    /(\d+(?:[.,]\d+)?)\s*m\b/gi,
    // Euro with dots: €500.000
    /€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g,
    // Plain large numbers: 500000
    /\b(\d{4,})\b/g,
  ]

  // Enhanced field detection patterns with Belgian MAR grootboek codes
  const fieldPatterns: { pattern: RegExp; field: string; label: string; code?: string }[] = [
    { pattern: /ebitda|winst/i, field: 'ebitda', label: 'EBITDA' },
    { pattern: /omzet|revenue/i, field: 'revenue', label: 'Omzet' },
    {
      pattern: /salaris|loon|eigenaar/i,
      field: 'ownerSalary',
      label: 'Eigenaarssalaris',
      code: '620',
    },
    { pattern: /huur|rent|kantoor|pand/i, field: 'rent', label: 'Huurkosten', code: '610' },
    { pattern: /auto|voertuig|car|wagen/i, field: 'vehicle', label: 'Autokosten', code: '614' },
    { pattern: /juridisch|legal/i, field: 'oneTime', label: 'Juridische kosten', code: '647' },
    {
      pattern: /advies|advieskosten|vergoeding/i,
      field: 'oneTime',
      label: 'Advieskosten',
      code: '613',
    },
    { pattern: /eenmalig/i, field: 'oneTime', label: 'Eenmalige kosten', code: '644' },
    { pattern: /privé|familie|persoon/i, field: 'personal', label: 'Privékosten', code: '649' },
  ]

  // Find numbers and their contexts
  for (const pattern of numberPatterns) {
    let match
    const regex = new RegExp(pattern.source, pattern.flags)

    while ((match = regex.exec(text)) !== null) {
      let rawNumber = match[1] || match[0]
      let value: number

      // Parse the number
      rawNumber = rawNumber.replace(/€\s*/g, '').replace(/\./g, '').replace(/,/g, '.')
      value = parseFloat(rawNumber)

      // Apply multiplier based on suffix
      const originalMatch = match[0]

      if (originalMatch.toLowerCase().includes('k')) {
        value *= 1000
      } else if (originalMatch.toLowerCase().includes('m')) {
        value *= 1000000
      }

      // Determine field from context
      for (const fp of fieldPatterns) {
        if (fp.pattern.test(lowerText)) {
          // Avoid duplicates
          if (!results.find((r) => r.field === fp.field && r.value === value)) {
            results.push({
              field: fp.field,
              label: fp.label,
              value,
              originalText: originalMatch,
            })
          }
          break
        }
      }

      // If no specific field found but it's a substantial number, suggest as EBITDA
      if (results.length === 0 && value >= 10000) {
        results.push({
          field: 'ebitda',
          label: 'EBITDA',
          value,
          originalText: originalMatch,
        })
      }
    }
  }

  return results
}

// Export types and functions
export type { ParsedValue, ParsedCommand }
export { parseNormalizationCommands, parseFinancialValues }

// Types
export interface FieldUpdate {
  field: string
  value: number
  label: string
  // YC-Standard: Impact framing + provenance
  impact?: {
    ebitdaDelta: number // e.g., +60000
    valuationDelta: number // e.g., +312000 (at 5.2x)
    multiple?: number // e.g., 5.2
  }
  source?: 'yuki' | 'exact' | 'manual' | 'ai' | 'kbo'
  grootboekCode?: string
  confidence?: 'high' | 'medium' | 'low'
}

export interface NormalisationSuggestion {
  id: string
  code: string
  description: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  amount: number
  reason: string
  sourceRef?: string
  status: 'pending' | 'accepted' | 'rejected'
  // Impact calculation
  ebitdaImpact?: number
  valuationImpact?: number
  multiple?: number
}

/**
 * Pending valuation-run proposal from the AI's run_valuation tool.
 * Decision = local UI state after the user clicks; back-end side effects
 * (the actual /api/v2/valuations/calculate run) are dispatched by the parent's
 * `onApproveValuationRun` callback.
 */
export interface ValuationRunRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  reportId?: string
  methods?: string[] | null
  estimatedCredits?: number
  inputsSummary?: {
    business_name: string | null
    business_type: string | null
    industry: string | null
    revenue: string | null
    ebitda: string | null
    ebitda_normalized: string | null
    pending_normalizations: number
    applied_normalizations: number
  }
  note?: string | null
  reason?: string
  missing?: string[]
  message?: string
  decision?: 'approved' | 'rejected'
}

/**
 * Pending PDF-generation proposal from the AI's generate_report tool.
 * Approve fires the existing `generatePdf` flow on the parent — no extra credit.
 */
export interface ReportGenerationRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  reportId?: string
  estimatedCredits?: number
  resultSummary?: {
    business_name: string | null
    business_type: string | null
    valuation_method: string | null
    currency: string
    midpoint: number | null
    min: number | null
    max: number | null
    confidence_score: number | null
    calculated_at: string | null
  }
  note?: string | null
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

/**
 * Pending Sellability-compute proposal from the AI's run_sellability tool.
 * Approve POSTs to Venus's /api/sellability/score proxy (Titan-backed). Free —
 * no credit consumed. Q1/Q2/Q3 answers come from the persisted owner profile.
 */
export interface SellabilityRunRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  estimatedCredits?: number
  answers?: {
    q1_top3_concentration_pct: number | null
    q2_contracted_share: string | null
    q3_books_cleanliness: string | null
  }
  currentScore?: {
    score: number
    band: string
    computed_at: string | Date
  } | null
  note?: string | null
  reason?: string
  missing?: string[]
  message?: string
  decision?: 'approved' | 'rejected'
  /** Set after successful compute so the card can show the new score inline. */
  computedScore?: { score: number; band: string; confidence?: string } | null
}

/**
 * Read-only Belgian public-data bootstrap from Titan's
 * bootstrap_belgian_company tool. This gives the advisor/owner a fast KBO +
 * NBB/CBSO context card before they connect integrations or upload CSV data.
 */
export interface BelgianCompanyBootstrap {
  id: string
  status: 'ok' | 'partial' | 'blocked' | 'failed'
  reason?: string
  message?: string
  identity?: {
    legalName?: string | null
    legalForm?: string | null
    kboNumber?: string | null
    address?: string | null
    city?: string | null
    postalCode?: string | null
    naceCode?: string | null
    naceDescription?: string | null
    foundationDate?: string | null
    isActive?: boolean | null
  } | null
  benchmark?: {
    status?: string | null
    businessTypeTitle?: string | null
    evEbitdaMedian?: number | null
    confidence?: string | null
  } | null
  filingSummary?: {
    status?: string | null
    source?: string | null
    filingYear?: number | null
    yearsAvailable?: number | null
    revenue?: number | null
    ebitda?: number | null
    dataHealthMessage?: string | null
  } | null
  valuationPreview?: {
    status?: string | null
    method?: string | null
    ebitdaUsed?: number | null
    ebitdaYear?: number | null
    evMid?: number | null
    equityMid?: number | null
  } | null
}

/**
 * Read-only anonymized listing preview from Titan's get_listing_preview tool.
 * Shows the marketplace-facing draft before buyer profiling and publish.
 */
export interface ListingPreview {
  id: string
  status: 'ok' | 'blocked'
  reportId?: string
  sourceBusinessName?: string | null
  reason?: string
  message?: string
  missingFields?: string[]
  nextActionHint?: string | null
  preview?: {
    title?: string | null
    businessType?: string | null
    sector?: string | null
    industry?: string | null
    region?: string | null
    province?: string | null
    yearCommenced?: number | null
    employeeRange?: string | null
    revenueRange?: string | null
    equityStake?: string | null
    ownershipStructure?: string | null
    ownerManagersCount?: number | null
    status?: string | null
    featured?: boolean | null
    ndaRequired?: boolean | null
    viewCount?: number | null
    hasVerifiedValuation?: boolean | null
  } | null
}

export interface MethodReadinessPreview {
  id: string
  status: 'ok' | 'blocked'
  reportId?: string
  businessName?: string | null
  readinessSource?: string | null
  readyMethods: string[]
  blockedMethods: string[]
  reason?: string
  message?: string
}

export interface ClientDataReadinessPreview {
  id: string
  status: string
  clientId?: string
  businessName?: string | null
  hasBusinessCard?: boolean
  hasSyncedFinancials?: boolean
  hasFinancialData?: boolean
  financialSyncedAt?: string | null
  stpStatus?: string | null
  computedStpStatus?: string | null
  latestValuationId?: string | null
  accountingSources?: Array<{
    provider: string
    clientKey?: string | null
    isPrimaryForValuation?: boolean
    lastSyncAt?: string | null
  }>
  importQualitySummary?: {
    years: string[]
    minConfidence?: number | null
    errorCount?: number
    warningCount?: number
    infoCount?: number
    actionableFlagCount?: number
    topFlags?: Array<{
      year?: string
      field?: string | null
      code?: string | null
      severity?: string | null
      message?: string | null
    }>
  } | null
  recommendedNextAction?: string
  recommendedNextTool?: string | null
  recommendedNextRoute?: string | null
  message?: string
}

/**
 * Pending marketplace-listing proposal from Titan's advisor-scoped
 * create_listing tool. Approve returns the advisor to Mercury's canonical
 * publish wizard; this card never writes a listing directly.
 */
export interface ListingCreateRequest {
  id: string
  status: 'pending_approval' | 'auto_approved' | 'blocked'
  reportId?: string
  accountantCustomerId?: string | null
  visibility?: 'public' | 'private'
  valuationSummary?: {
    business_name?: string | null
    business_type?: string | null
    industry?: string | null
    currency?: string
    midpoint?: string | null
    min?: string | null
    max?: string | null
  }
  note?: string | null
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

export interface BuyerProfilePreview {
  id: string
  status: 'ok' | 'blocked'
  reportId?: string
  sourceBusinessName?: string | null
  reason?: string
  message?: string
  listingReadiness?: {
    status?: string | null
    missingFields: string[]
  } | null
  buyerSegments?: Array<{
    id?: string
    label: string
    fitScore?: number | null
    recommendedAngle?: string | null
  }>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isError?: boolean
  attachments?: { name: string; type: string; url: string }[]
  // YC-Standard: Structured cards with impact framing
  fieldUpdates?: FieldUpdate[]
  // AI-generated normalization suggestions with accept/reject
  normalisationSuggestions?: NormalisationSuggestion[]
  // AI-proposed valuation runs (from run_valuation tool) — propose-only, user clicks Run
  valuationRunRequests?: ValuationRunRequest[]
  // AI-proposed PDF generations (from generate_report tool) — propose-only, user clicks Generate
  reportGenerationRequests?: ReportGenerationRequest[]
  // AI-proposed Sellability computes (from run_sellability tool) — propose-only, user clicks Compute
  sellabilityRunRequests?: SellabilityRunRequest[]
  // AI-generated Belgian public-data bootstrap cards (KBO + NBB/CBSO + benchmark preview)
  belgianCompanyBootstraps?: BelgianCompanyBootstrap[]
  // AI-generated advisor-client readiness cards (Hermes import state)
  clientDataReadinessPreviews?: ClientDataReadinessPreview[]
  // AI-generated valuation-method readiness cards (read-only; pre-ValuationIQ run)
  methodReadinessPreviews?: MethodReadinessPreview[]
  // AI-generated listing previews (read-only anonymized marketplace draft)
  listingPreviews?: ListingPreview[]
  // AI-proposed marketplace listings (from create_listing tool) — propose-only, user opens wizard
  listingCreateRequests?: ListingCreateRequest[]
  // AI-generated buyer profile previews (read-only; not real matched buyers)
  buyerProfilePreviews?: BuyerProfilePreview[]
  /**
   * Read-only registry-search picker rendered when the agent calls
   * search_kbo_registry (BE) or search_kvk_registry (NL). Click a row
   * to fire a follow-up "Use {name} ({registry} {number})" message and
   * let the agent chain. Mirrors the Mercury RegistrySearchResultsCard.
   */
  registrySearchResults?: Array<{
    id: string
    registry: 'KBO' | 'KVK'
    query: string
    totalFound: number
    hits: Array<{
      companyNumber: string
      companyName: string
      legalForm?: string | null
      city?: string | null
      postalCode?: string | null
      address?: string | null
      countryCode?: string | null
      naceCode?: string | null
      naceDescription?: string | null
      businessTypeId?: string | null
      businessTypeTitle?: string | null
      foundationDate?: string | null
      isActive?: boolean | null
    }>
    coverageWarning?: 'kvk_not_in_dataset' | 'upstream_degraded'
    note?: string
    status?: 'ok' | 'failed'
  }>
  // Task-driven: open tasks the user can complete
  tasks?: {
    id: string
    type: 'confirm' | 'choose' | 'enter' | 'upload' | 'approve'
    label: string
    context?: string
    completed?: boolean
  }[]
}

export interface FieldContext {
  field: string
  label: string
  value?: any
  hint?: string
}

export interface SuggestionContext {
  fieldContext?: FieldContext
  hasReport?: boolean
  hasEbitda?: boolean
  hasFinancials?: boolean
  pendingNormalizationsCount?: number
}

/**
 * High-severity data-quality warning surfaced from the engine.
 *
 * Shape mirrors `response.data_quality_warnings[i]` produced by ValuationIQ
 * (Pass-3 aggregation). The drawer renders these as actionable cards so
 * advisors resolve issues IN the assistant — not on the final report. The
 * goal is a clean, defensible PDF; the assistant catches the problems first.
 */
export interface QualityWarning {
  type: string
  severity: 'high' | 'medium' | 'low' | string
  message?: string
  recommendation?: string
  step_number?: number
  /** Locale-prepared CTA label (e.g. "Fix sector"). */
  cta_label?: string
  /** Optional command the CTA sends to the assistant verbatim. */
  cta_prompt?: string
}

export interface StartupAssistantIssue {
  id: string
  severity: 'block' | 'warn' | 'info'
  title: string
  body: string
  action: string
  ctaLabel: string
  ctaPrompt: string
  jumpLabel?: string
}

interface ChatAssistantDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatMessage[]
  onSendMessage: (
    content: string,
    attachments?: File[],
    detectedValues?: ParsedValue[],
    parsedCommands?: ParsedCommand[]
  ) => void
  isGenerating?: boolean
  // Context from the form
  companyName?: string
  fieldContext?: FieldContext
  hasReport?: boolean
  hasEbitda?: boolean
  pendingNormalizationsCount?: number
  /**
   * High-severity warnings from the latest valuation result. The drawer shows
   * each as an actionable card; clicking the CTA sends a prefilled message to
   * the assistant. Resolved/dismissed state is owned by the parent (so it can
   * persist with the session). Pass an empty array (or omit) to hide the rail.
   */
  qualityWarnings?: QualityWarning[]
  startupIssues?: StartupAssistantIssue[]
  /** Called when the advisor dismisses a warning (acknowledged without acting). */
  onDismissQualityWarning?: (warningType: string) => void
  /** Called when the advisor clicks the CTA. Sends `prompt` into the chat. */
  onResolveQualityWarning?: (warningType: string, prompt: string) => void
  /** Called when the advisor dismisses a startup issue card. */
  onDismissStartupIssue?: (issueId: string) => void
  /** Called when CTA is clicked for startup issue remediation. */
  onResolveStartupIssue?: (issueId: string, prompt: string) => void
  /** Optional jump helper (e.g. scroll to startup step). */
  onJumpToStartupIssue?: (issueId: string) => void
  // Bi-directional sync: when AI suggests field updates
  onApplyFieldUpdate?: (field: string, value: any) => void
  pendingUpdates?: { field: string; value: any; label: string }[]
  onAcceptUpdate?: (field: string) => void
  onRejectUpdate?: (field: string) => void
  // Normalization suggestion handlers
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  // Run-valuation proposal handlers (propose-only AI tool — see run_valuation.tool.ts)
  onApproveValuationRun?: (proposalId: string, reportId?: string) => void
  onRejectValuationRun?: (proposalId: string) => void
  // Report-generation proposal handlers (propose-only AI tool — see generate_report.tool.ts)
  onApproveReportGeneration?: (proposalId: string, reportId?: string) => void
  onRejectReportGeneration?: (proposalId: string) => void
  // Sellability-compute proposal handlers (propose-only AI tool — see run_sellability.tool.ts)
  onApproveSellabilityRun?: (proposalId: string) => void
  onRejectSellabilityRun?: (proposalId: string) => void
  // Listing proposal handlers (propose-only AI tool — see create_listing.tool.ts)
  onApproveListingCreate?: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null,
    visibility?: 'public' | 'private'
  ) => void
  onRejectListingCreate?: (proposalId: string) => void
  // Quick suggestion pills for common normalizations
  showQuickNormalizations?: boolean
  // Command pill click handler - auto-fills and sends
  onCommandPillClick?: (command: string) => void
  // Tool execution indicator (Claude is fetching data)
  toolInProgress?: string | null
  // Retry failed message
  onRetry?: (messageId: string) => void
  // Start a new conversation
  onNewConversation?: () => void
}

// Contextual suggestions based on report state, financial data, and field
const MIN_SUGGESTIONS = 3
const PAD_KEY = 'suggestions.askQuestion'

type SuggestionItem = { key: string; params?: Record<string, string> }

const getContextualSuggestionKeys = (ctx: SuggestionContext): SuggestionItem[] => {
  const { fieldContext, hasReport = false, hasEbitda = false, pendingNormalizationsCount = 0 } = ctx

  const items: SuggestionItem[] = []

  // Value / worth: whatWorth when no report, explainValue when report exists
  if (!hasReport) {
    items.push({ key: 'suggestions.whatWorth' })
  } else {
    items.push({ key: 'suggestions.explainValue' })
  }

  // Generate report: only when no report yet
  if (!hasReport) {
    items.push({ key: 'suggestions.generateReport' })
  }

  // Normalizations
  items.push({ key: 'suggestions.whichNorms' })
  if (pendingNormalizationsCount > 0) {
    items.push({ key: 'suggestions.whichNormsApply' })
  }

  // EBITDA explanation: only when EBITDA has a value
  if (hasEbitda) {
    const yearMatch =
      fieldContext?.field === 'ebitda' && fieldContext?.label
        ? fieldContext.label.match(/\b(20\d{2})\b/)
        : null
    const year = yearMatch?.[1]
    if (year) {
      items.push({ key: 'suggestions.explainEbitdaFor', params: { year } })
    } else {
      items.push({ key: 'suggestions.explainEbitda' })
    }
  }

  // Pad to minimum
  while (items.length < MIN_SUGGESTIONS) {
    items.push({ key: PAD_KEY })
  }

  return items
}

export function ChatAssistantDrawer({
  open,
  onOpenChange,
  messages,
  onSendMessage,
  isGenerating = false,
  companyName,
  fieldContext,
  hasReport = false,
  hasEbitda = false,
  pendingNormalizationsCount = 0,
  onApplyFieldUpdate,
  pendingUpdates = [],
  onAcceptUpdate,
  onRejectUpdate,
  qualityWarnings = [],
  startupIssues = [],
  onDismissQualityWarning,
  onResolveQualityWarning,
  onDismissStartupIssue,
  onResolveStartupIssue,
  onJumpToStartupIssue,
  onAcceptNormalisation,
  onRejectNormalisation,
  onApproveValuationRun,
  onRejectValuationRun,
  onApproveReportGeneration,
  onRejectReportGeneration,
  onApproveSellabilityRun,
  onRejectSellabilityRun,
  onApproveListingCreate,
  onRejectListingCreate,
  showQuickNormalizations = false,
  onCommandPillClick,
  toolInProgress,
  onRetry,
  onNewConversation,
}: ChatAssistantDrawerProps) {
  const ca = useTranslations('chatAssistant')
  const nh = useTranslations('normalizationHub')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const [input, setInput] = useState('')

  // Handler for command pill clicks - auto-fills and sends
  const handleCommandPillClick = useCallback(
    (command: string) => {
      if (onCommandPillClick) {
        onCommandPillClick(command)
      } else {
        // Fallback: set input and trigger submit
        setInput(command)
        // Use setTimeout to ensure state is updated before submitting
        setTimeout(() => {
          const commands = parseNormalizationCommands(command)
          onSendMessage(command, undefined, undefined, commands.length > 0 ? commands : undefined)
          setInput('')
        }, 0)
      }
    },
    [onCommandPillClick, onSendMessage]
  )
  const [attachments, setAttachments] = useState<File[]>([])
  const [detectedValues, setDetectedValues] = useState<ParsedValue[]>([])
  const [detectedCommands, setDetectedCommands] = useState<ParsedCommand[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const suggestionItems = getContextualSuggestionKeys({
    fieldContext,
    hasReport,
    hasEbitda,
    pendingNormalizationsCount,
  })
  const suggestions = suggestionItems.map((item) =>
    item.params ? ca(item.key as any, item.params) : ca(item.key as any)
  )
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Robust scroll lock when drawer is open (iOS Safari + Android)
  useScrollLock(open)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages and during streaming content updates
  const _lastMsgContent = messages[messages.length - 1]?.content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [])

  // Smart parsing - detect values and commands as user types
  useEffect(() => {
    if (input.length > 5) {
      // Parse normalization commands first (higher priority)
      const commands = parseNormalizationCommands(input)
      setDetectedCommands(commands)

      // Only parse values if no commands detected
      if (commands.length === 0) {
        const parsed = parseFinancialValues(input)
        setDetectedValues(parsed)
      } else {
        setDetectedValues([])
      }
    } else {
      setDetectedValues([])
      setDetectedCommands([])
    }
  }, [input])

  useEffect(() => {
    if (open) {
      trackAIAssistantOpen()
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open])

  // Global keyboard shortcuts: Escape to close, Cmd+Shift+L for new conversation
  useEffect(() => {
    if (!open) return
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'l') {
        e.preventDefault()
        onNewConversation?.()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, onOpenChange, onNewConversation])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!input.trim() && attachments.length === 0) return
      trackAIAssistantMessage()
      onSendMessage(
        input,
        attachments,
        detectedValues.length > 0 ? detectedValues : undefined,
        detectedCommands.length > 0 ? detectedCommands : undefined
      )
      setInput('')
      setAttachments([])
      setDetectedValues([])
      setDetectedCommands([])
    },
    [input, attachments, detectedValues, detectedCommands, onSendMessage]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) setAttachments((prev) => [...prev, ...Array.from(files)])
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Filter out empty streaming placeholders (content will appear via streaming)
  const visibleMessages = messages.filter((m) => m.role !== 'assistant' || m.content)
  const isEmpty = visibleMessages.length === 0
  // Only show the loading skeleton when there's no assistant message actively receiving content
  const lastVisible = visibleMessages[visibleMessages.length - 1]
  const showLoadingSkeleton = isGenerating && (!lastVisible || lastVisible.role !== 'assistant')

  // Track focus state for premium glow effect
  const [isInputFocused, setIsInputFocused] = useState(false)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — softer, no blur (matches Cursor/Lovable). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springDefault}
            onClick={() => onOpenChange(false)}
            onTouchMove={(e) => e.preventDefault()}
            className="fixed inset-0 z-40 bg-black/30 touch-none overscroll-none"
          />

          {/* Drawer Panel — plain surface, no decorative border. */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={springDefault}
            className={cn(
              'fixed right-0 top-0 bottom-0 z-50',
              'w-full h-full p-0 flex flex-col',
              'sm:w-[440px] md:w-[480px] lg:w-[520px]',
              'bg-background',
              'pb-[env(safe-area-inset-bottom)]'
            )}
          >
            {/* Header — minimal: title + close. No CTAs.
                The normalisation modal stays reachable from the main form UI;
                if the assistant needs to surface "review normalisations" it
                does so via an insight, not via permanent header chrome. */}
            <div className="shrink-0 px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-foreground/80">{ca('title')}</h2>
                {fieldContext && (
                  <p className="text-xs text-foreground/45 truncate mt-0.5">
                    {fieldContext.label || ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors touch-manipulation"
                aria-label={ca('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {startupIssues.length > 0 && (
              <div
                className="shrink-0 px-4 sm:px-5 pt-4 pb-2 space-y-4"
                data-testid="assistant-startup-issues"
              >
                {startupIssues.map((issue) => {
                  const accentClass =
                    issue.severity === 'block'
                      ? 'border-l-rose-500/70'
                      : issue.severity === 'warn'
                        ? 'border-l-amber-500/70'
                        : 'border-l-sky-500/70'
                  return (
                    <motion.div
                      key={issue.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                      className="flex flex-col items-start gap-2"
                    >
                      <div
                        className={cn(
                          'max-w-[88%] min-w-0',
                          'rounded-2xl rounded-tl-md',
                          'px-4 py-3',
                          'bg-foreground/[0.03]',
                          'border border-foreground/[0.08]',
                          'border-l-2',
                          accentClass
                        )}
                      >
                        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground">
                          {issue.title}
                        </p>
                        {issue.body && (
                          <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/70 mt-1.5">
                            {issue.body}
                          </p>
                        )}
                      </div>
                      <div className="ml-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onResolveStartupIssue?.(issue.id, issue.ctaPrompt)}
                          className="rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.08] hover:border-foreground/[0.14] px-3 py-1 text-xs text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap touch-manipulation"
                        >
                          {issue.ctaLabel}
                        </button>
                        {issue.jumpLabel && (
                          <button
                            type="button"
                            onClick={() => onJumpToStartupIssue?.(issue.id)}
                            className="rounded-full hover:bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/55 hover:text-foreground/80 transition-colors touch-manipulation"
                          >
                            {issue.jumpLabel}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDismissStartupIssue?.(issue.id)}
                          className="rounded-full hover:bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation"
                        >
                          {ca('dismissWarning')}
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/*
              Engine Insights — Pass-9.

              Each unacknowledged high-severity warning the engine emitted
              renders as a *proactive assistant insight* — visually a chat
              bubble from the assistant, parked at the top of the message
              stream so the user sees them the moment they open the
              drawer. Visual change from Pass-7: no warning-banner header,
              no amber rail. The bubble itself communicates urgency via
              the assistant's voice, not via UI chrome — this is the
              "feels like the assistant is talking to me" pattern the
              CTO audit asked for.

              Actions stay inline so a fix is one click away:
                - Primary CTA → forwards the prefilled prompt (the
                  assistant walks the user through the fix).
                - Dismiss   → acknowledges silently (parent persists).

              The report body no longer renders an AANDACHTSPUNTEN block;
              this surface is the single source of remediation.
            */}
            {qualityWarnings.length > 0 && (
              <div
                className="shrink-0 px-4 sm:px-5 pt-4 pb-2 space-y-4"
                data-testid="assistant-engine-insights"
              >
                {qualityWarnings.map((w) => (
                  <motion.div
                    key={w.type}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="flex flex-col items-start gap-2"
                  >
                    <div
                      className={cn(
                        'max-w-[88%] min-w-0',
                        'rounded-2xl rounded-tl-md',
                        'px-4 py-3',
                        'bg-foreground/[0.03]',
                        'border border-foreground/[0.08]',
                        'border-l-2 border-l-amber-500/60'
                      )}
                      role="status"
                    >
                      {w.message ? (
                        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground">
                          {w.message}
                        </p>
                      ) : null}
                      {w.recommendation ? (
                        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/70 mt-1.5">
                          {w.recommendation}
                        </p>
                      ) : null}
                    </div>
                    <div className="ml-2 flex flex-wrap items-center gap-1.5">
                      {w.cta_label && w.cta_prompt ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (w.cta_prompt) onResolveQualityWarning?.(w.type, w.cta_prompt)
                          }}
                          className="rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.08] hover:border-foreground/[0.14] px-3 py-1 text-xs text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap touch-manipulation"
                        >
                          {w.cta_label}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onDismissQualityWarning?.(w.type)}
                        className="rounded-full hover:bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation"
                      >
                        {ca('dismissWarning')}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pending Field Updates — reshaped as an inline assistant turn.
                Conversational: "I'd like to apply these updates", then a tight
                list of plain text rows with subtle accept / reject text actions.
                No panel chrome, no primary tint, no oversized icon buttons. */}
            {pendingUpdates.length > 0 && (
              <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex flex-col items-start gap-2">
                <div className="max-w-[88%] rounded-2xl rounded-tl-md px-4 py-3 bg-foreground/[0.03] border border-foreground/[0.08]">
                  <p className="text-[15px] sm:text-sm leading-relaxed text-foreground mb-2">
                    {ca('suggestedUpdates')}
                  </p>
                  <ul className="space-y-1.5">
                    {pendingUpdates.map((update) => (
                      <li
                        key={update.field}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 flex-1 text-foreground/80 truncate">
                          <span className="text-foreground/45 mr-1.5">→</span>
                          {update.label}
                        </span>
                        <span className="font-mono text-foreground/65 tabular-nums">
                          {typeof update.value === 'number'
                            ? `€${update.value.toLocaleString(currencyLocale)}`
                            : update.value}
                        </span>
                        <span className="flex items-center gap-2 text-xs shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onApplyFieldUpdate?.(update.field, update.value)
                              onAcceptUpdate?.(update.field)
                            }}
                            className="text-primary/85 hover:text-primary transition-colors"
                          >
                            {ca('accept')}
                          </button>
                          <span className="text-foreground/20">·</span>
                          <button
                            type="button"
                            onClick={() => onRejectUpdate?.(update.field)}
                            className="text-foreground/45 hover:text-foreground/70 transition-colors"
                          >
                            {ca('dismissWarning')}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Messages Area - Scrollable with momentum */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              role="log"
              aria-live="polite"
              aria-busy={isGenerating}
              aria-label={ca('title')}
            >
              {isEmpty ? (
                <EmptyState
                  onSuggestionClick={(text) => setInput(text)}
                  companyName={companyName}
                  fieldContext={fieldContext}
                  suggestions={suggestions}
                />
              ) : (
                <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
                  <AnimatePresence>
                    {visibleMessages.map((message, idx) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isStreaming={
                          isGenerating &&
                          idx === visibleMessages.length - 1 &&
                          message.role === 'assistant'
                        }
                        onApplyUpdate={onApplyFieldUpdate}
                        onAcceptNormalisation={onAcceptNormalisation}
                        onRejectNormalisation={onRejectNormalisation}
                        onApproveValuationRun={onApproveValuationRun}
                        onRejectValuationRun={onRejectValuationRun}
                        onApproveReportGeneration={onApproveReportGeneration}
                        onRejectReportGeneration={onRejectReportGeneration}
                        onApproveSellabilityRun={onApproveSellabilityRun}
                        onRejectSellabilityRun={onRejectSellabilityRun}
                        onApproveListingCreate={onApproveListingCreate}
                        onRejectListingCreate={onRejectListingCreate}
                        onCommandPillClick={handleCommandPillClick}
                        onRetry={onRetry}
                        onSendFollowUp={(content) =>
                          onSendMessage(content, undefined, undefined, undefined)
                        }
                      />
                    ))}
                  </AnimatePresence>

                  {showLoadingSkeleton && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2 px-1 py-2 text-foreground/55"
                    >
                      {/* Inline thinking indicator — no bubble, no skeleton bars.
                          Three dots + a one-word label, mirroring Cursor's "Thinking…". */}
                      {toolInProgress ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span className="text-xs">
                            {ca.has(`tools.${toolInProgress}`)
                              ? ca(`tools.${toolInProgress}` as any)
                              : ca('tools.default')}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex gap-0.5 items-center">
                            <motion.span
                              className="w-1 h-1 rounded-full bg-foreground/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.1, repeat: Infinity }}
                            />
                            <motion.span
                              className="w-1 h-1 rounded-full bg-foreground/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.1, repeat: Infinity, delay: 0.18 }}
                            />
                            <motion.span
                              className="w-1 h-1 rounded-full bg-foreground/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.1, repeat: Infinity, delay: 0.36 }}
                            />
                          </span>
                          <span className="text-xs">{ca('typing')}</span>
                        </>
                      )}
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Composer — Aurora Clarity surface, mirrored from the home-page
                HeroKBOSearch input and Mercury's AdvisorAIDock. Contextual
                action chips render ABOVE the textarea (Lovable-style action
                points) so the textarea remains the single action surface.
                Detected commands / values keep their inline echo above the
                textarea. Paperclip + send live INSIDE the same rounded glass
                card, on a footer row beneath the textarea. */}
            <div className="shrink-0 px-4 sm:px-5 pb-4 sm:pb-5 pt-2 space-y-2.5">
              {/* Quick suggestions — pill chips, always visible when empty.
                  Aligned with Mercury's starter-chips treatment. */}
              <AnimatePresence>
                {!input.trim() && !isGenerating && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-wrap gap-1.5"
                    data-testid="assistant-starter-chips"
                  >
                    {suggestions.slice(0, 4).map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleCommandPillClick(suggestion)}
                        disabled={isGenerating}
                        className={cn(
                          'inline-flex items-center rounded-full',
                          'border border-primary/10 bg-primary/[0.04]',
                          'px-3 py-1 text-xs font-medium text-foreground/70',
                          'hover:border-primary/20 hover:bg-primary/[0.07] hover:text-foreground/90',
                          'active:scale-[0.97] transition-all touch-manipulation',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline detection echo — one quiet line, monospace, no panel */}
              <AnimatePresence>
                {(detectedCommands.length > 0 || detectedValues.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                    className="px-1 text-xs text-foreground/55 leading-relaxed"
                  >
                    <span className="text-foreground/35 mr-1.5">
                      {detectedCommands.length > 0
                        ? ca('normCommandDetected')
                        : ca('detectedValues')}
                      :
                    </span>
                    {(detectedCommands.length > 0 ? detectedCommands : detectedValues).map(
                      (item, index) => (
                        <span key={index} className="font-mono">
                          {index > 0 && <span className="text-foreground/25 mx-1.5">·</span>}
                          {nh(`fieldLabels.${item.field}` as any) || item.label}
                          <span className="text-foreground/35"> → </span>€
                          {item.value.toLocaleString(currencyLocale)}
                        </span>
                      )
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Attachment preview — quiet inline chips */}
              <AnimatePresence>
                {attachments.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                    className="flex gap-1.5 flex-wrap"
                  >
                    {attachments.map((file, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-foreground/[0.04] text-xs text-foreground/70"
                      >
                        {file.type.startsWith('image/') ? (
                          <ImageIcon className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-foreground/40 hover:text-foreground/70"
                          aria-label="Remove attachment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Composer card — Aurora Clarity glass surface, rounded-2xl,
                  primary-tinted focus ring. Textarea sits on top; the file +
                  send buttons share a footer row inside the same card. */}
              <div
                className={cn(
                  'group relative flex flex-col w-full',
                  'rounded-2xl p-2',
                  'bg-foreground/[0.03] backdrop-blur-xl',
                  'border border-foreground/[0.08]',
                  'transition-[border-color,box-shadow] duration-300',
                  'focus-within:border-primary/40',
                  'focus-within:shadow-[0_0_40px_-12px_hsl(var(--primary)/0.18)]',
                  isInputFocused ? 'border-primary/40' : 'hover:border-foreground/[0.12]',
                  'shadow-sm'
                )}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    fieldContext
                      ? ca('askAboutField', { field: (fieldContext.label || '').toLowerCase() })
                      : ca('askOrCommand')
                  }
                  rows={3}
                  className={cn(
                    'w-full bg-transparent border-0 outline-none resize-none',
                    'focus:outline-none focus:ring-0 focus:border-0',
                    'text-base sm:text-sm min-h-[88px] leading-relaxed px-3 py-2',
                    'text-foreground placeholder:text-foreground/35'
                  )}
                  disabled={isGenerating}
                  aria-label={ca('chatInput')}
                />

                <div className="flex items-center justify-between px-1 pb-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors touch-manipulation"
                    aria-label={ca('addFile')}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={(!input.trim() && attachments.length === 0) || isGenerating}
                    className={cn(
                      'shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-colors touch-manipulation',
                      (input.trim() || attachments.length > 0) && !isGenerating
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85'
                        : 'bg-foreground/[0.06] text-foreground/30 cursor-not-allowed'
                    )}
                    aria-label={ca('send')}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Empty State Component - Premium minimal design (no redundant icons)
function EmptyState({
  onSuggestionClick,
  companyName,
  fieldContext,
  suggestions,
}: {
  onSuggestionClick: (text: string) => void
  companyName?: string
  fieldContext?: FieldContext
  suggestions: string[]
}) {
  const ca = useTranslations('chatAssistant')
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 sm:px-6 py-8 sm:py-10">
      <div className="max-w-md w-full space-y-8 sm:space-y-6">
        {/* Minimal Header - World-class typography hierarchy */}
        <div className="text-center space-y-3 sm:space-y-2">
          <h2 className="text-xl sm:text-lg font-semibold text-foreground tracking-tight">
            {fieldContext
              ? ca('helpWithField', { field: fieldContext.label || '' })
              : companyName
                ? ca('analysisFor', { company: companyName })
                : ca('howCanIHelp')}
          </h2>
          <p className="text-base sm:text-sm text-foreground/50 max-w-xs mx-auto">
            {fieldContext?.hint || ca('askOrUpload')}
          </p>
        </div>

        {/* Suggestions moved to input area pills */}
      </div>
    </div>
  )
}

// Code Block with copy button
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const ca = useTranslations('chatAssistant')
  const lang = className?.replace(/^language-/, '') || ''
  const codeText = (
    Array.isArray(children) ? children.map(String).join('') : String(children)
  ).replace(/\n$/, '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-foreground/[0.08]">
      <div className="flex items-center justify-between px-4 py-2 bg-foreground/[0.06] border-b border-foreground/[0.06]">
        <span className="text-[11px] font-mono text-foreground/40 uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
            copied
              ? 'text-primary bg-primary/10'
              : 'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06]'
          )}
          aria-label={ca('copyCode')}
        >
          {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? ca('copied') : ca('copy')}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-foreground/[0.03]">
        <code className="text-sm font-mono text-foreground/80 leading-relaxed">{codeText}</code>
      </pre>
    </div>
  )
}

// Message Bubble Component
function MessageBubble({
  message,
  isStreaming = false,
  onApplyUpdate,
  onAcceptNormalisation,
  onRejectNormalisation,
  onApproveValuationRun,
  onRejectValuationRun,
  onApproveReportGeneration,
  onRejectReportGeneration,
  onApproveSellabilityRun,
  onRejectSellabilityRun,
  onApproveListingCreate,
  onRejectListingCreate,
  onCommandPillClick,
  onRetry,
  onSendFollowUp,
}: {
  message: ChatMessage
  isStreaming?: boolean
  onApplyUpdate?: (field: string, value: any) => void
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  onApproveValuationRun?: (proposalId: string, reportId?: string) => void
  onRejectValuationRun?: (proposalId: string) => void
  onApproveReportGeneration?: (proposalId: string, reportId?: string) => void
  onRejectReportGeneration?: (proposalId: string) => void
  onApproveSellabilityRun?: (proposalId: string) => void
  onRejectSellabilityRun?: (proposalId: string) => void
  onApproveListingCreate?: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null,
    visibility?: 'public' | 'private'
  ) => void
  onRejectListingCreate?: (proposalId: string) => void
  onCommandPillClick?: (command: string) => void
  onRetry?: (messageId: string) => void
  /**
   * Programmatic follow-up sender used by the registry-search picker —
   * clicking a row fires "Use {name} ({registry} {number})" so the agent
   * can chain to bootstrap_belgian_company or create_client without the
   * user re-typing. Optional because most renderable cards don't need it.
   */
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="text-center py-2"
      >
        <span className="text-xs text-foreground/40 italic">{message.content}</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex group/msg', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* No avatar — bubble shape + alignment carry the role distinction
          (Cursor / Lovable / Ilara pattern). */}

      <div
        className={cn(
          'max-w-[88%]',
          isUser
            ? // User bubble: tinted accent
              [
                'rounded-2xl rounded-tr-md',
                'px-4 py-3',
                'bg-primary/12',
                'text-foreground',
                'border border-primary/20',
              ]
            : // Assistant bubble: surface, no chrome
              [
                'rounded-2xl rounded-tl-md',
                'px-5 py-4',
                'bg-foreground/[0.03]',
                'border border-foreground/[0.08]',
                'text-foreground',
              ]
        )}
      >
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:gap-1.5 mb-3 sm:mb-2">
            {message.attachments.map((attachment, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-1.5 sm:py-1 rounded-lg text-sm sm:text-xs',
                  isUser
                    ? 'bg-primary/20 text-foreground/80'
                    : 'bg-foreground/[0.06] text-foreground/70'
                )}
              >
                {attachment.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 sm:w-3 sm:h-3" />
                ) : (
                  <FileText className="w-4 h-4 sm:w-3 sm:h-3" />
                )}
                <span className="truncate max-w-[100px] sm:max-w-[80px]">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Content with Markdown for AI, plain text for user */}
        {isUser ? (
          <p className="text-[15px] sm:text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-foreground mt-3 mb-2 first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/90 mb-3 last:mb-0">
                    {children}
                  </p>
                ),
                ul: ({ children }) => <ul className="space-y-1.5 mb-3 last:mb-0">{children}</ul>,
                ol: ({ children }) => (
                  <ol className="space-y-1.5 mb-3 last:mb-0 list-decimal list-inside">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2 text-[15px] sm:text-sm text-foreground/85">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60 mt-2" />
                    <span>{children}</span>
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => {
                  const text = String(children)
                  if (
                    text.startsWith('"') ||
                    text.toLowerCase().startsWith('normalis') ||
                    text.toLowerCase().startsWith('zet ') ||
                    text.toLowerCase().startsWith('pas ')
                  ) {
                    return (
                      <button
                        type="button"
                        onClick={() => onCommandPillClick?.(text.replace(/^["']|["']$/g, ''))}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium not-italic cursor-pointer hover:bg-primary/20 hover:border-primary/30 active:scale-[0.98] transition-all touch-manipulation"
                      >
                        {children}
                      </button>
                    )
                  }
                  return <em className="italic text-foreground/70">{children}</em>
                },
                // Code: block code lives inside <pre>, inline does not
                pre: ({ children }) => {
                  // Extract the inner <code> and render as CodeBlock
                  const child = Array.isArray(children) ? children[0] : children
                  if (child && typeof child === 'object' && 'props' in child) {
                    return (
                      <CodeBlock className={child.props.className}>
                        {child.props.children}
                      </CodeBlock>
                    )
                  }
                  return <pre>{children}</pre>
                },
                code: ({ children }) => (
                  <code className="px-1.5 py-0.5 rounded bg-foreground/[0.08] text-sm font-mono text-foreground/80">
                    {children}
                  </code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/40 pl-4 my-3 text-foreground/70 italic">
                    {children}
                  </blockquote>
                ),
                // GFM: Tables
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto rounded-lg border border-foreground/[0.08]">
                    <table className="w-full text-sm">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-foreground/[0.04] border-b border-foreground/[0.08]">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-sm text-foreground/80 border-t border-foreground/[0.04]">
                    {children}
                  </td>
                ),
                // GFM: Links
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors"
                  >
                    {children}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ),
                // GFM: Horizontal rule
                hr: () => <hr className="my-4 border-foreground/[0.08]" />,
                // GFM: Strikethrough handled automatically
              }}
            >
              {message.content}
            </ReactMarkdown>
            {/* Streaming cursor */}
            {isStreaming && (
              <motion.span
                className="inline-block w-2 h-4 ml-0.5 bg-primary rounded-sm align-middle"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        )}

        {/* Error state with retry */}
        {message.isError && onRetry && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onRetry(message.id)}
            className={cn(
              'mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-xs font-medium text-destructive',
              'bg-destructive/10 border border-destructive/20',
              'hover:bg-destructive/15 active:scale-[0.98] transition-all touch-manipulation'
            )}
          >
            <RotateCcw className="w-3 h-3" />
            {ca('retry')}
          </motion.button>
        )}

        {/* Copy button - hover reveal for assistant messages */}
        {!isUser && !isSystem && message.content && !message.isError && (
          <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopyMessage}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                copied
                  ? 'text-primary bg-primary/10'
                  : 'text-foreground/35 hover:text-foreground/60 hover:bg-foreground/[0.06]'
              )}
              aria-label={ca('copyMessage')}
            >
              {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? ca('copied') : ca('copy')}
            </button>
          </div>
        )}

        {/* Field updates — flattened. Each one is a single text line:
            "label  €value  · source · confidence  · Apply". No card,
            no header bar, no nested impact panel. */}
        {message.fieldUpdates && message.fieldUpdates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-2.5">
            {message.fieldUpdates.map((update) => {
              const sourceLabel =
                update.source === 'ai'
                  ? ca('aiSuggestion')
                  : update.source === 'yuki'
                    ? 'Yuki'
                    : update.source === 'kbo'
                      ? (ca('registrySource') ?? 'Registry')
                      : update.source
              const confidenceLabel =
                update.confidence === 'high'
                  ? ca('reliable')
                  : update.confidence === 'medium'
                    ? ca('toVerify')
                    : update.confidence === 'low'
                      ? ca('indicative')
                      : null
              const meta: string[] = []
              if (update.grootboekCode) meta.push(update.grootboekCode)
              if (sourceLabel) meta.push(sourceLabel as string)
              if (confidenceLabel) meta.push(confidenceLabel)
              if (update.impact)
                meta.push(
                  `+€${update.impact.valuationDelta.toLocaleString(currencyLocale)} ${ca('impactOnValue').toLowerCase()}`
                )

              return (
                <div key={update.field} className="text-sm leading-relaxed">
                  <p className="text-foreground">
                    {update.label}
                    <span className="text-foreground/35 mx-1.5">·</span>
                    <span className="font-mono">
                      €{update.value.toLocaleString(currencyLocale)}
                    </span>
                  </p>
                  {meta.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{meta.join(' · ')}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onApplyUpdate?.(update.field, update.value)}
                      className="text-primary/85 hover:text-primary transition-colors font-medium"
                    >
                      {ca('acceptAndApply')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Normalisation suggestions — flat conversational style: plain text
            continuation inside the bubble, one primary text action + cancel. */}
        {message.normalisationSuggestions && message.normalisationSuggestions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.normalisationSuggestions.map((suggestion) => {
              const valuationImpact =
                suggestion.valuationImpact ||
                Math.round(suggestion.amount * (suggestion.multiple || 5.2))
              const isPending = suggestion.status === 'pending'
              const isAccepted = suggestion.status === 'accepted'

              return (
                <motion.div
                  key={suggestion.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {ca('normalizeSuggestion', {
                      description: (suggestion.description || '').toLowerCase(),
                    })}
                  </p>
                  {suggestion.reason && (
                    <p className="text-foreground/55 text-xs mt-0.5">{suggestion.reason}</p>
                  )}
                  {isPending && (
                    <p className="text-foreground/55 text-xs mt-1 font-mono">
                      {ca('impactEbitdaToValue', {
                        ebitda: suggestion.amount.toLocaleString(currencyLocale),
                        value: valuationImpact.toLocaleString(currencyLocale),
                      })}
                    </p>
                  )}
                  {isPending ? (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onAcceptNormalisation?.(suggestion.id)}
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('accept')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectNormalisation?.(suggestion.id)}
                        className="text-foreground/45 hover:text-foreground/70 transition-colors"
                      >
                        {ca('reject')}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-foreground/45">
                      {isAccepted ? ca('accepted') : ca('rejected')}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Valuation-run proposals — flattened to plain text + single action. */}
        {message.valuationRunRequests && message.valuationRunRequests.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.valuationRunRequests.map((req) => {
              const isPending = req.status === 'pending_approval' && !req.decision
              const isBlocked = req.status === 'blocked'
              const isApproved = req.decision === 'approved'
              const summary = req.inputsSummary
              const revenueNum = summary?.revenue ? Number(summary.revenue) : null
              const ebitdaNormNum = summary?.ebitda_normalized
                ? Number(summary.ebitda_normalized)
                : null
              const ebitdaNum = summary?.ebitda ? Number(summary.ebitda) : null
              const ebitdaForDisplay = ebitdaNormNum ?? ebitdaNum

              // Compose a single, dense one-line summary so the user sees what
              // will run without scanning a data grid.
              const summaryBits: string[] = []
              if (revenueNum !== null)
                summaryBits.push(
                  `${ca('proposalCards.valuation.labelRevenue')} €${revenueNum.toLocaleString(currencyLocale)}`
                )
              if (ebitdaForDisplay !== null)
                summaryBits.push(
                  `EBITDA${ebitdaNormNum ? '*' : ''} €${ebitdaForDisplay.toLocaleString(currencyLocale)}`
                )
              if (summary?.business_type) summaryBits.push(summary.business_type)
              if (summary && summary.applied_normalizations > 0)
                summaryBits.push(
                  `${summary.applied_normalizations} ${ca('proposalCards.valuation.labelAppliedNormalisations')}`
                )
              if (req.estimatedCredits != null)
                summaryBits.push(
                  ca('proposalCards.common.creditsLabel', { count: req.estimatedCredits })
                )

              return (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.valuation.titleBlocked')
                      : summary?.business_name
                        ? ca('proposalCards.valuation.titlePendingWithName', {
                            name: summary.business_name,
                          })
                        : ca('proposalCards.valuation.titlePending')}
                  </p>
                  {req.note && <p className="text-foreground/55 text-xs mt-0.5">{req.note}</p>}
                  {isBlocked && req.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{req.message}</p>
                  )}
                  {isBlocked && req.missing && req.missing.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5 font-mono">
                      {ca('proposalCards.common.missingPrefix')}
                      {req.missing.join(', ')}
                    </p>
                  )}
                  {isPending && summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {isPending && (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onApproveValuationRun?.(req.id, req.reportId)}
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('proposalCards.valuation.actionLabel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectValuationRun?.(req.id)}
                        className="text-foreground/45 hover:text-foreground/70 transition-colors"
                      >
                        {ca('proposalCards.common.buttonCancel')}
                      </button>
                    </div>
                  )}
                  {!isPending && !isBlocked && (
                    <p className="mt-1 text-xs text-foreground/45">
                      {isApproved
                        ? ca('proposalCards.valuation.statusStarted')
                        : ca('proposalCards.common.statusCancelled')}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Report-generation proposals — flattened. */}
        {message.reportGenerationRequests && message.reportGenerationRequests.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.reportGenerationRequests.map((req) => {
              const isPending = req.status === 'pending_approval' && !req.decision
              const isBlocked = req.status === 'blocked'
              const isApproved = req.decision === 'approved'
              const result = req.resultSummary
              const ccy = result?.currency ?? 'EUR'
              const fmt = (n: number | null | undefined) =>
                n != null && Number.isFinite(n)
                  ? `${ccy === 'EUR' ? '€' : `${ccy} `}${Number(n).toLocaleString(currencyLocale)}`
                  : null
              const midpoint = fmt(result?.midpoint)
              const min = fmt(result?.min)
              const max = fmt(result?.max)

              const summaryBits: string[] = []
              if (midpoint) summaryBits.push(midpoint)
              if (min || max) summaryBits.push(`${min ?? '—'}–${max ?? '—'}`)
              if (result?.valuation_method) summaryBits.push(result.valuation_method)
              if (result?.confidence_score != null)
                summaryBits.push(
                  `${result.confidence_score}% ${ca('proposalCards.report.labelConfidence').toLowerCase()}`
                )

              return (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.report.titleBlocked')
                      : result?.business_name
                        ? ca('proposalCards.report.titlePendingWithName', {
                            name: result.business_name,
                          })
                        : ca('proposalCards.report.titlePending')}
                  </p>
                  {req.note && <p className="text-foreground/55 text-xs mt-0.5">{req.note}</p>}
                  {isBlocked && req.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{req.message}</p>
                  )}
                  {isPending && summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {isPending && (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onApproveReportGeneration?.(req.id, req.reportId)}
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('proposalCards.report.actionLabel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectReportGeneration?.(req.id)}
                        className="text-foreground/45 hover:text-foreground/70 transition-colors"
                      >
                        {ca('proposalCards.common.buttonCancel')}
                      </button>
                    </div>
                  )}
                  {!isPending && !isBlocked && (
                    <p className="mt-1 text-xs text-foreground/45">
                      {isApproved
                        ? ca('proposalCards.report.statusStarted')
                        : ca('proposalCards.common.statusCancelled')}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Belgian public-data bootstrap — read-only KBO/NBB context before data connection. */}
        {message.belgianCompanyBootstraps && message.belgianCompanyBootstraps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.belgianCompanyBootstraps.map((bootstrap) => {
              const isBlocked = bootstrap.status === 'blocked' || bootstrap.status === 'failed'
              const fmtEuros = (value: number | null | undefined) =>
                value != null && Number.isFinite(Number(value))
                  ? `€${Number(value).toLocaleString(currencyLocale)}`
                  : null
              const summaryBits: string[] = []
              if (bootstrap.identity?.legalName) summaryBits.push(bootstrap.identity.legalName)
              if (bootstrap.identity?.kboNumber) summaryBits.push(bootstrap.identity.kboNumber)
              if (bootstrap.identity?.city) summaryBits.push(bootstrap.identity.city)
              if (!isBlocked && bootstrap.filingSummary?.filingYear) {
                summaryBits.push(
                  ca('proposalCards.belgianBootstrap.filingYear', {
                    year: bootstrap.filingSummary.filingYear,
                  })
                )
              }
              const revenue = fmtEuros(bootstrap.filingSummary?.revenue)
              const ebitda = fmtEuros(bootstrap.filingSummary?.ebitda)
              const equity = fmtEuros(bootstrap.valuationPreview?.equityMid)
              if (revenue)
                summaryBits.push(`${ca('proposalCards.valuation.labelRevenue')} ${revenue}`)
              if (ebitda) summaryBits.push(`EBITDA ${ebitda}`)
              if (equity)
                summaryBits.push(`${ca('proposalCards.belgianBootstrap.equityPreview')} ${equity}`)

              return (
                <motion.div
                  key={bootstrap.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.belgianBootstrap.titleBlocked')
                      : ca('proposalCards.belgianBootstrap.titleReady')}
                  </p>
                  {bootstrap.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{bootstrap.message}</p>
                  )}
                  {summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {!isBlocked && (
                    <div className="mt-2 space-y-1.5">
                      <div className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground/80 truncate">
                            {bootstrap.identity?.legalName ??
                              bootstrap.identity?.kboNumber ??
                              ca('proposalCards.belgianBootstrap.identityTitle')}
                          </span>
                          {bootstrap.identity?.isActive != null && (
                            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                              {bootstrap.identity.isActive
                                ? ca('proposalCards.belgianBootstrap.active')
                                : ca('proposalCards.belgianBootstrap.inactive')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-foreground/55">
                          {bootstrap.identity?.kboNumber && (
                            <span>{bootstrap.identity.kboNumber}</span>
                          )}
                          {bootstrap.identity?.legalForm && (
                            <span>{bootstrap.identity.legalForm}</span>
                          )}
                          {bootstrap.identity?.city && <span>{bootstrap.identity.city}</span>}
                          {bootstrap.identity?.naceDescription && (
                            <span>{bootstrap.identity.naceDescription}</span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                        <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
                          <p className="text-[10px] font-medium uppercase text-foreground/35">
                            {ca('proposalCards.belgianBootstrap.filingTitle')}
                          </p>
                          <p className="mt-0.5 text-foreground/65 leading-snug">
                            {bootstrap.filingSummary?.filingYear
                              ? ca('proposalCards.belgianBootstrap.filingYear', {
                                  year: bootstrap.filingSummary.filingYear,
                                })
                              : ca('proposalCards.belgianBootstrap.noFiling')}
                          </p>
                          {bootstrap.filingSummary?.dataHealthMessage && (
                            <p className="mt-0.5 text-[10px] text-foreground/45">
                              {bootstrap.filingSummary.dataHealthMessage}
                            </p>
                          )}
                        </div>
                        <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
                          <p className="text-[10px] font-medium uppercase text-foreground/35">
                            {ca('proposalCards.belgianBootstrap.benchmarkTitle')}
                          </p>
                          <p className="mt-0.5 text-foreground/65 leading-snug">
                            {bootstrap.benchmark?.businessTypeTitle ??
                              ca('proposalCards.belgianBootstrap.noBenchmark')}
                          </p>
                          {bootstrap.benchmark?.evEbitdaMedian != null && (
                            <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
                              {Number(bootstrap.benchmark.evEbitdaMedian).toFixed(1)}x
                            </p>
                          )}
                        </div>
                        <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
                          <p className="text-[10px] font-medium uppercase text-foreground/35">
                            {ca('proposalCards.belgianBootstrap.previewTitle')}
                          </p>
                          <p className="mt-0.5 text-foreground/65 leading-snug">
                            {fmtEuros(bootstrap.valuationPreview?.equityMid) ??
                              ca('proposalCards.belgianBootstrap.noPreview')}
                          </p>
                          {bootstrap.valuationPreview?.ebitdaYear && (
                            <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
                              EBITDA {bootstrap.valuationPreview.ebitdaYear}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Client-data readiness — Hermes checkpoint before valuation handoff. */}
        {message.clientDataReadinessPreviews && message.clientDataReadinessPreviews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.clientDataReadinessPreviews.map((readiness) => {
              const needsReview =
                readiness.status === 'needs_import_review' ||
                readiness.recommendedNextTool === 'open_import_review'
              const isReady = readiness.status === 'ready_for_valuation'
              const sources = (readiness.accountingSources ?? [])
                .map((source) => source.provider)
                .filter(Boolean)
                .slice(0, 4)
              const topFlags = readiness.importQualitySummary?.topFlags ?? []
              const actionableFlagCount =
                readiness.importQualitySummary?.actionableFlagCount ?? topFlags.length
              const summaryBits: string[] = []
              if (readiness.businessName) summaryBits.push(readiness.businessName)
              summaryBits.push(
                readiness.hasSyncedFinancials
                  ? ca('proposalCards.clientDataReadiness.syncedLabel')
                  : ca('proposalCards.clientDataReadiness.notSyncedLabel')
              )
              if (sources.length > 0) summaryBits.push(sources.join(', '))
              if (actionableFlagCount > 0) {
                summaryBits.push(
                  ca('proposalCards.clientDataReadiness.flagCount', {
                    count: actionableFlagCount,
                  })
                )
              }

              return (
                <motion.div
                  key={readiness.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-xl border p-3 text-sm',
                    needsReview
                      ? 'border-amber-500/25 bg-amber-500/[0.04]'
                      : isReady
                        ? 'border-success/15 bg-success/[0.04]'
                        : 'border-primary/15 bg-primary/[0.04]'
                  )}
                >
                  <p className="font-medium text-foreground/90">
                    {needsReview
                      ? ca('proposalCards.clientDataReadiness.titleReview')
                      : isReady
                        ? ca('proposalCards.clientDataReadiness.titleReady')
                        : ca('proposalCards.clientDataReadiness.titleBlocked')}
                  </p>
                  {summaryBits.length > 0 && (
                    <p className="mt-0.5 text-xs text-foreground/55 leading-snug">
                      {summaryBits.join(' · ')}
                    </p>
                  )}
                  {readiness.recommendedNextAction && (
                    <p className="mt-2 text-xs text-foreground/65 leading-snug">
                      <span className="font-medium text-foreground/75">
                        {ca('proposalCards.clientDataReadiness.nextActionLabel')}:
                      </span>{' '}
                      {readiness.recommendedNextAction}
                    </p>
                  )}
                  {topFlags.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {topFlags.slice(0, 3).map((flag, index) => (
                        <div
                          key={`${flag.year ?? 'year'}-${flag.code ?? flag.field ?? index}`}
                          className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground/75 truncate">
                              {flag.code ??
                                flag.field ??
                                ca('proposalCards.clientDataReadiness.flagsLabel')}
                            </span>
                            {flag.severity && (
                              <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                                {flag.severity}
                              </span>
                            )}
                          </div>
                          {flag.message && (
                            <p className="mt-0.5 text-foreground/55">{flag.message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Method-readiness previews — read-only ValuationIQ method coverage. */}
        {message.methodReadinessPreviews && message.methodReadinessPreviews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.methodReadinessPreviews.map((preview) => {
              const isBlocked = preview.status === 'blocked'
              const formatMethodName = (method: string) =>
                method
                  .split('_')
                  .filter(Boolean)
                  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                  .join(' ')
              const summaryBits: string[] = []
              if (preview.businessName) summaryBits.push(preview.businessName)
              if (!isBlocked) {
                summaryBits.push(
                  ca('proposalCards.methodReadiness.readyCount', {
                    count: preview.readyMethods.length,
                  })
                )
                if (preview.blockedMethods.length > 0) {
                  summaryBits.push(
                    ca('proposalCards.methodReadiness.blockedCount', {
                      count: preview.blockedMethods.length,
                    })
                  )
                }
              } else if (preview.message) {
                summaryBits.push(preview.message)
              }

              return (
                <motion.div
                  key={preview.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-xl border p-3 text-sm',
                    isBlocked
                      ? 'border-amber-500/25 bg-amber-500/[0.04]'
                      : 'border-primary/15 bg-primary/[0.04]'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground/90">
                        {isBlocked
                          ? ca('proposalCards.methodReadiness.titleBlocked')
                          : ca('proposalCards.methodReadiness.titleReady')}
                      </p>
                      {summaryBits.length > 0 && (
                        <p className="mt-0.5 text-xs text-foreground/55 leading-snug">
                          {summaryBits.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isBlocked && (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-foreground/[0.035] px-2 py-1.5">
                        <p className="text-[10px] font-medium uppercase text-foreground/35">
                          {ca('proposalCards.methodReadiness.readyLabel')}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {preview.readyMethods.slice(0, 6).map((method) => (
                            <span
                              key={method}
                              className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] text-success/90"
                            >
                              {formatMethodName(method)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-md bg-foreground/[0.025] px-2 py-1.5">
                        <p className="text-[10px] font-medium uppercase text-foreground/35">
                          {ca('proposalCards.methodReadiness.blockedLabel')}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {preview.blockedMethods.slice(0, 6).map((method) => (
                            <span
                              key={method}
                              className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55"
                            >
                              {formatMethodName(method)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Listing previews — read-only anonymized marketplace draft. */}
        {message.listingPreviews && message.listingPreviews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.listingPreviews.map((listingPreview) => {
              const isBlocked = listingPreview.status === 'blocked'
              const preview = listingPreview.preview
              const summaryBits: string[] = []
              if (preview?.title) summaryBits.push(preview.title)
              else if (listingPreview.sourceBusinessName)
                summaryBits.push(listingPreview.sourceBusinessName)
              if (preview?.sector) summaryBits.push(preview.sector)
              else if (preview?.industry) summaryBits.push(preview.industry)
              if (preview?.region) summaryBits.push(preview.region)
              else if (preview?.province) summaryBits.push(preview.province)
              if (preview?.revenueRange) summaryBits.push(preview.revenueRange)
              if (preview?.employeeRange) summaryBits.push(preview.employeeRange)
              if (!isBlocked && listingPreview.missingFields?.length) {
                summaryBits.push(
                  ca('proposalCards.listingPreview.missingPrefix', {
                    fields: listingPreview.missingFields.join(', '),
                  })
                )
              }

              return (
                <motion.div
                  key={listingPreview.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.listingPreview.titleBlocked')
                      : ca('proposalCards.listingPreview.titleReady')}
                  </p>
                  {listingPreview.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{listingPreview.message}</p>
                  )}
                  {summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {!isBlocked && preview && (
                    <div className="mt-2 rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground/80 truncate">
                          {preview.title ??
                            listingPreview.sourceBusinessName ??
                            ca('proposalCards.listingPreview.untitled')}
                        </span>
                        <div className="shrink-0 flex items-center gap-1">
                          {preview.hasVerifiedValuation && (
                            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] text-success/90">
                              {ca('proposalCards.listingPreview.verified')}
                            </span>
                          )}
                          {preview.ndaRequired && (
                            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                              {ca('proposalCards.listingPreview.nda')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-foreground/55">
                        {preview.businessType && <span>{preview.businessType}</span>}
                        {preview.sector && <span>{preview.sector}</span>}
                        {preview.region && <span>{preview.region}</span>}
                        {preview.revenueRange && <span>{preview.revenueRange}</span>}
                        {preview.employeeRange && <span>{preview.employeeRange}</span>}
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Buyer-profile previews — read-only bridge before listing approval. */}
        {message.buyerProfilePreviews && message.buyerProfilePreviews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.buyerProfilePreviews.map((preview) => {
              const isBlocked = preview.status === 'blocked'
              const missing = preview.listingReadiness?.missingFields ?? []
              const summaryBits: string[] = []
              if (preview.sourceBusinessName) summaryBits.push(preview.sourceBusinessName)
              if (!isBlocked && preview.buyerSegments?.length) {
                summaryBits.push(
                  ca('proposalCards.buyerProfile.segmentCount', {
                    count: preview.buyerSegments.length,
                  })
                )
              }
              if (!isBlocked) {
                summaryBits.push(
                  missing.length > 0
                    ? ca('proposalCards.buyerProfile.missingPrefix', {
                        fields: missing.join(', '),
                      })
                    : ca('proposalCards.buyerProfile.ready')
                )
              }

              return (
                <motion.div
                  key={preview.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.buyerProfile.titleBlocked')
                      : ca('proposalCards.buyerProfile.titleReady')}
                  </p>
                  {preview.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{preview.message}</p>
                  )}
                  {summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {!isBlocked && preview.buyerSegments && preview.buyerSegments.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {preview.buyerSegments.slice(0, 3).map((segment) => (
                        <div
                          key={segment.id ?? segment.label}
                          className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground/80 truncate">
                              {segment.label}
                            </span>
                            {segment.fitScore != null && (
                              <span className="shrink-0 font-mono text-foreground/45">
                                {segment.fitScore}/100
                              </span>
                            )}
                          </div>
                          {segment.recommendedAngle && (
                            <p className="mt-0.5 text-foreground/55">{segment.recommendedAngle}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Registry-search picker — KBO/KVK hit list. Click a row to fire a
            follow-up "Use {name} ({registry} {number})" message so the agent
            can chain to bootstrap_belgian_company or create_client without
            the user re-typing the company. Mirrors Mercury's
            RegistrySearchResultsCard. */}
        {message.registrySearchResults && message.registrySearchResults.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.registrySearchResults.map((picker) => {
              const isFailed =
                picker.status === 'failed' ||
                picker.coverageWarning === 'upstream_degraded'
              const isMissing = picker.coverageWarning === 'kvk_not_in_dataset'
              const hasHits = picker.hits.length > 0
              const heading =
                picker.registry === 'KVK'
                  ? 'Dutch KVK registry'
                  : 'Belgian KBO registry'
              const countLabel = !hasHits
                ? picker.query.length > 0
                  ? `No matches found for "${picker.query}"`
                  : 'No matches found'
                : picker.totalFound === 1
                  ? `Found ${picker.totalFound} match for "${picker.query}"`
                  : `Found ${picker.totalFound} matches for "${picker.query}"`
              const formatNumber = (num: string) => {
                if (picker.registry === 'KBO' && /^\d{10}$/.test(num)) {
                  return `${num.slice(0, 4)}.${num.slice(4, 7)}.${num.slice(7, 10)}`
                }
                return num
              }
              return (
                <motion.div
                  key={picker.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground font-medium">{heading}</p>
                  <p className="text-foreground/55 text-xs mt-0.5">{countLabel}</p>
                  {isFailed && (
                    <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                      The registry was temporarily unavailable. Try the company
                      number directly, or retry in a moment.
                    </p>
                  )}
                  {isMissing && (
                    <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                      Not in Overheid.io&apos;s public-data mirror. Verify the
                      KVK number — about 4% of Handelsregister entries fall in
                      this gap.
                    </p>
                  )}
                  {hasHits && (
                    <div className="mt-2 space-y-1">
                      {picker.hits.slice(0, 10).map((hit) => {
                        const sector =
                          hit.businessTypeTitle ?? hit.naceDescription ?? null
                        const location = hit.city
                          ? hit.postalCode
                            ? `${hit.postalCode} ${hit.city}`
                            : hit.city
                          : null
                        const display = formatNumber(hit.companyNumber)
                        return (
                          <button
                            key={`${picker.registry}-${hit.companyNumber}`}
                            type="button"
                            onClick={() => {
                              if (typeof onSendFollowUp !== 'function') return
                              const ref = `${picker.registry} ${hit.companyNumber}`
                              onSendFollowUp(
                                `Use ${hit.companyName} (${ref})`
                              )
                            }}
                            disabled={typeof onSendFollowUp !== 'function'}
                            className="w-full text-left rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus:outline-none focus:bg-foreground/[0.06] transition-colors disabled:cursor-default disabled:opacity-70 disabled:hover:bg-foreground/[0.035]"
                            aria-label={`Use ${hit.companyName}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground/85 truncate">
                                {hit.companyName}
                                {hit.legalForm && (
                                  <span className="text-foreground/55 font-normal">
                                    {' '}
                                    · {hit.legalForm}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 font-mono text-foreground/55">
                                {display}
                              </span>
                            </div>
                            {(location || sector) && (
                              <p className="mt-0.5 text-foreground/55 truncate">
                                {[location, sector].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Listing-create proposals — advisor handoff back to Mercury's listing wizard. */}
        {message.listingCreateRequests && message.listingCreateRequests.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.listingCreateRequests.map((req) => {
              const isPending =
                (req.status === 'pending_approval' || req.status === 'auto_approved') &&
                !req.decision
              const isBlocked = req.status === 'blocked'
              const isApproved = req.decision === 'approved'
              const summary = req.valuationSummary
              const ccy = summary?.currency ?? 'EUR'
              const fmt = (value: string | number | null | undefined) => {
                if (value == null || value === '') return null
                const n = Number(value)
                if (Number.isFinite(n)) {
                  return `${ccy === 'EUR' ? '€' : `${ccy} `}${n.toLocaleString(currencyLocale)}`
                }
                return String(value)
              }
              const midpoint = fmt(summary?.midpoint)
              const min = fmt(summary?.min)
              const max = fmt(summary?.max)
              const visibility =
                req.visibility === 'public'
                  ? ca('proposalCards.listing.publicVisibility')
                  : ca('proposalCards.listing.privateVisibility')

              const summaryBits: string[] = []
              if (midpoint)
                summaryBits.push(`${ca('proposalCards.listing.labelMidpoint')} ${midpoint}`)
              if (min || max) summaryBits.push(`${min ?? '—'}–${max ?? '—'}`)
              if (summary?.business_type) summaryBits.push(summary.business_type)
              if (summary?.industry) summaryBits.push(summary.industry)
              summaryBits.push(`${ca('proposalCards.listing.labelVisibility')} ${visibility}`)

              return (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.listing.titleBlocked')
                      : summary?.business_name
                        ? ca('proposalCards.listing.titlePendingWithName', {
                            name: summary.business_name,
                          })
                        : ca('proposalCards.listing.titlePending')}
                  </p>
                  {req.note && <p className="text-foreground/55 text-xs mt-0.5">{req.note}</p>}
                  {isBlocked && req.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{req.message}</p>
                  )}
                  {isPending && summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {isPending && (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          onApproveListingCreate?.(
                            req.id,
                            req.reportId,
                            req.accountantCustomerId,
                            req.visibility
                          )
                        }
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('proposalCards.listing.actionLabel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectListingCreate?.(req.id)}
                        className="text-foreground/45 hover:text-foreground/70 transition-colors"
                      >
                        {ca('proposalCards.common.buttonCancel')}
                      </button>
                    </div>
                  )}
                  {!isPending && !isBlocked && (
                    <p className="mt-1 text-xs text-foreground/45">
                      {isApproved
                        ? ca('proposalCards.listing.statusStarted')
                        : ca('proposalCards.common.statusCancelled')}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Sellability-run proposals — flattened. */}
        {message.sellabilityRunRequests && message.sellabilityRunRequests.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.sellabilityRunRequests.map((req) => {
              const isPending = req.status === 'pending_approval' && !req.decision
              const isBlocked = req.status === 'blocked'
              const isApproved = req.decision === 'approved'
              const answers = req.answers
              const cur = req.currentScore
              const computed = req.computedScore

              const summaryBits: string[] = []
              if (answers?.q1_top3_concentration_pct != null)
                summaryBits.push(
                  `${ca('proposalCards.sellability.labelQ1')} ${answers.q1_top3_concentration_pct}%`
                )
              if (answers?.q2_contracted_share)
                summaryBits.push(
                  `${ca('proposalCards.sellability.labelQ2')} ${answers.q2_contracted_share}`
                )
              if (answers?.q3_books_cleanliness)
                summaryBits.push(
                  `${ca('proposalCards.sellability.labelQ3')} ${answers.q3_books_cleanliness}`
                )
              if (cur) summaryBits.push(`${cur.score}/100 (${cur.band})`)

              return (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {isBlocked
                      ? ca('proposalCards.sellability.titleBlocked')
                      : computed
                        ? ca('proposalCards.sellability.computedTitle', {
                            score: computed.score,
                            band: computed.band,
                          })
                        : ca('proposalCards.sellability.titlePending')}
                  </p>
                  {req.note && <p className="text-foreground/55 text-xs mt-0.5">{req.note}</p>}
                  {isBlocked && req.message && (
                    <p className="text-foreground/55 text-xs mt-0.5">{req.message}</p>
                  )}
                  {isBlocked && req.missing && req.missing.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5 font-mono">
                      {ca('proposalCards.common.missingPrefix')}
                      {req.missing.join(', ')}
                    </p>
                  )}
                  {isPending && summaryBits.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                  )}
                  {isPending && (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onApproveSellabilityRun?.(req.id)}
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('proposalCards.sellability.actionLabel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectSellabilityRun?.(req.id)}
                        className="text-foreground/45 hover:text-foreground/70 transition-colors"
                      >
                        {ca('proposalCards.common.buttonCancel')}
                      </button>
                    </div>
                  )}
                  {!isPending && !isBlocked && (
                    <p className="mt-1 text-xs text-foreground/45">
                      {isApproved
                        ? computed
                          ? ca('proposalCards.sellability.computedStatus', {
                              score: computed.score,
                              band: computed.band,
                            })
                          : ca('proposalCards.sellability.statusStarted')
                        : ca('proposalCards.common.statusCancelled')}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Open tasks — quiet inline list, one line per task. */}
        {message.tasks && message.tasks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08]">
            <ul className="space-y-1">
              {message.tasks
                .filter((t) => !t.completed)
                .map((task) => (
                  <li key={task.id} className="text-sm leading-relaxed text-foreground">
                    <span className="text-foreground/35 mr-1.5">→</span>
                    {task.label}
                    {task.context && (
                      <span className="text-foreground/55 ml-1.5 text-xs">— {task.context}</span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Timestamp - refined styling */}
        <span
          className={cn(
            'text-[11px] mt-2.5 block font-medium tracking-wide',
            isUser ? 'text-primary-foreground/50' : 'text-foreground/35'
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}

export default ChatAssistantDrawer
