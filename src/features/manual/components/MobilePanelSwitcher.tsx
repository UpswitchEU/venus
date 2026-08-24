/**
 * Mobile Panel Switcher Component
 *
 * Single Responsibility: Mobile panel switching UI for manual layout.
 *
 * @module features/manual/components/MobilePanelSwitcher
 */

import React from 'react'

/**
 * Mobile Panel Switcher Props
 */
interface MobilePanelSwitcherProps {
  /** Currently active panel */
  activePanel: 'form' | 'preview'
  /** Human readable label for the input panel */
  inputLabel: string
  /** Callback when panel changes */
  onPanelChange: (panel: 'form' | 'preview') => void
  /** Human readable label for the output panel */
  outputLabel: string
}

/**
 * Mobile Panel Switcher Component
 *
 * Provides mobile-friendly panel switching buttons.
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders
 */
export const MobilePanelSwitcher: React.FC<MobilePanelSwitcherProps> = React.memo(
  ({ activePanel, inputLabel, onPanelChange, outputLabel }) => {
    return (
      <div
        aria-label={`${inputLabel} and ${outputLabel}`}
        className="m-3 grid grid-cols-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] p-1"
        role="tablist"
      >
        <button
          aria-selected={activePanel === 'form'}
          type="button"
          role="tab"
          onClick={() => onPanelChange('form')}
          className={`min-h-10 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activePanel === 'form'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {inputLabel}
        </button>
        <button
          aria-selected={activePanel === 'preview'}
          type="button"
          role="tab"
          onClick={() => onPanelChange('preview')}
          className={`min-h-10 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activePanel === 'preview'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {outputLabel}
        </button>
      </div>
    )
  }
)

MobilePanelSwitcher.displayName = 'MobilePanelSwitcher'
