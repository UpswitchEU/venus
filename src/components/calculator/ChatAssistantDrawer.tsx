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
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
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
import { AuroraButton } from '@/design-system/components/Button'
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
  const lowerText = text.toLowerCase()

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
    { pattern: /advies|advieskosten|vergoeding/i, field: 'oneTime', label: 'Advieskosten', code: '613' },
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
  /** Called when the advisor dismisses a warning (acknowledged without acting). */
  onDismissQualityWarning?: (warningType: string) => void
  /** Called when the advisor clicks the CTA. Sends `prompt` into the chat. */
  onResolveQualityWarning?: (warningType: string, prompt: string) => void
  // Bi-directional sync: when AI suggests field updates
  onApplyFieldUpdate?: (field: string, value: any) => void
  pendingUpdates?: { field: string; value: any; label: string }[]
  onAcceptUpdate?: (field: string) => void
  onRejectUpdate?: (field: string) => void
  // Normalization suggestion handlers
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  // Quick suggestion pills for common normalizations
  showQuickNormalizations?: boolean
  // Command pill click handler - auto-fills and sends
  onCommandPillClick?: (command: string) => void
  // Open Normalization Hub - redirects to central hub when CSV is uploaded
  onOpenNormalizationHub?: () => void
  hasUploadedData?: boolean
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
  const {
    fieldContext,
    hasReport = false,
    hasEbitda = false,
    pendingNormalizationsCount = 0,
  } = ctx

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
    const yearMatch = fieldContext?.field === 'ebitda' && fieldContext?.label
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
  onDismissQualityWarning,
  onResolveQualityWarning,
  onAcceptNormalisation,
  onRejectNormalisation,
  showQuickNormalizations = false,
  onCommandPillClick,
  onOpenNormalizationHub,
  hasUploadedData = false,
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
  const lastMsgContent = messages[messages.length - 1]?.content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, lastMsgContent])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

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
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)])
    }
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
          {/* Backdrop - touch-none/overscroll-none prevent background scroll on iOS */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springDefault}
            onClick={() => onOpenChange(false)}
            onTouchMove={(e) => e.preventDefault()}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm touch-none overscroll-none"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={springDefault}
            className={cn(
              // Base: Full screen on mobile for immersive experience
              'fixed right-0 top-0 bottom-0 z-50',
              'w-full h-full p-0 flex flex-col',
              // Tablet+: Balanced width - not too narrow, not too wide
              'sm:w-[440px] md:w-[480px] lg:w-[520px]',
              // Premium styling
              'bg-background border-l border-foreground/[0.08]',
              // Safe area for mobile notches/home indicators
              'pb-[env(safe-area-inset-bottom)]'
            )}
          >
            {/* Header - Minimal, premium design with close button on right */}
            <div className="shrink-0 px-5 sm:px-6 py-4 sm:py-5 border-b border-foreground/[0.06] bg-background/80 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                {/* Title - now on the left */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-base font-semibold text-foreground tracking-tight">
                    {ca('title')}
                  </h2>
                  {fieldContext && (
                    <p className="text-sm sm:text-xs text-foreground/50 truncate mt-0.5">
                      {fieldContext.label || ''}
                    </p>
                  )}
                </div>
                {/* Hub Button - when CSV data is uploaded */}
                {hasUploadedData && onOpenNormalizationHub && (
                  <AuroraButton
                    variant="secondary"
                    size="sm"
                    onClick={onOpenNormalizationHub}
                    className="shrink-0 gap-1.5 text-xs"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    {ca('openHub')}
                  </AuroraButton>
                )}
                {/* Close button */}
                <button
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'shrink-0 w-10 h-10 sm:w-9 sm:h-9 rounded-xl sm:rounded-lg',
                    'flex items-center justify-center',
                    'text-foreground/40 hover:text-foreground/70',
                    'hover:bg-foreground/[0.06] active:bg-foreground/[0.08]',
                    'transition-colors touch-manipulation'
                  )}
                  aria-label={ca('close')}
                >
                  <X className="w-5 h-5 sm:w-4 sm:h-4" />
                </button>
              </div>
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
                className="shrink-0 px-4 sm:px-5 pt-4 pb-2 space-y-3"
                data-testid="assistant-engine-insights"
              >
                {qualityWarnings.map((w) => (
                  <motion.div
                    key={w.type}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="flex gap-3"
                  >
                    {/* Assistant avatar — same shape as message bubbles so
                        the insight reads as the assistant speaking. */}
                    <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div
                      className={cn(
                        'max-w-[85%] sm:max-w-[82%] flex-1 min-w-0',
                        'rounded-2xl rounded-tl-md',
                        'px-4 py-3',
                        'bg-card/60 backdrop-blur-sm',
                        'border border-border/40',
                        'shadow-sm'
                      )}
                      role="status"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                          {ca('insightSeverity', { default: 'Insight' })}
                        </span>
                      </div>
                      {w.message ? (
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {w.message}
                        </p>
                      ) : null}
                      {w.recommendation ? (
                        <p className="text-sm text-foreground/65 mt-1 leading-snug">
                          {w.recommendation}
                        </p>
                      ) : null}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {w.cta_label && w.cta_prompt ? (
                          <button
                            type="button"
                            onClick={() =>
                              onResolveQualityWarning?.(w.type, w.cta_prompt!)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15 active:scale-95 transition-all whitespace-nowrap touch-manipulation"
                          >
                            {w.cta_label}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDismissQualityWarning?.(w.type)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/80 active:scale-95 transition-all touch-manipulation"
                        >
                          {ca('dismissWarning', { default: 'Dismiss' })}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pending Field Updates - Bi-directional sync UI */}
            {pendingUpdates.length > 0 && (
              <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-b border-foreground/[0.06] bg-primary/5">
                <p className="text-sm sm:text-xs font-medium text-primary mb-2.5 sm:mb-2">
                  {ca('suggestedUpdates')}
                </p>
                <div className="space-y-2.5 sm:space-y-2">
                  {pendingUpdates.map((update) => (
                    <div
                      key={update.field}
                      className="flex items-center justify-between gap-3 p-3 sm:p-2.5 rounded-xl sm:rounded-lg bg-background border border-primary/20"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-xs font-medium text-foreground truncate">
                          {update.label}
                        </p>
                        <p className="text-sm sm:text-xs text-foreground/50 font-mono">
                          →{' '}
                          {typeof update.value === 'number'
                            ? `€${update.value.toLocaleString(currencyLocale)}`
                            : update.value}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-1.5 shrink-0">
                        <button
                          onClick={() => onRejectUpdate?.(update.field)}
                          className="p-2.5 sm:p-2 rounded-lg sm:rounded hover:bg-foreground/[0.06] text-foreground/40 active:scale-95 transition-transform touch-manipulation"
                        >
                          <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            onApplyFieldUpdate?.(update.field, update.value)
                            onAcceptUpdate?.(update.field)
                          }}
                          className="p-2.5 sm:p-2 rounded-lg sm:rounded bg-primary/10 hover:bg-primary/20 text-primary active:scale-95 transition-transform touch-manipulation"
                        >
                          <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
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
                        onCommandPillClick={handleCommandPillClick}
                        onRetry={onRetry}
                      />
                    ))}
                  </AnimatePresence>

                  {showLoadingSkeleton && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                      className="flex items-start gap-3"
                    >
                      {/* AI Avatar - matches message bubble */}
                      <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-primary animate-pulse" />
                      </div>
                      {/* Streaming skeleton */}
                      <div className="flex-1 max-w-[82%] space-y-2">
                        <div className="rounded-2xl rounded-tl-md px-5 py-4 bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.02] border border-foreground/[0.08] backdrop-blur-sm space-y-3">
                          {/* Tool execution indicator */}
                          {toolInProgress ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                              <span className="text-xs text-primary/80 font-medium">
                                {ca.has(`tools.${toolInProgress}`)
                                  ? ca(`tools.${toolInProgress}` as any)
                                  : ca('tools.default')}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <motion.div
                                className="w-2 h-2 rounded-full bg-primary"
                                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <motion.div
                                className="w-2 h-2 rounded-full bg-primary"
                                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                  delay: 0.15,
                                }}
                              />
                              <motion.div
                                className="w-2 h-2 rounded-full bg-primary"
                                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                  delay: 0.3,
                                }}
                              />
                              <span className="ml-2 text-xs text-foreground/40">
                                {ca('typing')}
                              </span>
                            </div>
                          )}
                          {/* Content skeleton lines */}
                          <div className="space-y-2">
                            <motion.div
                              className="h-3 bg-foreground/[0.06] rounded-full"
                              style={{ width: '85%' }}
                              animate={{ opacity: [0.5, 0.8, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            />
                            <motion.div
                              className="h-3 bg-foreground/[0.06] rounded-full"
                              style={{ width: '70%' }}
                              animate={{ opacity: [0.5, 0.8, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                            />
                            <motion.div
                              className="h-3 bg-foreground/[0.06] rounded-full"
                              style={{ width: '55%' }}
                              animate={{ opacity: [0.5, 0.8, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Contextual suggestions consolidated into input area pills */}

            {/* Input Area - Premium Glassmorphism Design with safe area */}
            <div className="shrink-0 p-4 sm:p-5 border-t border-foreground/[0.06] bg-background/80 backdrop-blur-xl">
              {/* Command Detection Indicator */}
              <AnimatePresence>
                {detectedCommands.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="mb-3 sm:mb-3 p-3 sm:p-2.5 rounded-xl bg-primary/10 border border-primary/20"
                  >
                    <p className="text-xs sm:text-[10px] font-medium text-primary mb-2 sm:mb-1.5 uppercase tracking-wide">
                      {ca('normCommandDetected')}
                    </p>
                    <div className="flex flex-wrap gap-2.5 sm:gap-2">
                      {detectedCommands.map((cmd, index) => (
                        <div
                          key={index}
                          className="inline-flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-1.5 sm:py-1 rounded-lg sm:rounded-md bg-primary/15 border border-primary/25"
                        >
                          <span className="text-sm sm:text-xs font-medium text-primary">
                            {nh(`fieldLabels.${cmd.field}` as any) || cmd.label}
                          </span>
                          <span className="text-sm sm:text-xs text-foreground/60">→</span>
                          <span className="text-sm sm:text-xs font-mono font-semibold text-foreground">
                            €{cmd.value.toLocaleString(currencyLocale)}
                          </span>
                          <Check className="w-4 h-4 sm:w-3 sm:h-3 text-primary" />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs sm:text-[10px] text-primary/70 mt-2 sm:mt-1.5">
                      {ca('normCommandDesc')}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Smart Number Detection Indicator */}
              <AnimatePresence>
                {detectedValues.length > 0 && detectedCommands.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="mb-3 sm:mb-3 p-3 sm:p-2.5 rounded-xl bg-success/10 border border-success/20"
                  >
                    <p className="text-xs sm:text-[10px] font-medium text-success mb-2 sm:mb-1.5 uppercase tracking-wide">
                      {ca('detectedValues')}
                    </p>
                    <div className="flex flex-wrap gap-2.5 sm:gap-2">
                      {detectedValues.map((detected, index) => (
                        <div
                          key={index}
                          className="inline-flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-1.5 sm:py-1 rounded-lg sm:rounded-md bg-success/15 border border-success/25"
                        >
                          <span className="text-sm sm:text-xs font-medium text-success">
                            {nh(`fieldLabels.${detected.field}` as any) || detected.label}
                          </span>
                          <span className="text-sm sm:text-xs font-mono font-semibold text-foreground">
                            €{detected.value.toLocaleString(currencyLocale)}
                          </span>
                          <Check className="w-4 h-4 sm:w-3 sm:h-3 text-primary" />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs sm:text-[10px] text-success/70 mt-2 sm:mt-1.5">
                      {ca('detectedValuesDesc')}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Premium Input Container */}
              <motion.div
                initial={false}
                animate={{
                  borderColor: isInputFocused
                    ? 'hsl(var(--foreground) / 0.12)'
                    : 'hsl(var(--foreground) / 0.08)',
                }}
                className={cn(
                  'relative w-full flex flex-col rounded-2xl sm:rounded-xl',
                  'p-3.5 sm:p-3',
                  'bg-foreground/[0.03] backdrop-blur-xl',
                  'border border-foreground/[0.08]',
                  'transition-[box-shadow] duration-300',
                  !isInputFocused && 'hover:bg-foreground/[0.04]'
                )}
                style={{
                  boxShadow: isInputFocused
                    ? '0 0 20px -8px hsl(var(--foreground) / 0.08), 0 4px 20px -8px hsl(var(--background) / 0.3)'
                    : '0 4px 20px -8px hsl(var(--background) / 0.3)',
                }}
              >
                {/* Attachments Preview */}
                <AnimatePresence>
                  {attachments.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex gap-2.5 sm:gap-2 mb-3 sm:mb-2 pb-3 sm:pb-2 flex-wrap border-b border-foreground/[0.06]"
                    >
                      {attachments.map((file, index) => (
                        <motion.span
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          className="inline-flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-2 sm:py-1 rounded-xl sm:rounded-lg bg-foreground/[0.06] text-sm sm:text-xs text-foreground/70"
                        >
                          {file.type.startsWith('image/') ? (
                            <ImageIcon className="w-4 h-4 sm:w-3 sm:h-3" />
                          ) : (
                            <FileText className="w-4 h-4 sm:w-3 sm:h-3" />
                          )}
                          <span className="truncate max-w-[120px] sm:max-w-[100px]">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="p-1 sm:p-0.5 rounded-md sm:rounded hover:bg-foreground/[0.08] text-foreground/40 hover:text-destructive touch-manipulation"
                          >
                            <X className="w-4 h-4 sm:w-3 sm:h-3" />
                          </button>
                        </motion.span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Textarea Row */}
                <div className="flex items-end gap-2.5 sm:gap-2">
                  {/* Attach Button - 48px touch target on mobile */}
                  <motion.button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      'shrink-0 rounded-xl sm:rounded-lg transition-colors touch-manipulation',
                      'w-12 h-12 sm:w-10 sm:h-10 flex items-center justify-center',
                      'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06]',
                      'active:bg-foreground/[0.08]'
                    )}
                    aria-label={ca('addFile')}
                  >
                    <Paperclip className="w-5 h-5 sm:w-4 sm:h-4" />
                  </motion.button>

                  {/* Textarea - text-base prevents iOS zoom */}
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
                    rows={1}
                    className={cn(
                      'flex-1 w-full bg-transparent border-none outline-none resize-none',
                      'focus:outline-none focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus:shadow-none focus:border-transparent',
                      // text-base on mobile prevents iOS auto-zoom
                      'text-base sm:text-sm min-h-[48px] sm:min-h-[44px] leading-relaxed',
                      'text-foreground placeholder:text-foreground/40',
                      'transition-colors duration-200'
                    )}
                    disabled={isGenerating}
                    aria-label={ca('chatInput')}
                  />

                  {/* Send Button - 48px touch target on mobile */}
                  <motion.button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={(!input.trim() && attachments.length === 0) || isGenerating}
                    whileHover={{ scale: input.trim() || attachments.length > 0 ? 1.05 : 1 }}
                    whileTap={{ scale: input.trim() || attachments.length > 0 ? 0.95 : 1 }}
                    className={cn(
                      'shrink-0 w-12 h-12 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center',
                      'transition-all duration-200 touch-manipulation',
                      // Enabled with value
                      (input.trim() || attachments.length > 0) &&
                        !isGenerating && [
                          'bg-primary text-primary-foreground',
                          'shadow-md shadow-primary/20',
                          'hover:shadow-lg hover:shadow-primary/30',
                          'active:scale-95',
                        ],
                      // Disabled/empty
                      !input.trim() &&
                        attachments.length === 0 &&
                        !isGenerating && [
                          'bg-foreground/[0.06] text-foreground/30',
                          'cursor-not-allowed',
                        ],
                      // Loading
                      isGenerating && 'bg-primary/70 text-primary-foreground cursor-wait'
                    )}
                    aria-label={ca('send')}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 sm:w-4 sm:h-4" />
                    )}
                  </motion.button>
                </div>

                {/* Quick Suggestion Pills (when empty) - Horizontal scroll on mobile */}
                <AnimatePresence>
                  {!input.trim() && !isGenerating && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 sm:mt-3 pt-3 sm:pt-3 border-t border-foreground/[0.06]"
                    >
                      {/* On mobile: horizontal scroll, on desktop: wrap */}
                      <div className="flex sm:flex-wrap items-center gap-2.5 sm:gap-2 overflow-x-auto sm:overflow-visible scrollbar-hide pb-1 sm:pb-0">
                        {suggestions.slice(0, 4).map((suggestion, index) => (
                          <motion.button
                            key={index}
                            type="button"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15, delay: 0.02 + index * 0.03 }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleCommandPillClick(suggestion)}
                            disabled={isGenerating}
                            className={cn(
                              'shrink-0 sm:shrink',
                              // Mobile: Larger touch targets
                              'px-4 py-2.5 sm:px-3 sm:py-1.5',
                              'rounded-full inline-flex items-center gap-1.5',
                              'bg-foreground/[0.05] backdrop-blur-sm',
                              'border border-foreground/[0.08]',
                              'text-sm sm:text-xs font-medium text-foreground/60',
                              'hover:bg-foreground/[0.08] hover:border-foreground/[0.12] hover:text-foreground/80',
                              'active:scale-95 transition-all duration-150 touch-manipulation whitespace-nowrap',
                              isGenerating && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {suggestion}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Keyboard Hint */}
                <AnimatePresence>
                  {isInputFocused && input.trim() && !isGenerating && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-2 right-14 text-[10px] text-foreground/25 hidden md:block"
                    >
                      {ca('sendHint')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
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

// Category icons for normalization suggestions
const categoryIcons: Record<string, string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
  other: '📊',
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
  onCommandPillClick,
  onRetry,
}: {
  message: ChatMessage
  isStreaming?: boolean
  onApplyUpdate?: (field: string, value: any) => void
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  onCommandPillClick?: (command: string) => void
  onRetry?: (messageId: string) => void
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
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className={cn('flex gap-3 group/msg', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* AI Avatar - Premium minimal design */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center mt-1">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          // Responsive bubble sizing with premium shapes
          'max-w-[85%] sm:max-w-[82%]',
          isUser
            ? // User bubble: Teal tint with dark text for readability
              [
                'rounded-2xl rounded-tr-md',
                'px-4 py-3',
                'bg-gradient-to-br from-primary/15 via-primary/12 to-primary/8',
                'text-foreground',
                'border border-primary/25',
                'shadow-sm',
              ]
            : // AI bubble: Glassmorphism with depth
              [
                'rounded-2xl rounded-tl-md',
                'px-5 py-4',
                'bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.02]',
                'border border-foreground/[0.08]',
                'backdrop-blur-sm',
                'text-foreground',
                'shadow-sm',
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

        {/* YC-Standard: Structured Cards with Impact Framing */}
        {message.fieldUpdates && message.fieldUpdates.length > 0 && (
          <div className="mt-4 sm:mt-3 pt-4 sm:pt-3 border-t border-foreground/[0.08] space-y-3 sm:space-y-2">
            {message.fieldUpdates.map((update) => (
              <div
                key={update.field}
                className="rounded-xl sm:rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden"
              >
                {/* Header with source badge */}
                <div className="flex items-center justify-between px-4 sm:px-3 py-2.5 sm:py-2 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-xs font-medium text-foreground">
                      {update.label}
                    </span>
                    {update.grootboekCode && (
                      <span className="text-xs sm:text-[9px] font-mono text-foreground/40 bg-foreground/[0.04] px-2 sm:px-1.5 py-0.5 rounded">
                        {update.grootboekCode}
                      </span>
                    )}
                  </div>
                  {update.source && (
                    <span
                      className={cn(
                        'text-xs sm:text-[9px] font-medium px-2 sm:px-1.5 py-0.5 rounded',
                        update.source === 'yuki'
                          ? 'bg-primary/10 text-primary'
                          : update.source === 'ai'
                            ? 'bg-primary/10 text-primary'
                            : update.source === 'kbo'
                              ? 'bg-success/10 text-success'
                              : 'bg-foreground/[0.06] text-foreground/50'
                      )}
                    >
                      {update.source === 'ai'
                        ? ca('aiSuggestion')
                        : update.source === 'yuki'
                          ? 'Yuki'
                          : update.source === 'kbo'
                            ? ca('registrySource') ?? 'Registry'
                            : update.source}
                    </span>
                  )}
                </div>

                {/* Value + Impact */}
                <div className="px-4 sm:px-3 py-3 sm:py-2.5 space-y-2.5 sm:space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-base sm:text-sm font-mono font-semibold text-foreground">
                      €{update.value.toLocaleString(currencyLocale)}
                    </span>
                    {update.confidence && (
                      <div
                        className={cn(
                          'flex items-center gap-1.5 sm:gap-1 text-xs sm:text-[10px]',
                          update.confidence === 'high'
                            ? 'text-success'
                            : update.confidence === 'medium'
                              ? 'text-secondary'
                              : 'text-foreground/40'
                        )}
                      >
                        <div
                          className={cn(
                            'w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full',
                            update.confidence === 'high'
                              ? 'bg-success'
                              : update.confidence === 'medium'
                                ? 'bg-secondary'
                                : 'bg-foreground/30'
                          )}
                        />
                        {update.confidence === 'high'
                          ? ca('reliable')
                          : update.confidence === 'medium'
                            ? ca('toVerify')
                            : ca('indicative')}
                      </div>
                    )}
                  </div>

                  {/* Impact framing - YC killer feature */}
                  {update.impact && (
                    <div className="flex items-center gap-3 p-3 sm:p-2 rounded-lg sm:rounded-md bg-success/5 border border-success/10">
                      <div className="flex-1">
                        <p className="text-xs sm:text-[10px] text-success/70 uppercase tracking-wide mb-0.5">
                          {ca('impactOnValue')}
                        </p>
                        <p className="text-sm sm:text-xs font-semibold text-success">
                          +€{update.impact.valuationDelta.toLocaleString(currencyLocale)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs sm:text-[10px] text-foreground/50">
                          EBITDA {update.impact.ebitdaDelta > 0 ? '+' : ''}€
                          {(update.impact.ebitdaDelta / 1000).toFixed(0)}k
                        </p>
                        {update.impact.multiple && (
                          <p className="text-xs sm:text-[10px] text-foreground/40">
                            @ {update.impact.multiple}x
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action button - 48px touch target on mobile */}
                <button
                  onClick={() => onApplyUpdate?.(update.field, update.value)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2',
                    'px-4 sm:px-3 py-3.5 sm:py-2.5',
                    'bg-primary/10 hover:bg-primary/20 active:bg-primary/25',
                    'transition-colors border-t border-foreground/[0.04]',
                    'touch-manipulation'
                  )}
                >
                  <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-primary" />
                  <span className="text-sm sm:text-xs font-medium text-primary">
                    {ca('acceptAndApply')}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* AI-Generated Normalization Suggestions with Accept/Reject */}
        {message.normalisationSuggestions && message.normalisationSuggestions.length > 0 && (
          <div className="mt-4 sm:mt-3 pt-4 sm:pt-3 border-t border-foreground/[0.08] space-y-3 sm:space-y-2">
            <p className="text-xs sm:text-[10px] font-medium text-foreground/50 uppercase tracking-wide mb-2.5 sm:mb-2">
              {ca('normSuggestions')}
            </p>
            {message.normalisationSuggestions.map((suggestion) => {
              const valuationImpact =
                suggestion.valuationImpact ||
                Math.round(suggestion.amount * (suggestion.multiple || 5.2))
              const isPending = suggestion.status === 'pending'
              const isAccepted = suggestion.status === 'accepted'
              const isRejected = suggestion.status === 'rejected'

              return (
                <motion.div
                  key={suggestion.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    'rounded-xl sm:rounded-lg border overflow-hidden transition-all',
                    isPending
                      ? 'border-primary/20 bg-primary/5'
                      : isAccepted
                        ? 'border-success/20 bg-success/5'
                        : 'border-foreground/10 bg-foreground/[0.02] opacity-60'
                  )}
                >
                  {/* Suggestion Header */}
                  <div className="flex items-start gap-3 p-4 sm:p-3">
                    <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0 text-lg sm:text-base">
                      {categoryIcons[suggestion.category] || '📊'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-xs font-medium text-foreground">
                        {ca('normalizeSuggestion', {
                          description: (suggestion.description || '').toLowerCase(),
                        })}
                      </p>
                      <p className="text-xs sm:text-[10px] text-foreground/50 mt-1 sm:mt-0.5">
                        {suggestion.reason}
                      </p>
                      {suggestion.sourceRef && (
                        <span className="inline-block mt-1.5 sm:mt-1 text-xs sm:text-[9px] font-mono text-foreground/40 bg-foreground/[0.04] px-2 sm:px-1.5 py-0.5 rounded">
                          {suggestion.sourceRef}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Impact + Actions - Stack on mobile for better touch targets */}
                  {isPending ? (
                    <div className="flex flex-col sm:flex-row sm:items-center border-t border-foreground/[0.06]">
                      {/* Impact Display */}
                      <div className="flex-1 px-4 sm:px-3 py-3 sm:py-2 bg-success/5">
                        <p className="text-xs sm:text-[10px] text-success/70">{ca('impact')}</p>
                        <p className="text-sm sm:text-xs font-mono font-semibold text-success">
                          {ca('impactEbitdaToValue', {
                            ebitda: suggestion.amount.toLocaleString(currencyLocale),
                            value: valuationImpact.toLocaleString(currencyLocale),
                          })}
                        </p>
                      </div>
                      {/* Accept/Reject Buttons - Full width on mobile */}
                      <div className="flex shrink-0 border-t sm:border-t-0 border-foreground/[0.06]">
                        <button
                          onClick={() => onRejectNormalisation?.(suggestion.id)}
                          className={cn(
                            'flex-1 sm:flex-initial flex items-center justify-center gap-2',
                            'px-5 sm:px-4 py-4 sm:py-3',
                            'text-foreground/40 hover:text-destructive hover:bg-destructive/10',
                            'active:bg-destructive/15 transition-colors',
                            'sm:border-l border-foreground/[0.06]',
                            'touch-manipulation'
                          )}
                          aria-label={ca('reject')}
                        >
                          <X className="w-5 h-5 sm:w-4 sm:h-4" />
                          <span className="text-sm sm:hidden">{ca('reject')}</span>
                        </button>
                        <button
                          onClick={() => onAcceptNormalisation?.(suggestion.id)}
                          className={cn(
                            'flex-1 sm:flex-initial flex items-center justify-center gap-2',
                            'px-5 sm:px-4 py-4 sm:py-3',
                            'bg-success/10 text-success hover:bg-success/20',
                            'active:bg-success/25 transition-colors',
                            'touch-manipulation'
                          )}
                          aria-label={ca('accept')}
                        >
                          <Check className="w-5 h-5 sm:w-4 sm:h-4" />
                          <span className="text-sm sm:hidden">{ca('accept')}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'px-4 sm:px-3 py-3 sm:py-2 text-sm sm:text-xs text-center border-t',
                        isAccepted
                          ? 'border-success/10 text-success bg-success/5'
                          : 'border-foreground/[0.06] text-foreground/40'
                      )}
                    >
                      {isAccepted ? ca('accepted') : ca('rejected')}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Task-driven: Open tasks the user can complete */}
        {message.tasks && message.tasks.length > 0 && (
          <div className="mt-4 sm:mt-3 pt-4 sm:pt-3 border-t border-foreground/[0.08] space-y-3 sm:space-y-2">
            <p className="text-xs sm:text-[10px] font-medium text-foreground/50 uppercase tracking-wide mb-2.5 sm:mb-2">
              {ca('openTasks')}
            </p>
            {message.tasks
              .filter((t) => !t.completed)
              .map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center gap-3 p-3.5 sm:p-2.5 rounded-xl sm:rounded-lg',
                    'border border-foreground/[0.08] bg-foreground/[0.02]',
                    'active:bg-foreground/[0.04] transition-colors touch-manipulation'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 sm:w-6 sm:h-6 rounded-lg sm:rounded-md flex items-center justify-center text-xs sm:text-[10px] font-bold shrink-0',
                      task.type === 'confirm'
                        ? 'bg-secondary/10 text-secondary'
                        : task.type === 'approve'
                          ? 'bg-success/10 text-success'
                          : task.type === 'enter'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-foreground/[0.06] text-foreground/50'
                    )}
                  >
                    {task.type === 'confirm'
                      ? '?'
                      : task.type === 'approve'
                        ? '✓'
                        : task.type === 'enter'
                          ? '→'
                          : task.type === 'upload'
                            ? '↑'
                            : '○'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-xs font-medium text-foreground truncate">
                      {task.label}
                    </p>
                    {task.context && (
                      <p className="text-xs sm:text-[10px] text-foreground/50 truncate">
                        {task.context}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 text-foreground/30 shrink-0" />
                </div>
              ))}
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
