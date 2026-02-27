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
        className="fixed bottom-4 right-4 bg-background text-foreground px-4 py-2 rounded-lg shadow-xl hover:bg-muted transition-colors z-50 text-sm font-medium border border-foreground/10"
      >
        🔍 Session Inspector
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-card shadow-2xl rounded-lg w-96 max-h-[600px] overflow-hidden z-50 border border-foreground/10">
      {/* Header */}
      <div className="bg-background text-foreground px-4 py-3 flex items-center justify-between border-b border-foreground/10">
        <h3 className="font-bold text-sm">🔍 Session Inspector</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Session state */}
      <div className="p-4 space-y-3 overflow-y-auto max-h-[520px]">
        {/* Status */}
        <div className="border border-foreground/10 rounded-lg p-3 bg-muted/30">
          <div className="font-medium text-sm text-foreground mb-2">Status</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loading:</span>
              <span className={isLoading ? 'text-primary font-medium' : 'text-muted-foreground'}>
                {isLoading ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saving:</span>
              <span className={isSaving ? 'text-primary font-medium' : 'text-muted-foreground'}>
                {isSaving ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Has Changes:</span>
              <span
                className={hasUnsavedChanges ? 'text-warning font-medium' : 'text-muted-foreground'}
              >
                {hasUnsavedChanges ? 'Yes' : 'No'}
              </span>
            </div>
            {lastSaved && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Saved:</span>
                <span className="text-foreground">{lastSaved.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Session Data */}
        {session && (
          <div className="border border-foreground/10 rounded-lg p-3 bg-muted/30">
            <div className="font-medium text-sm text-foreground mb-2">Session</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Report ID:</span>
                <span className="text-foreground font-mono">{session.reportId?.slice(-8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">View:</span>
                <span className="text-foreground">{session.currentView}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Session Data:</span>
                <span className={session.sessionData ? 'text-success' : 'text-muted-foreground'}>
                  {session.sessionData ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">HTML Report:</span>
                <span className={session.htmlReport ? 'text-success' : 'text-muted-foreground'}>
                  {session.htmlReport ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Info Tab:</span>
                <span className={session.infoTabHtml ? 'text-success' : 'text-muted-foreground'}>
                  {session.infoTabHtml ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Result:</span>
                <span
                  className={session.valuationResult ? 'text-success' : 'text-muted-foreground'}
                >
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
          <div className="text-center text-muted-foreground text-sm py-4">No session loaded</div>
        )}
      </div>
    </div>
  )
}
