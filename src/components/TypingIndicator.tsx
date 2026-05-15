import { motion } from 'framer-motion'
import React from 'react'

interface TypingIndicatorProps {
  context?: string
  isThinking?: boolean
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = () => {
  const message = 'AI is thinking...'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-[88%] mr-auto flex justify-start"
    >
      {/* No avatar — bubble carries the role. */}
      <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-foreground/[0.03] border border-foreground/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 h-2 items-center">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 bg-primary/60 rounded-full"
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
          <span className="text-[13px] text-foreground/60">{message}</span>
        </div>
      </div>
    </motion.div>
  )
}
