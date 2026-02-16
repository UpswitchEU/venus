/**
 * Save Status Indicator Component
 *
 * Single Responsibility: Display real-time save status for user trust
 * Critical for M&A workflow - financial data requires explicit save confirmation
 *
 * States:
 * - Saving: Data being synced to backend
 * - Saved: Successfully saved with timestamp
 * - Unsaved: Local changes not yet persisted
 * - Error: Save failed
 *
 * @module components/SaveStatusIndicator
 */

'use client'

import { AlertCircle, Check, Loader2, Save } from 'lucide-react'
import React, { useEffect, useState } from 'react'

export interface SaveStatusIndicatorProps {
  /** Whether save is in progress */
  isSaving: boolean
  /** Last successful save timestamp */
  lastSaved: Date | null
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean
  /** Save error message if failed */
  error: string | null
  /** Show compact version (icon only) */
  compact?: boolean
}

/**
 * Calculates relative time string (e.g., "2m ago", "just now")
 */
function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`

  // More than 24 hours - show date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Save Status Indicator
 *
 * Provides visual feedback for auto-save state.
 * Builds user trust for financial data persistence.
 *
 * @example
 * ```tsx
 * <SaveStatusIndicator
 *   isSaving={store.isSaving}
 *   lastSaved={store.lastSaved}
 *   hasUnsavedChanges={store.hasUnsavedChanges}
 *   error={store.syncError}
 * />
 * ```
 */
export function SaveStatusIndicator({
  isSaving,
  lastSaved,
  hasUnsavedChanges,
  error,
  compact = false,
}: SaveStatusIndicatorProps) {
  const [relativeTime, setRelativeTime] = useState<string>('')

  // Update relative time every 10 seconds
  useEffect(() => {
    if (!lastSaved) {
      setRelativeTime('')
      return
    }

    const updateTime = () => {
      setRelativeTime(getRelativeTime(lastSaved))
    }

    updateTime()
    const interval = setInterval(updateTime, 10000) // Update every 10s

    return () => clearInterval(interval)
  }, [lastSaved])

  // Determine state
  let icon: React.ReactNode
  let text: string
  let colorClasses: string

  if (error) {
    // Error state
    icon = <AlertCircle className="w-4 h-4" />
    text = compact ? '' : 'Save failed'
    colorClasses = 'text-accent-600 bg-accent-50 border-accent-200'
  } else if (isSaving) {
    // Saving state
    icon = <Loader2 className="w-4 h-4 animate-spin" />
    text = compact ? '' : 'Saving...'
    colorClasses = 'text-primary bg-primary/10 border-primary/20'
  } else if (hasUnsavedChanges) {
    // Unsaved changes state
    icon = <Save className="w-4 h-4" />
    text = compact ? '' : 'Unsaved changes'
    colorClasses = 'text-harvest-600 bg-harvest-50 border-harvest-200'
  } else if (lastSaved) {
    // Saved state
    icon = <Check className="w-4 h-4" />
    text = compact ? '' : `Saved ${relativeTime}`
    colorClasses = 'text-primary bg-primary/10 border-primary/20'
  } else {
    // Initial state (no changes yet)
    return null
  }

  if (compact) {
    return (
      <div
        className={`
          flex items-center justify-center w-8 h-8 rounded-lg border
          transition-all duration-200
          ${colorClasses}
        `}
        title={
          error ||
          (isSaving ? 'Saving...' : hasUnsavedChanges ? 'Unsaved changes' : `Saved ${relativeTime}`)
        }
      >
        {icon}
      </div>
    )
  }

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border
        text-sm font-medium transition-all duration-200
        ${colorClasses}
      `}
      role="status"
      aria-live="polite"
    >
      {icon}
      <span>{text}</span>
      {error && (
        <button
          onClick={() => {
            // Retry save (trigger via parent component)
            window.location.reload()
          }}
          className="ml-2 text-xs underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Floating Save Status Indicator
 *
 * Fixed position indicator for continuous feedback.
 * Used in forms and edit views.
 *
 * @example
 * ```tsx
 * <FloatingSaveStatus
 *   isSaving={store.isSaving}
 *   lastSaved={store.lastSaved}
 *   hasUnsavedChanges={store.hasUnsavedChanges}
 *   error={store.syncError}
 * />
 * ```
 */
export function FloatingSaveStatus(props: SaveStatusIndicatorProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <SaveStatusIndicator {...props} />
    </div>
  )
}
