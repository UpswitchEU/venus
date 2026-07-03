'use client'

import { X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import React, { useEffect, useId, useRef, useState } from 'react'
import { navigateToMercuryFromManualHandoff } from '@/features/manual/utils/manualMercuryNavigate'
import { navigateToSafeMercuryNavigationUrl } from '@/lib/return-url'
import { generalLogger } from '@/utils/logger'
import { useAuth } from '../lib/auth'
import { clearDelegatedClientContext } from '../lib/auth/persistedClientContext'
import { useClientContext } from '../stores/clientContext'

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
      clearDelegatedClientContext(() => clearClientContext())
      const validLocale = locale && ['en', 'nl', 'fr'].includes(locale) ? locale : 'en'
      navigateToMercuryFromManualHandoff({
        currentLocale: validLocale,
        clientContextId: relationshipId ?? client?.id,
        hasCompletedValuation: false,
      })
    } catch (error) {
      generalLogger.error('[ClientContextBanner] Error in handleExitClientView', {
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        const loc =
          locale && (locale === 'en' || locale === 'nl' || locale === 'fr') ? locale : 'en'
        navigateToSafeMercuryNavigationUrl(`/${loc}/advisor/dashboard`)
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
