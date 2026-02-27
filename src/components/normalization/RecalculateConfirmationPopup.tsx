/**
 * Recalculate Confirmation Popup
 *
 * Confirms creation of new valuation version when:
 * - User has normalized EBITDA values
 * - User has made changes to form data on an existing valuation
 */

import React from 'react'

interface RecalculateConfirmationPopupProps {
  isOpen: boolean
  currentVersion: number
  onConfirm: () => void
  onCancel: () => void
  isCreating: boolean
  /** Whether form data has changed (not just normalizations) */
  hasFormChanges?: boolean
  /** Whether normalizations have been added */
  hasNormalizations?: boolean
}

export const RecalculateConfirmationPopup: React.FC<RecalculateConfirmationPopupProps> = ({
  isOpen,
  currentVersion,
  onConfirm,
  onCancel,
  isCreating,
  hasFormChanges = false,
  hasNormalizations = true, // Default to true for backward compatibility
}) => {
  if (!isOpen) return null

  const nextVersion = currentVersion + 1

  // Determine the description based on what changed
  const getDescription = () => {
    if (hasFormChanges && hasNormalizations) {
      return (
        <>
          You've made changes to your business data and EBITDA normalizations. This will create
          valuation version <strong>v{nextVersion}</strong> with your updated data.
        </>
      )
    }
    if (hasFormChanges) {
      return (
        <>
          You've made changes to your business data. This will create valuation version{' '}
          <strong>v{nextVersion}</strong> with your updated inputs.
        </>
      )
    }
    return (
      <>
        You've normalized EBITDA values. This will create valuation version{' '}
        <strong>v{nextVersion}</strong> with the normalized EBITDA.
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={isCreating ? undefined : onCancel}
      />

      {/* Popup */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-card rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/20 p-3">
              <svg
                className="h-8 w-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
          </div>

          {/* Content */}
          <h3 className="text-xl font-semibold text-foreground mb-2 text-center">
            Create New Valuation Version?
          </h3>

          <p className="text-muted-foreground mb-4 text-center">{getDescription()}</p>

          {/* Info Box */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold text-foreground mb-2">What happens:</p>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start">
                <svg
                  className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Version <strong>v{nextVersion}</strong> will be created with all your changes
                </span>
              </li>
              <li className="flex items-start">
                <svg
                  className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  {hasNormalizations && hasFormChanges
                    ? 'Updated data and normalized EBITDA will be used'
                    : hasNormalizations
                      ? 'Normalized EBITDA will be used in calculations'
                      : 'Updated business data will be used in calculations'}
                </span>
              </li>
              <li className="flex items-start">
                <svg
                  className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Previous version <strong>v{currentVersion}</strong> remains unchanged
                </span>
              </li>
              <li className="flex items-start">
                <svg
                  className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>You can compare versions side-by-side in version history</span>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isCreating}
              className="flex-1 px-4 py-2 text-muted-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isCreating}
              className="flex-1 px-4 py-2 text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:bg-primary/50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating v{nextVersion}...
                </span>
              ) : (
                `Create Version v${nextVersion}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
