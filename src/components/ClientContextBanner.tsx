'use client'

import { X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import React, { useEffect, useState } from 'react'
import { useClientContext } from '../stores/clientContext'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'

/**
 * Client Context Banner
 *
 * Displays when an accountant is acting on behalf of a client.
 * Shows client's name and avatar, with option to exit client view.
 */
export function ClientContextBanner() {
  const [mounted, setMounted] = useState(false)
  const { isActingAsClient, client, clearClientContext } = useClientContext()
  const { isEmbedded, closeEmbedded } = useEmbeddedMode()
  const locale = useLocale()
  const t = useTranslations() // ✅ Venus pattern: NO namespace

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !isActingAsClient || !client) return null

  const handleExitClientView = () => {
    try {
      // Clear client context first
      clearClientContext()
      
      // If embedded in Mercury modal, close the modal (sends message to parent)
      if (isEmbedded) {
        console.log('[ClientContextBanner] Embedded mode detected, closing modal')
        closeEmbedded()
        return
      }

      // If not embedded, navigate back to accountant dashboard in Mercury
      if (typeof window === 'undefined') {
        console.warn('[ClientContextBanner] window is undefined, cannot navigate')
        return
      }

      // Check for return URL first (set when Venus is opened from Mercury)
      let returnUrl: string | null = null
      try {
        returnUrl = sessionStorage.getItem('upswitch_return_url')
      } catch (error) {
        // sessionStorage might not be available (e.g., private browsing)
        console.warn('[ClientContextBanner] Failed to read sessionStorage:', error)
      }

      if (returnUrl) {
        // Validate return URL before navigating
        try {
          const url = new URL(returnUrl, window.location.origin)
          console.log('[ClientContextBanner] Navigating to return URL:', returnUrl)
          window.location.href = returnUrl
          return
        } catch (error) {
          console.warn('[ClientContextBanner] Invalid return URL, falling back to dashboard:', returnUrl)
          // Fall through to dashboard URL construction
        }
      }

      // If no return URL, construct accountant dashboard URL
      // Mercury URL: https://upswitch.app/[locale]/accountant/dashboard
      const mercuryUrl = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'https://upswitch.app'
      
      // Validate locale (fallback to 'en' if invalid)
      const validLocale = locale && (locale === 'en' || locale === 'nl') ? locale : 'en'
      const dashboardUrl = `${mercuryUrl}/${validLocale}/accountant/dashboard`
      
      console.log('[ClientContextBanner] Navigating to accountant dashboard:', dashboardUrl)
      window.location.href = dashboardUrl
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

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
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
