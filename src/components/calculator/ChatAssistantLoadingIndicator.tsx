import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { resolveChatAssistantToolLabelKey } from './ChatAssistantDrawer.model'

interface ChatAssistantLoadingIndicatorProps {
  toolInProgress?: string | null
  hasTranslation: (key: string) => boolean
  t: (key: string) => string
}

export function ChatAssistantLoadingIndicator({
  toolInProgress,
  hasTranslation,
  t,
}: ChatAssistantLoadingIndicatorProps) {
  const labelKey = resolveChatAssistantToolLabelKey({ hasTranslation, toolInProgress })

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 px-1 py-2 text-foreground/55"
    >
      {labelKey !== 'typing' ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">{t(labelKey)}</span>
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
          <span className="text-xs">{t(labelKey)}</span>
        </>
      )}
    </motion.div>
  )
}
