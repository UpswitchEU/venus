/**
 * ChatInputForm Component
 *
 * Single Responsibility: Render chat input form with suggestions
 * Extracted from StreamingChat.tsx to follow SRP
 *
 * @module components/chat/ChatInputForm
 */

import React from 'react'
import { useTranslations } from 'next-intl'

export interface ChatInputFormProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isStreaming: boolean
  disabled?: boolean
  placeholder?: string
  suggestions?: string[]
}

/**
 * ChatInputForm Component
 *
 * Renders the input form with:
 * - Textarea for user input
 * - Smart follow-up suggestions
 * - Submit button
 */
export const ChatInputForm: React.FC<ChatInputFormProps> = ({
  input,
  onInputChange,
  onSubmit,
  isStreaming,
  disabled = false,
  placeholder,
  suggestions = [],
}) => {
  const t = useTranslations()
  const defaultPlaceholder = placeholder || t('conversational.chat.placeholder')
  return (
    <div className="p-4 border-t border-zinc-800">
      <form
        onSubmit={onSubmit}
        className="focus-within:bg-zinc-900/60 group flex flex-col gap-3 p-4 duration-300 w-full rounded-3xl border border-white/10 bg-zinc-900/40 text-base shadow-xl transition-all ease-in-out focus-within:border-zinc-500/40 hover:border-zinc-600/30 backdrop-blur-md"
      >
        {/* Textarea container */}
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit(e)
              }
            }}
            placeholder={defaultPlaceholder}
            disabled={disabled || isStreaming}
            className="textarea-seamless flex w-full rounded-md px-3 py-3 ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none text-base leading-snug placeholder-shown:text-ellipsis placeholder-shown:whitespace-nowrap md:text-base max-h-[200px] bg-transparent focus:bg-transparent flex-1 text-white border-0 border-none"
            style={{ minHeight: '80px', height: '80px' }}
            spellCheck="false"
          />
        </div>

        {/* Action buttons row */}
        <div className="flex gap-2 flex-wrap items-center">
          {suggestions.filter(Boolean).map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onInputChange(suggestion)}
              disabled={isStreaming}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-full text-xs text-zinc-300 hover:text-white transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}

          {/* Right side with send button */}
          <div className="flex flex-grow items-center justify-end gap-2">
            <button
              type="submit"
              disabled={!input.trim() || isStreaming || disabled}
              className={`submit-button-white flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ease-out shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
                isStreaming
                  ? 'bg-zinc-800 scale-95 ring-2 ring-primary-500/20'
                  : 'bg-white hover:bg-zinc-200 hover:shadow-white/20 active:scale-90'
              }`}
            >
              {isStreaming ? (
                <div className="relative w-4 h-4">
                  <div className="absolute inset-0 border-2 border-zinc-600 rounded-full"></div>
                  <div className="absolute inset-0 border-2 border-t-primary-500 rounded-full animate-spin"></div>
                </div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-zinc-900 ml-0.5"
                >
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
