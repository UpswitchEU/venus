import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { trackAIAssistantMessage } from '@/lib/analytics'
import { type AssistantIntent, resolveAssistantIntent } from '@/services/ai/local-chat-fallback'
import {
  buildChatAssistantSuggestionViews,
  findChatAssistantSuggestionIntent,
} from './ChatAssistantDrawer.model'
import type { ChatAssistantDrawerProps } from './ChatAssistantDrawer.types'
import {
  type ParsedCommand,
  type ParsedValue,
  parseFinancialValues,
  parseNormalizationCommands,
} from './ChatAssistantParsing'
import { getContextualSuggestionKeys } from './ChatAssistantSuggestions'

interface UseChatAssistantComposerControllerOptions {
  acceptedNormalizationsCount: number
  fieldContext: ChatAssistantDrawerProps['fieldContext']
  hasCapBreach: boolean
  hasEbitda: boolean
  hasReport: boolean
  isGenerating: boolean
  onCommandPillClick?: ChatAssistantDrawerProps['onCommandPillClick']
  onSendMessage: ChatAssistantDrawerProps['onSendMessage']
  pendingNormalizationsCount: number
  translateSuggestion: (key: string, params?: Record<string, string>) => string
}

export function useChatAssistantComposerController({
  acceptedNormalizationsCount,
  fieldContext,
  hasCapBreach,
  hasEbitda,
  hasReport,
  isGenerating,
  onCommandPillClick,
  onSendMessage,
  pendingNormalizationsCount,
  translateSuggestion,
}: UseChatAssistantComposerControllerOptions) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [detectedValues, setDetectedValues] = useState<ParsedValue[]>([])
  const [detectedCommands, setDetectedCommands] = useState<ParsedCommand[]>([])
  const [isInputFocused, setIsInputFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingAssistantIntentRef = useRef<AssistantIntent | undefined>(undefined)

  const suggestionItems = useMemo(
    () =>
      getContextualSuggestionKeys({
        fieldContext,
        hasReport,
        hasEbitda,
        pendingNormalizationsCount,
        acceptedNormalizationsCount,
        hasCapBreach,
      }),
    [
      acceptedNormalizationsCount,
      fieldContext,
      hasCapBreach,
      hasEbitda,
      hasReport,
      pendingNormalizationsCount,
    ]
  )
  const suggestionViews = useMemo(
    () => buildChatAssistantSuggestionViews(suggestionItems, translateSuggestion),
    [suggestionItems, translateSuggestion]
  )
  const suggestions = useMemo(
    () => suggestionViews.map((suggestion) => suggestion.label),
    [suggestionViews]
  )

  const handleCommandPillClick = useCallback(
    (command: string) => {
      if (onCommandPillClick) {
        onCommandPillClick(command)
        return
      }
      const commands = parseNormalizationCommands(command)
      onSendMessage(command, undefined, undefined, commands.length > 0 ? commands : undefined)
    },
    [onCommandPillClick, onSendMessage]
  )

  const insertSuggestion = useCallback((text: string, intent?: AssistantIntent) => {
    pendingAssistantIntentRef.current = intent
    let nextValue = ''
    flushSync(() => {
      setInput((prev) => {
        const trimmed = prev.replace(/\s+$/, '')
        nextValue = trimmed.length > 0 ? `${trimmed} ${text} ` : `${text} `
        return nextValue
      })
    })
    const el = textareaRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(nextValue.length, nextValue.length)
  }, [])

  const handleSuggestionClick = useCallback(
    (label: string) => {
      insertSuggestion(label, findChatAssistantSuggestionIntent(suggestionViews, label))
    },
    [insertSuggestion, suggestionViews]
  )

  useEffect(() => {
    void input
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  useEffect(() => {
    if (input.length > 5) {
      const commands = parseNormalizationCommands(input)
      setDetectedCommands(commands)

      if (commands.length === 0) {
        setDetectedValues(parseFinancialValues(input))
      } else {
        setDetectedValues([])
      }
    } else {
      setDetectedValues([])
      setDetectedCommands([])
    }
  }, [input])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (isGenerating) return
      if (!input.trim() && attachments.length === 0) return
      trackAIAssistantMessage()
      const intent = resolveAssistantIntent(input, pendingAssistantIntentRef.current)
      pendingAssistantIntentRef.current = undefined
      onSendMessage(
        input,
        attachments,
        detectedValues.length > 0 ? detectedValues : undefined,
        detectedCommands.length > 0 ? detectedCommands : undefined,
        intent
      )
      setInput('')
      setAttachments([])
      setDetectedValues([])
      setDetectedCommands([])
    },
    [input, attachments, detectedValues, detectedCommands, isGenerating, onSendMessage]
  )

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) setAttachments((prev) => [...prev, ...Array.from(files)])
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return {
    attachments,
    detectedCommands,
    detectedValues,
    fileInputRef,
    handleCommandPillClick,
    handleFileChange,
    handleKeyDown,
    handleSubmit,
    handleSuggestionClick,
    input,
    isInputFocused,
    removeAttachment,
    setInput,
    setIsInputFocused,
    suggestions,
    textareaRef,
  }
}
