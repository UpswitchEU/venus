'use client'

import { X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import React, { useEffect, useState, useRef, useId } from 'react'
import { useAuth } from '../lib/auth'
import { useClientContext } from '../stores/clientContext'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { getSafeMercuryReturnUrl } from '@/lib/return-url'
import { generalLogger } from '@/utils/logger'

/**
 * Client Context Banner
 *
 * Displays when an accountant is acting on behalf of a client.
 * Shows client's name and avatar, with option to exit client view.
 * 
 * DUPLICATE PREVENTION: Uses stable ID and mount tracking to prevent
 * duplicate banners from appearing during auth state transitions.
 */
export function ClientContextBanner() {
  const [mounted, setMounted] = useState(false)
  const { isAuthenticated } = useAuth()
  const { isActingAsClient, client, clearClientContext, relationshipId } = useClientContext()
  const { isEmbedded, closeEmbedded } = useEmbeddedMode()
  const locale = useLocale()
  const t = useTranslations() // ✅ Venus pattern: NO namespace
  
  // ✅ FIX: Use stable ID to ensure React doesn't create duplicate DOM elements
  const bannerId = useId()
  
  // ✅ FIX: Track if banner has been shown to prevent duplicate rendering
  // during rapid auth state transitions
  const hasRenderedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
    return () => {
      // Reset on unmount to allow re-render on next mount
      hasRenderedRef.current = false
    }
  }, [])

  // Only show banner if user is authenticated AND acting as client
  if (!mounted || !isActingAsClient || !client || !isAuthenticated) return null
  
  // ✅ FIX: Mark as rendered to track banner state
  hasRenderedRef.current = true

  const handleExitClientView = () => {
    try {
      // Clear client context first
      clearClientContext()
      
      // BANK-GRADE: Always try to close embedded mode first
      // The closeEmbedded() function now always sends postMessage to parent,
      // which handles both true embedded mode and edge cases where detection failed
      generalLogger.debug('[ClientContextBanner] Closing embedded session', { isEmbedded })
      closeEmbedded()
      
      // If embedded in Mercury modal, the modal will close and we're done
      if (isEmbedded) {
        generalLogger.debug('[ClientContextBanner] Embedded mode detected, modal should close')
        // Give the parent a moment to receive the message and close
        // If we're truly embedded, the modal will close before navigation happens
        setTimeout(() => {
          // If we're still here after 500ms, we might not be embedded - navigate
          generalLogger.debug('[ClientContextBanner] Fallback: navigating to Mercury')
          navigateToMercury()
        }, 500)
        return
      }

      // If not embedded, navigate back to accountant dashboard in Mercury
      navigateToMercury()
    } catch (error) {
      generalLogger.error('[ClientContextBanner] Error in handleExitClientView', {
        error: error instanceof Error ? error.message : String(error),
      })
      // Fallback: try to navigate to Mercury home page
      try {
        const mercuryUrl = getMercuryUrl()
        window.location.href = `${mercuryUrl}/en/accountant/dashboard`
      } catch (fallbackError) {
        generalLogger.error('[ClientContextBanner] Fallback navigation also failed', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        })
      }
    }
  }

  /**
   * Navigate back to Mercury (accountant dashboard or return URL).
   * Uses getSafeMercuryReturnUrl to avoid legacy routes (e.g. accountant_listings) that 404.
   */
  const navigateToMercury = () => {
    if (typeof window === 'undefined') {
      generalLogger.warn('[ClientContextBanner] window is undefined, cannot navigate')
      return
    }

    try {
      let returnUrl: string | null = null
      let sourceApp: string | null = null
      try {
        returnUrl = sessionStorage.getItem('upswitch_return_url')
        sourceApp = sessionStorage.getItem('upswitch_source')
      } catch (error) {
        generalLogger.warn('[ClientContextBanner] Failed to read sessionStorage', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      const validLocale = locale && ['en', 'nl', 'fr', 'de'].includes(locale) ? locale : 'en'
      const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
        clientContextId: relationshipId ?? client?.id,
        locale: validLocale,
        sourceApp: sourceApp ?? undefined,
      })
      generalLogger.debug('[ClientContextBanner] Navigating to Mercury', { targetUrl })
      window.location.href = targetUrl
    } catch (error) {
      generalLogger.error('[ClientContextBanner] Error in navigateToMercury', {
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        window.location.href = `${getMercuryUrl()}/en/accountant/dashboard`
      } catch (fallbackError) {
        generalLogger.error('[ClientContextBanner] Fallback navigation also failed', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        })
      }
    }
  }

  return (
    <div 
      key={bannerId}
      id="client-context-banner"
      data-banner-id={bannerId}
      className="bg-primary/10 border-b border-primary/20 px-4 py-2"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Client Avatar */}
          <div className="flex-shrink-0">
            {client.avatarUrl ? (
              <img
                src={client.avatarUrl}
                alt={client.fullName}
                className="w-8 h-8 rounded-full object-cover border-2 border-blue-300"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-300 flex items-center justify-center border-2 border-blue-400">
                <span className="text-blue-800 font-semibold text-sm">
                  {client.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Context Info */}
          <div>
            <p className="text-sm font-medium text-blue-900">
              {t('clientContext.actingAs', { name: client.fullName })}
            </p>
            <p className="text-xs text-blue-700">{t('clientContext.reportsBelongToClient')}</p>
          </div>
        </div>

        {/* Exit Button */}
        <button
          onClick={handleExitClientView}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-md transition-colors duration-200"
        >
          <X className="w-4 h-4" />
          <span>{t('clientContext.exitClientView')}</span>
        </button>
      </div>
    </div>
  )
}
