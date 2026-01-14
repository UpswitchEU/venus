'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !isActingAsClient || !client) return null

  const handleExitClientView = () => {
    // Clear client context first
    clearClientContext()
    
    // If embedded in Mercury modal, close the modal
    if (isEmbedded) {
      closeEmbedded()
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
              {t('actingAs', { name: client.fullName })}
            </p>
            <p className="text-xs text-blue-700">{t('reportsBelongToClient')}</p>
          </div>
        </div>

        {/* Exit Button */}
        <button
          onClick={handleExitClientView}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-md transition-colors duration-200"
        >
          <X className="w-4 h-4" />
          <span>{t('exitClientView')}</span>
        </button>
      </div>
    </div>
  )
}
