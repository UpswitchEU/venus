/**
 * Mobile Panel Switcher Component
 *
 * Single Responsibility: Mobile panel switching UI for conversational layout.
 *
 * @module features/conversational/components/MobilePanelSwitcher
 */

import React from 'react'

/**
 * Mobile Panel Switcher Props
 */
interface MobilePanelSwitcherProps {
  /** Currently active panel */
  activePanel: 'chat' | 'preview'
  /** Callback when panel changes */
  onPanelChange: (panel: 'chat' | 'preview') => void
}

/**
 * Mobile Panel Switcher Component
 *
 * Provides mobile-friendly panel switching buttons for conversational layout.
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders
 */
export const MobilePanelSwitcher: React.FC<MobilePanelSwitcherProps> = React.memo(
  ({ activePanel, onPanelChange }) => {
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 bg-zinc-800 p-1 rounded-full shadow-lg">
        <button
          onClick={() => onPanelChange('chat')}
          className={`px-4 py-2 rounded-full transition-colors ${
            activePanel === 'chat' ? 'bg-accent-600 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => onPanelChange('preview')}
          className={`px-4 py-2 rounded-full transition-colors ${
            activePanel === 'preview'
              ? 'bg-accent-600 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Preview
        </button>
      </div>
    )
  }
)

MobilePanelSwitcher.displayName = 'MobilePanelSwitcher'
