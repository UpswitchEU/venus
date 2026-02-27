/**
 * Aurora Design System
 * ChatPanel Component
 *
 * Chat interface with Aurora effects, message bubbles, and glass morphism input.
 * Used for the conversational valuation flow.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Mic, Paperclip, Send, Sparkles, User } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import { fadeInUp, springDefault } from './motion'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
  isStreaming?: boolean
  attachments?: { name: string; type: string }[]
}

export interface AuroraChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, attachments?: File[]) => void
  isLoading?: boolean
  placeholder?: string
  className?: string
  showAuroraBackground?: boolean
}

// ─────────────────────────────────────────
// AURORA BACKGROUND EFFECT
// ─────────────────────────────────────────

const AuroraBackground: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* Primary aurora glow */}
    <motion.div
      className="absolute -top-[50%] -left-[50%] w-[150%] h-[150%] rounded-full"
      style={{
        background: 'radial-gradient(circle, hsl(172 55% 45% / 0.08) 0%, transparent 60%)',
      }}
      animate={{
        x: [0, 30, 0],
        y: [0, 20, 0],
        scale: [1, 1.1, 1],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
    {/* Secondary violet glow */}
    <motion.div
      className="absolute -bottom-[30%] -right-[30%] w-[100%] h-[100%] rounded-full"
      style={{
        background: 'radial-gradient(circle, hsl(270 45% 55% / 0.05) 0%, transparent 50%)',
      }}
      animate={{
        x: [0, -20, 0],
        y: [0, -30, 0],
        scale: [1, 1.15, 1],
      }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 2,
      }}
    />
  </div>
)

// ─────────────────────────────────────────
// MESSAGE BUBBLE
// ─────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user'

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className={cn('flex gap-3 max-w-[85%]', isUser ? 'ml-auto flex-row-reverse' : 'mr-auto')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-medium',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.08] text-foreground/60'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-md'
            : 'bg-foreground/[0.06] text-foreground border border-foreground/[0.06] rounded-tl-md'
        )}
      >
        {/* Content */}
        <div className="whitespace-pre-wrap break-words">
          {message.content}
          {message.isStreaming && (
            <motion.span
              className="inline-block w-2 h-4 ml-0.5 bg-current opacity-70"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-current/10">
            {message.attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-current/5 text-xs"
              >
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {message.timestamp && (
          <div
            className={cn(
              'text-[10px] mt-1',
              isUser ? 'text-primary-foreground/50' : 'text-foreground/30'
            )}
          >
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 10 }}
    className="flex items-center gap-3 max-w-[85%]"
  >
    <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-foreground/[0.08] text-foreground/60">
      <Sparkles className="w-4 h-4" />
    </div>
    <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-md bg-foreground/[0.06] border border-foreground/[0.06]">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-foreground/40"
          animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.2, 1] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  </motion.div>
)

// ─────────────────────────────────────────
// CHAT INPUT
// ─────────────────────────────────────────

interface ChatInputProps {
  onSend: (content: string, attachments?: File[]) => void
  placeholder?: string
  isLoading?: boolean
}

export const AuroraChatInput: React.FC<ChatInputProps> = ({
  onSend,
  placeholder = 'Type a message...',
  isLoading,
}) => {
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (!value.trim() || isLoading) return
    onSend(value.trim())
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }

  return (
    <div className="relative p-4">
      {/* Glass morphism container */}
      <div
        className={cn(
          'relative rounded-2xl border transition-all duration-200',
          'bg-hsl(var(--glass)) backdrop-blur-xl',
          'border-foreground/[0.08]',
          'shadow-lg shadow-black/5',
          'focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10'
        )}
      >
        <div className="flex items-end gap-2 p-2">
          {/* Attachment button */}
          <button
            type="button"
            className="shrink-0 p-2 rounded-xl text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.04] transition-colors"
            aria-label="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'flex-1 min-h-[40px] max-h-[150px] py-2 px-2',
              'bg-transparent resize-none',
              'text-foreground placeholder:text-foreground/40',
              'focus:outline-none',
              'text-sm leading-relaxed'
            )}
            disabled={isLoading}
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className={cn(
              'shrink-0 p-2.5 rounded-xl transition-all duration-200',
              value.trim() && !isLoading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                : 'text-foreground/30 cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

export const AuroraChatPanel: React.FC<AuroraChatPanelProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder,
  className,
  showAuroraBackground = true,
}) => {
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className={cn('aurora-theme relative flex flex-col h-full bg-background', className)}>
      {/* Aurora background effect */}
      {showAuroraBackground && <AuroraBackground />}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 relative z-10">
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>{isLoading && <TypingIndicator />}</AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="relative z-10 border-t border-foreground/[0.04] bg-background/80 backdrop-blur-sm">
        <AuroraChatInput onSend={onSendMessage} placeholder={placeholder} isLoading={isLoading} />
      </div>
    </div>
  )
}
