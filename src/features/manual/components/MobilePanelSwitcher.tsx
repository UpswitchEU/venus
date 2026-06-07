/**
 * Mobile Panel Switcher Component
 *
 * Single Responsibility: Mobile panel switching UI for manual layout.
 *
 * @module features/manual/components/MobilePanelSwitcher
 */

import { useTranslations } from 'next-intl'
import React from 'react'

/**
 * Mobile Panel Switcher Props
 */
interface MobilePanelSwitcherProps {
  /** Currently active panel */
  activePanel: 'form' | 'preview'
  /** Callback when panel changes */
  onPanelChange: (panel: 'form' | 'preview') => void
}

/**
 * Mobile Panel Switcher Component
 *
 * Provides mobile-friendly panel switching buttons.
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders
 */
export const MobilePanelSwitcher: React.FC<MobilePanelSwitcherProps> = React.memo(
  ({ activePanel, onPanelChange }) => {
    const t = useTranslations('navigation.tabs')
    return (
      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 transform -translate-x-1/2 flex gap-2 bg-muted p-1 rounded-full shadow-lg z-50">
        <button
          onClick={() => onPanelChange('form')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activePanel === 'form'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('form')}
        </button>
        <button
          onClick={() => onPanelChange('preview')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activePanel === 'preview'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('preview')}
        </button>
      </div>
    )
  }
)

MobilePanelSwitcher.displayName = 'MobilePanelSwitcher'
