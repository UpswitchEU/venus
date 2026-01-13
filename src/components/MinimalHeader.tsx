'use client'

import Link from 'next/link'
import React from 'react'
import { useAuth } from '../hooks/useAuth'
import { generalLogger } from '../utils/logger'
import { UserDropdown } from './UserDropdown'

/**
 * Minimal Header Component for Home Page
 *
 * Ilara-style invisible header with Upswitch logo, title, and BETA badge.
 * Uses transparent background with backdrop blur for seamless integration.
 * No navigation links - clean landing page experience.
 */
export const MinimalHeader: React.FC = () => {
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    try {
      generalLogger.info('Logging out user')

      // Use unified logout function from auth hook (idempotent, race-condition safe)
      await logout()

      generalLogger.info('Logout successful')
    } catch (error) {
      generalLogger.error('Logout failed', { error })
      // Logout function handles errors gracefully, so we don't need to do anything else
    }
  }

  return (
    <>
      {/* Skip Link for Keyboard Navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="fixed top-0 left-0 right-0 z-50 flex px-6 py-4 gap-2 sm:gap-3 lg:gap-4 w-full flex-row flex-nowrap items-center justify-between max-w-full overflow-visible bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800">
        {/* Logo and Title */}
        <div className="flex basis-0 flex-row flex-grow flex-nowrap justify-start bg-transparent items-center no-underline text-medium whitespace-nowrap box-border">
          <Link className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 group" href="/">
            {/* Logo container with hover animation - desktop only */}
            <div className="relative h-6 sm:h-6 flex-shrink-0" style={{ width: '81.6px' }}>
              {/* Default logo (dark for transparent nav) */}
              <img
                src="/logo_upswitch_dark.svg"
                alt="Upswitch Logo"
                className="absolute top-0 left-0 h-6 sm:h-6 w-full flex-shrink-0 transition-opacity duration-300 ease-in-out opacity-100 lg:group-hover:opacity-0 pointer-events-none"
                style={{
                  width: '100%',
                  height: '24px',
                  objectFit: 'contain',
                  visibility: 'visible',
                  display: 'block',
                  marginTop: '1px',
                }}
              />
              {/* Hover logo (white var2 variant) - desktop only */}
              <img
                src="/logo_upswitch_white_var2.svg"
                alt="Upswitch Logo"
                className="h-6 sm:h-6 w-full flex-shrink-0 transition-opacity duration-300 ease-in-out opacity-0 lg:group-hover:opacity-100"
                style={{
                  width: '100%',
                  height: '24px',
                  objectFit: 'contain',
                  visibility: 'visible',
                  display: 'block',
                  marginTop: '1px',
                }}
              />
            </div>

            {/* BETA Badge */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-800/50 text-zinc-200 border border-zinc-700/50 ml-0">
              BETA
            </span>
          </Link>
        </div>

        {/* User Avatar - Right side */}
        <div className="flex items-center">
          <UserDropdown user={user} onLogout={handleLogout} />
        </div>
      </header>
    </>
  )
}
