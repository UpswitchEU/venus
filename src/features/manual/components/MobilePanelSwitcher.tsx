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
  panelIdPrefix: string
  /** Human readable label for the output panel */
  outputLabel: string
  /** Set when the shown valuation no longer matches the form; marks the output tab. */
  outputStaleLabel?: string
}

/**
 * Mobile Panel Switcher Component
 *
 * Provides mobile-friendly panel switching buttons.
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders
 */
export const MobilePanelSwitcher: React.FC<MobilePanelSwitcherProps> = React.memo(
  ({ activePanel, inputLabel, onPanelChange, outputLabel, outputStaleLabel, panelIdPrefix }) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      let nextPanel: 'form' | 'preview'
      if (event.key === 'Home') nextPanel = 'form'
      else if (event.key === 'End') nextPanel = 'preview'
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        nextPanel = activePanel === 'form' ? 'preview' : 'form'
      else return

      event.preventDefault()
      onPanelChange(nextPanel)
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-panel="${nextPanel}"]`)
        ?.focus()
    }

    return (
      <div
        aria-label={`${inputLabel} / ${outputLabel}`}
        className="m-3 grid grid-cols-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] p-1"
        role="tablist"
      >
        <button
          id={`${panelIdPrefix}-form-tab`}
          aria-controls={`${panelIdPrefix}-form-panel`}
          aria-selected={activePanel === 'form'}
          tabIndex={activePanel === 'form' ? 0 : -1}
          data-panel="form"
          type="button"
          role="tab"
          onClick={() => onPanelChange('form')}
          onKeyDown={handleKeyDown}
          className={`min-h-10 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activePanel === 'form'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {inputLabel}
        </button>
        <button
          id={`${panelIdPrefix}-preview-tab`}
          aria-controls={`${panelIdPrefix}-preview-panel`}
          aria-selected={activePanel === 'preview'}
          tabIndex={activePanel === 'preview' ? 0 : -1}
          data-panel="preview"
          type="button"
          role="tab"
          onClick={() => onPanelChange('preview')}
          onKeyDown={handleKeyDown}
          className={`min-h-10 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activePanel === 'preview'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {outputLabel}
          {outputStaleLabel ? (
            <>
              <span
                className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                aria-hidden
              />
              <span className="sr-only"> ({outputStaleLabel})</span>
            </>
          ) : null}
        </button>
      </div>
    )
  }
)

MobilePanelSwitcher.displayName = 'MobilePanelSwitcher'
