/**
 * BusinessProfileSection Component
 *
 * Single Responsibility: Display business profile summary before/during conversation
 * SOLID Principles: SRP - Only handles business profile display
 *
 * @module features/conversational/components/BusinessProfileSection
 */

import React from 'react'

interface BusinessProfileSectionProps {
  showPreConversationSummary?: boolean
  onTogglePreConversationSummary?: () => void
}

/**
 * BusinessProfileSection Component
 *
 * Displays business profile information if available.
 * Can be expanded/collapsed based on props.
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders
 */
export const BusinessProfileSection: React.FC<BusinessProfileSectionProps> = React.memo(
  ({ showPreConversationSummary = false, onTogglePreConversationSummary }) => {
    // For now, return null - can be expanded later if needed
    // This matches the pattern where it's conditionally rendered
    if (!showPreConversationSummary) {
      return null
    }

    return (
      <div className="mx-4 mb-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Business Profile</h3>
          {onTogglePreConversationSummary && (
            <button
              onClick={onTogglePreConversationSummary}
              className="text-xs text-zinc-400 hover:text-zinc-300"
            >
              Hide
            </button>
          )}
        </div>
        {/* Business profile content can be added here */}
      </div>
    )
  }
)

BusinessProfileSection.displayName = 'BusinessProfileSection'
