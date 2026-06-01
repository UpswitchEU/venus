'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AuroraButton as Button } from '@/design-system/components/Button'
import type { NormalizationStatus } from './UnifiedNormalizationTypes'

interface UnifiedNormalizationBulkActionsBarProps {
  selectedCount: number
  bulkAcceptBlockedCount?: number
  onDeselectAll: () => void
  onBulkUpdateStatus: (status: NormalizationStatus) => void
  onBulkDelete: () => void
}

export function UnifiedNormalizationBulkActionsBar({
  selectedCount,
  bulkAcceptBlockedCount = 0,
  onDeselectAll,
  onBulkUpdateStatus,
  onBulkDelete,
}: UnifiedNormalizationBulkActionsBarProps) {
  const nh = useTranslations('normalizationHub')
  const ca = useTranslations('chatAssistant')
  const tCommon = useTranslations('common.actions')
  const bulkAcceptBlocked = bulkAcceptBlockedCount > 0
  const bulkAcceptBlockedText = bulkAcceptBlocked
    ? nh(
        bulkAcceptBlockedCount === 1
          ? 'bulkAcceptImportedBlocked'
          : 'bulkAcceptImportedBlockedPlural',
        { count: bulkAcceptBlockedCount }
      )
    : undefined

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="px-6 pb-3 shrink-0"
        >
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground/70">
                  {nh('bulkSelected', { count: selectedCount })}
                </span>
                <button
                  onClick={onDeselectAll}
                  className="text-xs text-foreground/50 hover:text-foreground/70 underline"
                >
                  {nh('bulkDeselect')}
                </button>
              </div>
              {bulkAcceptBlockedText ? (
                <span className="text-xs text-warning">{bulkAcceptBlockedText}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onBulkUpdateStatus('rejected')}
                className="text-xs h-8 px-3 text-secondary hover:text-secondary hover:bg-secondary/10"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                {ca('reject')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onBulkUpdateStatus('accepted')}
                disabled={bulkAcceptBlocked}
                title={bulkAcceptBlockedText}
                className="text-xs h-8 px-3 text-success hover:text-success hover:bg-success/10"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                {ca('accept')}
              </Button>
              <div className="w-px h-6 bg-foreground/10" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onBulkDelete}
                className="text-xs h-8 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {tCommon('remove')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
