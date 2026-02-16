/**
 * Session Inspector
 *
 * Developer tool for inspecting session store state in real-time.
 * Only visible in development mode.
 *
 * Shows:
 * - Session data (reportId, currentView, sessionData)
 * - Loading state
 * - Error state
 * - Save status
 *
 * @module components/debug/AssetInspector
 */

'use client'

import { useState } from 'react'
import { useSessionStore } from '../../store/useSessionStore'

export function AssetInspector() {
  const [isOpen, setIsOpen] = useState(false)

  // Get unified session store
  const { session, isLoading, error, isSaving, lastSaved, hasUnsavedChanges } = useSessionStore()

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-xl hover:bg-gray-800 transition-colors z-50 text-sm font-medium"
      >
        🔍 Session Inspector
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-2xl rounded-lg w-96 max-h-[600px] overflow-hidden z-50 border border-gray-200">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-sm">🔍 Session Inspector</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Session state */}
      <div className="p-4 space-y-3 overflow-y-auto max-h-[520px]">
        {/* Status */}
        <div className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="font-medium text-sm text-gray-900 mb-2">Status</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Loading:</span>
              <span className={isLoading ? 'text-blue-600 font-medium' : 'text-gray-500'}>
                {isLoading ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Saving:</span>
              <span className={isSaving ? 'text-blue-600 font-medium' : 'text-gray-500'}>
                {isSaving ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Has Changes:</span>
              <span className={hasUnsavedChanges ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                {hasUnsavedChanges ? 'Yes' : 'No'}
              </span>
            </div>
            {lastSaved && (
              <div className="flex justify-between">
                <span className="text-gray-600">Last Saved:</span>
                <span className="text-gray-900">{lastSaved.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Session Data */}
        {session && (
          <div className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="font-medium text-sm text-gray-900 mb-2">Session</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Report ID:</span>
                <span className="text-gray-900 font-mono">{session.reportId?.slice(-8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">View:</span>
                <span className="text-gray-900">{session.currentView}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Session Data:</span>
                <span className={session.sessionData ? 'text-green-600' : 'text-gray-400'}>
                  {session.sessionData ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">HTML Report:</span>
                <span className={session.htmlReport ? 'text-green-600' : 'text-gray-400'}>
                  {session.htmlReport ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Info Tab:</span>
                <span className={session.infoTabHtml ? 'text-green-600' : 'text-gray-400'}>
                  {session.infoTabHtml ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Result:</span>
                <span className={session.valuationResult ? 'text-green-600' : 'text-gray-400'}>
                  {session.valuationResult ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border border-destructive/20 rounded-lg p-3 bg-destructive/10">
            <div className="font-medium text-sm text-foreground mb-2">Error</div>
            <div className="text-xs text-muted-foreground">{error}</div>
          </div>
        )}

        {!session && !isLoading && (
          <div className="text-center text-gray-500 text-sm py-4">No session loaded</div>
        )}
      </div>
    </div>
  )
}
