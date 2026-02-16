/**
 * Background Sync Status Indicator Component
 *
 * Single Responsibility: Display background sync status for optimistic sessions
 * Shows when NEW reports are syncing to backend in the background
 *
 * States:
 * - idle: No background sync (or sync completed)
 * - syncing: Currently syncing to backend
 * - synced: Successfully synced
 * - failed: Sync failed (but session still works locally)
 *
 * @module components/BackgroundSyncIndicator
 */

'use client'

import { Check, Loader2, Wifi, WifiOff } from 'lucide-react'
import React from 'react'

export interface BackgroundSyncIndicatorProps {
  /** Current sync status */
  status: 'idle' | 'syncing' | 'synced' | 'failed'
  /** Show compact version (icon only) */
  compact?: boolean
  /** Custom className */
  className?: string
}

/**
 * Background Sync Status Indicator
 *
 * Provides visual feedback for background sync of optimistic sessions.
 * Only visible when status is not 'idle'.
 *
 * @example
 * ```tsx
 * <BackgroundSyncIndicator
 *   status={store.backgroundSyncStatus}
 *   compact={true}
 * />
 * ```
 */
export function BackgroundSyncIndicator({
  status,
  compact = false,
  className = '',
}: BackgroundSyncIndicatorProps) {
  // Don't show anything if idle
  if (status === 'idle') {
    return null
  }

  let icon: React.ReactNode
  let text: string
  let colorClasses: string

  switch (status) {
    case 'syncing':
      icon = <Loader2 className="w-3 h-3 animate-spin" />
      text = compact ? '' : 'Syncing...'
      colorClasses = 'text-primary'
      break
    case 'synced':
      icon = <Check className="w-3 h-3" />
      text = compact ? '' : 'Synced'
      colorClasses = 'text-primary'
      break
    case 'failed':
      icon = <WifiOff className="w-3 h-3" />
      text = compact ? '' : 'Sync failed'
      colorClasses = 'text-accent-500'
      break
    default:
      return null
  }

  if (compact) {
    return (
      <div
        className={`inline-flex items-center justify-center ${colorClasses} ${className}`}
        title={text || status}
      >
        {icon}
      </div>
    )
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${colorClasses} bg-muted/50 border border-foreground/10 ${className}`}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}
