'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { KeyboardEvent, Ref } from 'react'
import { cn } from '@/design-system/utils'
import type { ParsedCommand, ParsedValue } from './ChatAssistantParsing'
import type { FieldContext } from './ChatAssistantTypes'

interface ChatAssistantComposerProps {
  attachments: File[]
  currencyLocale: string
  detectedCommands: ParsedCommand[]
  detectedValues: ParsedValue[]
  fieldContext?: FieldContext
  input: string
  isGenerating: boolean
  isInputFocused: boolean
  suggestions: string[]
  textareaRef: Ref<HTMLTextAreaElement>
  onAttachClick: () => void
  onFocusChange: (focused: boolean) => void
  onInputChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onRemoveAttachment: (index: number) => void
  onSubmit: () => void
  onSuggestionClick: (suggestion: string) => void
}

export function ChatAssistantComposer({
  attachments,
  currencyLocale,
  detectedCommands,
  detectedValues,
  fieldContext,
  input,
  isGenerating,
  isInputFocused,
  suggestions,
  textareaRef,
  onAttachClick,
  onFocusChange,
  onInputChange,
  onKeyDown,
  onRemoveAttachment,
  onSubmit,
  onSuggestionClick,
}: ChatAssistantComposerProps) {
  const ca = useTranslations('chatAssistant')
  const nh = useTranslations('normalizationHub')
  type NormalizationHubTranslationKey = Parameters<typeof nh>[0]
  const detectedItems = detectedCommands.length > 0 ? detectedCommands : detectedValues

  return (
    <div className="shrink-0 px-4 sm:px-5 pb-4 sm:pb-5 pt-2 space-y-2.5">
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
                onClick={() => onSuggestionClick(suggestion)}
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

      <AnimatePresence>
        {detectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.12 }}
            className="px-1 text-xs text-foreground/55 leading-relaxed"
          >
            <span className="text-foreground/35 mr-1.5">
              {detectedCommands.length > 0 ? ca('normCommandDetected') : ca('detectedValues')}:
            </span>
            {detectedItems.map((item, index) => {
              const fieldLabelKey = `fieldLabels.${item.field}` as NormalizationHubTranslationKey
              const label = nh.has(fieldLabelKey) ? nh(fieldLabelKey) : item.label

              return (
                <span key={index} className="font-mono">
                  {index > 0 && <span className="text-foreground/25 mx-1.5">·</span>}
                  {label}
                  <span className="text-foreground/35"> → </span>€
                  {item.value.toLocaleString(currencyLocale)}
                </span>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

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
                  onClick={() => onRemoveAttachment(index)}
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
          onChange={(event) => onInputChange(event.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          onKeyDown={onKeyDown}
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
            onClick={onAttachClick}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors touch-manipulation"
            aria-label={ca('addFile')}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onSubmit}
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
  )
}
