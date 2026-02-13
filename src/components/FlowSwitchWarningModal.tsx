import { AlertTriangle } from 'lucide-react'
import React from 'react'
import { createPortal } from 'react-dom'

interface FlowSwitchWarningModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  targetFlow: 'manual' | 'conversational'
  currentFlow?: 'manual' | 'conversational'
}

/**
 * FlowSwitchWarningModal Component
 *
 * Confirms switching between manual and conversational flows.
 * Data is preserved between flows - both flows share the same session data.
 */
export const FlowSwitchWarningModal: React.FC<FlowSwitchWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetFlow,
  currentFlow,
}) => {
  if (!isOpen) {
    // Avoid keeping the fullscreen overlay mounted when closed; this was
    // causing a subtle page-wide flicker on some GPUs when combined with
    // backdrop blur.
    return null
  }

  const flowNames = {
    manual: 'Manual Entry',
    conversational: 'Conversational',
  }

  const flowName = targetFlow === 'conversational' ? 'Conversational' : 'Manual'
  const currentFlowName = currentFlow ? flowNames[currentFlow] : null

  const modal = (
    <div className="fixed inset-0 z-50">
      {/* Backdrop without blur to avoid GPU repaints on every interaction */}
      <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden="false" />

      {/* Modal */}
      <div
        className="absolute inset-0 flex items-center justify-center p-4"
        aria-hidden="false"
        aria-modal="true"
        role="dialog"
      >
        <div
          className="bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-700 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-700">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-primary-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">Switch to {flowName} Flow?</h2>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-3">
            <p className="text-zinc-300 leading-relaxed">
              {currentFlowName ? (
                <>
                  Switch from <span className="font-semibold text-white">{currentFlowName}</span> to{' '}
                  <span className="font-semibold text-white">{flowNames[targetFlow]}</span>?
                </>
              ) : (
                <>Switch to the {flowName.toLowerCase()} flow?</>
              )}
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Your entered data will be preserved. You can switch between flows at any time without
              losing your progress.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-zinc-900/50 rounded-b-2xl flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-medium bg-accent-600 hover:bg-accent-500 text-white rounded-lg transition-colors"
            >
              Switch Flow
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Render via portal so the overlay never reflows the main layout.
  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body)
  }

  return modal
}
