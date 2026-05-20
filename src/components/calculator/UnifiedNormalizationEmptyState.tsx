'use client'

import { motion } from 'framer-motion'
import { PenLine } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function UnifiedNormalizationEmptyState() {
  const nh = useTranslations('normalizationHub')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-20 text-center"
    >
      <motion.div
        className="relative w-24 h-24 mx-auto mb-8"
        animate={{ y: [0, -6, 0] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-sm" />
        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/8 to-primary/4" />
        <div className="absolute inset-3 rounded-full bg-background/90 backdrop-blur-sm border border-foreground/[0.08] shadow-sm flex items-center justify-center">
          <PenLine className="w-8 h-8 text-foreground/30" />
        </div>
      </motion.div>

      <p className="text-lg font-medium text-foreground/80 mb-2">{nh('noNormalizationsYet')}</p>
      <p className="text-sm text-foreground/45 max-w-sm mx-auto leading-relaxed">
        {nh('useSearchOrQuickAdd')}
      </p>
    </motion.div>
  )
}
