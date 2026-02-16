import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import React from 'react'

interface TypingIndicatorProps {
  context?: string
  isThinking?: boolean
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = () => {
  // Always show "AI is thinking..." for both states
  const message = 'AI is thinking...'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-[80%] mr-auto"
    >
      <div className="flex items-start gap-3">
        {/* Bot Icon */}
        <div className="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/10 shadow-sm">
          <Bot className="w-4 h-4 text-primary-400" />
        </div>

        {/* AI Thinking Bubble - Always show animated dots */}
        <div className="rounded-2xl rounded-tl-sm px-5 py-3.5 bg-white/5 text-white border border-white/10 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Always show animated dots for both thinking and typing */}
            <div className="flex gap-1.5 h-2 items-center">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 bg-primary-400/80 rounded-full"
                  animate={{
                    y: ['0%', '-40%', '0%'],
                    opacity: [0.4, 1, 0.4],
                    scale: [0.9, 1.1, 0.9],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.12,
                  }}
                />
              ))}
            </div>

            {/* Always show "AI is thinking..." */}
            <span className="text-[13px] font-medium text-muted-foreground tracking-wide">{message}</span>
          </div>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-xs text-muted-foreground mt-1 text-left ml-11">
        {new Date().toLocaleTimeString()}
      </div>
    </motion.div>
  )
}
