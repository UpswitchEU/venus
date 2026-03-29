'use client'

/**
 * Quick Actions Panel
 *
 * Shows top 3 high-impact normalizations with one-click accept.
 * Designed for fast, impact-first workflow following YC startup standards.
 */

import { motion } from 'framer-motion'
import { Check, TrendingUp, X, Zap } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import { getBelgianNumberLocale } from '@/lib/omniPreview'

// Icons for categories
const categoryIcons: Record<string, string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
}

export interface QuickAction {
  id: string
  code: string
  description: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal'
  amount: number
  reason: string
  sourceRef: string
  status: 'pending' | 'accepted' | 'rejected'
  // Impact calculation
  ebitdaImpact?: number
  valuationImpact?: number
  multiple?: number
}

export interface QuickActionsPanelProps {
  actions: QuickAction[]
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onViewAll?: () => void
  multiple?: number
  className?: string
}

export function QuickActionsPanel({
  actions,
  onAccept,
  onReject,
  onViewAll,
  multiple = 5.2,
  className,
}: QuickActionsPanelProps) {
  const ca = useTranslations('chatAssistant')
  const beNumberLocale = getBelgianNumberLocale(useLocale())
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `€${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `€${Math.round(amount / 1000)}K`
    return `€${amount.toLocaleString(beNumberLocale)}`
  }
  // Filter pending actions and sort by impact (amount * multiple)
  const pendingActions = actions
    .filter((a) => a.status === 'pending')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  if (pendingActions.length === 0) {
    return null
  }

  const totalImpact = pendingActions.reduce((sum, a) => sum + a.amount, 0)
  const totalValuationImpact = Math.round(totalImpact * multiple)

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl p-4 bg-gradient-to-br from-primary/5 via-primary/8 to-secondary/5',
        'border border-primary/15',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{ca('quickActionsTitle')}</h3>
            <p className="text-[10px] text-foreground/50">
              {ca('quickActionsSubtitle', { count: pendingActions.length })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-mono font-semibold text-success">
            +{formatCurrency(totalValuationImpact)}
          </p>
          <p className="text-[10px] text-foreground/40">{ca('potentialValue')}</p>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="space-y-2">
        {pendingActions.map((action) => {
          const valuationImpact = Math.round(action.amount * multiple)

          return (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg',
                'bg-background/60 border border-foreground/[0.06]',
                'hover:border-primary/20 transition-colors group'
              )}
            >
              {/* Category Icon */}
              <div className="w-8 h-8 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0 text-base">
                {categoryIcons[action.category] || '📊'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {action.description}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/[0.04] text-foreground/40 font-mono shrink-0">
                    {action.code}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-foreground/50 truncate">{action.reason}</span>
                </div>
              </div>

              {/* Impact & Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Impact */}
                <div className="text-right mr-1">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-success" />
                    <span className="text-sm font-mono font-semibold text-success">
                      +{formatCurrency(action.amount)}
                    </span>
                  </div>
                  <p className="text-[10px] text-foreground/40">
                    +{formatCurrency(valuationImpact)} {ca('valueSuffix')}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onReject(action.id)}
                    className={cn(
                      'w-7 h-7 rounded-md flex items-center justify-center',
                      'text-foreground/30 hover:text-destructive hover:bg-destructive/10',
                      'transition-colors'
                    )}
                    aria-label={ca('reject')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(action.id)}
                    className={cn(
                      'w-7 h-7 rounded-md flex items-center justify-center',
                      'bg-success/15 text-success hover:bg-success/25',
                      'transition-colors'
                    )}
                    aria-label={ca('accept')}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Footer with View All */}
      {onViewAll && actions.filter((a) => a.status === 'pending').length > 3 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.06] flex items-center justify-between">
          <p className="text-xs text-foreground/50">
            {actions.filter((a) => a.status === 'pending').length - 3} {ca('moreToReview')}
          </p>
          <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs">
            {ca('viewAll')}
          </Button>
        </div>
      )}
    </motion.div>
  )
}

export default QuickActionsPanel
