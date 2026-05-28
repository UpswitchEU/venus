'use client'

/**
 * Chat Input Panel
 *
 * AI-powered conversational interface for valuation input.
 * World-class design: focused empty state, clear guidance, minimal chrome.
 * Inspired by ChatGPT, Perplexity, Linear.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Building2, FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { scrollContainerToBottom } from '@/utils/scrollContainer'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { AuroraInput as Input } from '@/design-system/components/Input'
import { cn } from '@/design-system/utils'

// Types
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: { name: string; type: string; url: string }[]
}

export interface CollectedData {
  companyName?: string
  businessType?: string
  industry?: string
  country?: string
  yearFounded?: string
  ownerManagers?: number
}

export interface ChatInputPanelProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, attachments?: File[]) => void
  isGenerating?: boolean
  collectedData?: CollectedData
}

export function ChatInputPanel({
  messages,
  onSendMessage,
  isGenerating = false,
  collectedData,
}: ChatInputPanelProps) {
  const ca = useTranslations('chatAssistant')
  const suggestions = [
    ca('suggestions.suggestion1'),
    ca('suggestions.suggestion2'),
    ca('suggestions.suggestion3'),
    ca('suggestions.suggestion4'),
  ]
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollContainerToBottom(messagesContainerRef.current)
  }, [messages.length, isGenerating])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() && attachments.length === 0) return
    onSendMessage(input, attachments)
    setInput('')
    setAttachments([])
  }

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

  const isEmpty = messages.length === 0
  const hasContext = collectedData?.companyName

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState
            suggestions={suggestions}
            onSuggestionClick={(text) => setInput(text)}
            companyName={collectedData?.companyName}
          />
        ) : (
          <div className="p-4 space-y-4">
            {/* Context indicator if we have company info */}
            {hasContext && messages.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-sm">
                <Building2 className="w-4 h-4 text-primary" />
                <span className="text-foreground/70">
                  {ca('contextPrefix')} {collectedData.companyName}
                </span>
              </div>
            )}

            <AnimatePresence>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>

            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:300ms]" />
                </div>
              </motion.div>
            )}

            <div aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom with safe area */}
      <div className="shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-foreground/[0.06] bg-background">
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/[0.08] text-xs"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="w-3.5 h-3.5 text-foreground/50" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-foreground/50" />
                )}
                <span className="text-foreground/70 truncate max-w-[100px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-foreground/40 hover:text-destructive min-w-[44px] min-h-[44px] flex items-center justify-center -m-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl text-foreground/40 hover:text-foreground hover:bg-foreground/[0.04] transition-colors active:scale-95"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ca('suggestions.askOrUploadDoc')}
              rows={1}
              className={cn(
                'w-full resize-none rounded-xl px-4 py-3 pr-12',
                'bg-foreground/[0.04] border border-foreground/[0.08]',
                'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                'text-base sm:text-sm placeholder:text-foreground/40',
                'transition-colors min-h-[44px]'
              )}
              disabled={isGenerating}
            />

            <button
              onClick={() => handleSubmit()}
              disabled={(!input.trim() && attachments.length === 0) || isGenerating}
              className={cn(
                'absolute right-1.5 bottom-1.5 w-9 h-9 flex items-center justify-center rounded-lg transition-all active:scale-95',
                input.trim() || attachments.length > 0
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'text-foreground/30'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-foreground/30 mt-2 hidden sm:block">
          {ca('suggestions.sendHintFull')}
        </p>
      </div>
    </div>
  )
}

// Empty State Component - Minimalist Dieter Rams aesthetic
function EmptyState({
  suggestions,
  onSuggestionClick,
  companyName,
}: {
  suggestions: string[]
  onSuggestionClick: (text: string) => void
  companyName?: string
}) {
  const ca = useTranslations('chatAssistant')
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 sm:p-6">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        {/* Header - Engaging, action-oriented */}
        <div className="text-center space-y-2">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">
            {companyName
              ? ca('suggestions.askAboutCompany', { company: companyName })
              : ca('suggestions.whatToKnow')}
          </h2>
          <p className="text-sm text-foreground/50">{ca('suggestions.uploadOrAsk')}</p>
        </div>

        {/* Suggestions - Simple text chips, no icons */}
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.03 }}
              onClick={() => onSuggestionClick(suggestion)}
              className={cn(
                'px-4 py-2.5 rounded-full text-sm min-h-[44px]',
                'bg-foreground/[0.04] border border-foreground/[0.08]',
                'text-foreground/60 hover:text-foreground active:scale-95',
                'hover:border-primary/30 hover:bg-primary/5',
                'transition-all'
              )}
            >
              {suggestion}
            </motion.button>
          ))}
        </div>

        {/* Subtle upload hint */}
        <p className="text-center text-xs text-foreground/30">
          {ca('suggestions.askOrUploadHint')}
        </p>
      </div>
    </div>
  )
}

// Message Bubble Component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary/15 text-foreground border border-primary/25 shadow-sm'
            : 'bg-foreground/[0.04] border border-foreground/[0.06] text-foreground'
        )}
      >
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.attachments.map((attachment, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
                  isUser ? 'bg-primary/20 text-foreground/80' : 'bg-foreground/[0.06]'
                )}
              >
                {attachment.type.startsWith('image/') ? (
                  <ImageIcon className="w-3 h-3" />
                ) : (
                  <FileText className="w-3 h-3" />
                )}
                <span className="truncate max-w-[80px]">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>

        <span
          className={cn(
            'text-[10px] mt-1.5 block',
            isUser ? 'text-foreground/50' : 'text-foreground/40'
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}
