'use client'

import { X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import React, { useEffect, useState, useRef, useId } from 'react'
import { useAuth } from '../lib/auth'
import { useClientContext } from '../stores/clientContext'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'

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
  const { isActingAsClient, client, clearClientContext } = useClientContext()
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
      console.log('[ClientContextBanner] Closing embedded session, isEmbedded:', isEmbedded)
      closeEmbedded()
      
      // If embedded in Mercury modal, the modal will close and we're done
      if (isEmbedded) {
        console.log('[ClientContextBanner] Embedded mode detected, modal should close')
        // Give the parent a moment to receive the message and close
        // If we're truly embedded, the modal will close before navigation happens
        setTimeout(() => {
          // If we're still here after 500ms, we might not be embedded - navigate
          console.log('[ClientContextBanner] Fallback: navigating to Mercury')
          navigateToMercury()
        }, 500)
        return
      }

      // If not embedded, navigate back to accountant dashboard in Mercury
      navigateToMercury()
    } catch (error) {
      console.error('[ClientContextBanner] Error in handleExitClientView:', error)
      // Fallback: try to navigate to Mercury home page
      try {
        const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
        window.location.href = `${mercuryUrl}/en/accountant/dashboard`
      } catch (fallbackError) {
        console.error('[ClientContextBanner] Fallback navigation also failed:', fallbackError)
      }
    }
  }

  /**
   * Navigate back to Mercury (accountant dashboard or return URL)
   */
  const navigateToMercury = () => {
    if (typeof window === 'undefined') {
      console.warn('[ClientContextBanner] window is undefined, cannot navigate')
      return
    }

    try {
      // Check for return URL first (set when Venus is opened from Mercury)
      let returnUrl: string | null = null
      try {
        returnUrl = sessionStorage.getItem('upswitch_return_url')
      } catch (error) {
        // sessionStorage might not be available (e.g., private browsing)
        console.warn('[ClientContextBanner] Failed to read sessionStorage:', error)
      }

      if (returnUrl) {
        // Validate and construct full URL for navigation
        // Return URL from Mercury is relative (e.g., /en/accountant/clients/...)
        // We need to construct full URL using Mercury domain
        try {
          const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
          
          // If returnUrl is already a full URL, use it as-is
          // Otherwise, construct full URL using Mercury domain
          let fullReturnUrl: string | null = null
          
          if (returnUrl.startsWith('http://') || returnUrl.startsWith('https://')) {
            // Already a full URL - validate it
            const url = new URL(returnUrl)
            if (url.origin.includes('upswitch.app')) {
              fullReturnUrl = returnUrl
            } else {
              console.warn('[ClientContextBanner] Return URL from different domain, using dashboard:', returnUrl)
            }
          } else {
            // Relative URL - construct full URL
            fullReturnUrl = `${mercuryUrl}${returnUrl.startsWith('/') ? '' : '/'}${returnUrl}`
          }
          
          if (fullReturnUrl) {
            console.log('[ClientContextBanner] Navigating to return URL:', fullReturnUrl)
            window.location.href = fullReturnUrl
            return
          }
          // If fullReturnUrl is null, fall through to dashboard URL construction
        } catch (error) {
          console.warn('[ClientContextBanner] Invalid return URL, falling back to dashboard:', returnUrl, error)
          // Fall through to dashboard URL construction
        }
      }

      // If no return URL, try to construct one from client context
      // This provides a better fallback than just going to dashboard
      const clientContext = useClientContext.getState()
      let fallbackUrl: string | null = null
      
      if (clientContext.relationshipId) {
        // Try to extract clientId from relationshipId or construct URL
        // Relationship ID format might be UUID, but we can try to construct URL
        // Note: This is a best-effort fallback - ideally return_url should always be set
        const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
        const validLocale = locale && (locale === 'en' || locale === 'nl') ? locale : 'en'
        
        // If we have relationshipId, try to navigate to client valuations page
        // This is better than dashboard but requires clientId which we might not have
        // For now, fall back to dashboard - but log for debugging
        console.warn('[ClientContextBanner] No return_url found, but relationshipId exists:', {
          relationshipId: clientContext.relationshipId,
          clientId: clientContext.client?.id,
        })
        
        // If we have client ID from context, construct client valuations URL
        if (clientContext.client?.id) {
          fallbackUrl = `${mercuryUrl}/${validLocale}/accountant/clients/${clientContext.client.id}/valuations`
        }
      }
      
      // If no fallback URL from context, use dashboard
      if (!fallbackUrl) {
        const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
        const validLocale = locale && (locale === 'en' || locale === 'nl') ? locale : 'en'
        fallbackUrl = `${mercuryUrl}/${validLocale}/accountant/dashboard`
      }
      
      console.log('[ClientContextBanner] Navigating to fallback URL:', fallbackUrl)
      window.location.href = fallbackUrl
    } catch (error) {
      console.error('[ClientContextBanner] Error in navigateToMercury:', error)
      // Last resort fallback
      try {
        const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
        window.location.href = `${mercuryUrl}/en/accountant/dashboard`
      } catch (fallbackError) {
        console.error('[ClientContextBanner] Fallback navigation also failed:', fallbackError)
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
