'use client'

/**
 * Context Bar
 *
 * Shows current context when in accountant mode:
 * Firm branding, Client, Business, Draft status, Client approval status
 */

import { motion } from 'framer-motion'
import { Building2, Check, ChevronRight, Clock, Send, User, UserCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { springDefault } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'

export type ClientApprovalStatus = 'none' | 'pending' | 'approved' | 'changes_requested'

export interface ContextBarProps {
  clientName?: string
  businessName?: string
  draftStatus?: 'draft' | 'saved' | 'saving'
  lastSaved?: Date
  onClientClick?: () => void
  onBusinessClick?: () => void
  firmName?: string
  firmLogoUrl?: string
  clientApprovalStatus?: ClientApprovalStatus
  onResendApproval?: () => void
  pendingNormalisations?: number
  onShowNormalisationReview?: () => void
}

export function ContextBar({
  clientName,
  businessName,
  draftStatus = 'draft',
  lastSaved,
  onClientClick,
  onBusinessClick,
  firmName,
  firmLogoUrl,
  clientApprovalStatus = 'none',
  onResendApproval,
  pendingNormalisations = 0,
  onShowNormalisationReview,
}: ContextBarProps) {
  const t = useTranslations('calculator.contextBar')
  const locale = useLocale() as 'nl' | 'en'
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  if (!clientName && !businessName) return null

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(currencyLocale, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springDefault}
      className={cn(
        'flex items-center justify-between px-4 py-2',
        'bg-foreground/[0.02] border-b border-foreground/[0.06]'
      )}
    >
      {/* Left: Firm Branding + Context Path */}
      <div className="flex items-center gap-3 text-sm">
        {(firmName || firmLogoUrl) && (
          <>
            <div className="flex items-center gap-2">
              {firmLogoUrl && (
                <img
                  src={firmLogoUrl}
                  alt={firmName || 'Firm'}
                  className="h-5 w-auto object-contain"
                />
              )}
              {firmName && !firmLogoUrl && (
                <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                  {firmName}
                </span>
              )}
            </div>
            <div className="h-4 w-px bg-foreground/[0.1]" />
          </>
        )}

        {clientName && (
          <button
            onClick={onClientClick}
            className="flex items-center gap-1.5 text-foreground/60 hover:text-foreground transition-colors"
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[260px]">{clientName}</span>
          </button>
        )}

        {clientName && businessName && <ChevronRight className="w-3.5 h-3.5 text-foreground/30" />}

        {businessName && (
          <button
            onClick={onBusinessClick}
            className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors font-medium"
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[260px]">{businessName}</span>
          </button>
        )}
      </div>

      {/* Right: Status Indicators */}
      <div className="flex items-center gap-3">
        {pendingNormalisations > 0 && onShowNormalisationReview && (
          <button
            onClick={onShowNormalisationReview}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-primary/10 text-primary border border-primary/20',
              'hover:bg-primary/15 transition-colors'
            )}
          >
            <span>{t('pendingToReview', { count: pendingNormalisations })}</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}

        {pendingNormalisations > 0 &&
          onShowNormalisationReview &&
          clientApprovalStatus !== 'none' && <div className="h-4 w-px bg-foreground/[0.08]" />}

        {clientApprovalStatus !== 'none' && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
              clientApprovalStatus === 'pending'
                ? 'bg-foreground/[0.04] text-foreground/60 border-foreground/[0.08]'
                : clientApprovalStatus === 'approved'
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-secondary/10 text-secondary border-secondary/20'
            )}
          >
            {clientApprovalStatus === 'pending' ? (
              <>
                <Clock className="w-3 h-3" />
                <span>{t('awaitingClient')}</span>
                {onResendApproval && (
                  <button
                    onClick={onResendApproval}
                    className="ml-1 p-0.5 rounded hover:bg-foreground/[0.06] transition-colors"
                    title={t('sendReminder')}
                  >
                    <Send className="w-3 h-3" />
                  </button>
                )}
              </>
            ) : clientApprovalStatus === 'approved' ? (
              <>
                <UserCheck className="w-3 h-3" />
                <span>{t('clientApproved')}</span>
              </>
            ) : (
              <>
                <User className="w-3 h-3" />
                <span>{t('changesRequested')}</span>
              </>
            )}
          </div>
        )}

        {clientApprovalStatus !== 'none' && <div className="h-4 w-px bg-foreground/[0.08]" />}

        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs',
            draftStatus === 'saved'
              ? 'bg-success/10 text-success'
              : draftStatus === 'saving'
                ? 'bg-foreground/[0.06] text-foreground/50'
                : 'bg-foreground/[0.04] text-foreground/40'
          )}
        >
          {draftStatus === 'saved' ? (
            <>
              <Check className="w-3 h-3" />
              {t('saved')}
            </>
          ) : draftStatus === 'saving' ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Clock className="w-3 h-3" />
              </motion.div>
              {t('saving')}
            </>
          ) : (
            <>
              <Clock className="w-3 h-3" />
              {t('draft')}
            </>
          )}
        </div>

        {lastSaved && draftStatus === 'saved' && (
          <span className="text-xs text-foreground/40">{formatTime(lastSaved)}</span>
        )}
      </div>
    </motion.div>
  )
}
