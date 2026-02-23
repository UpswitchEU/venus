import { Home, Info, LogOut, Settings, User, UserPlus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTransitionRouter } from 'next-view-transitions'
import React, { useEffect, useRef, useState } from 'react'
import { User as UserType } from '../contexts/AuthContextTypes'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import UrlGeneratorService from '../services/urlGenerator'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import { generalLogger } from '../utils/logger'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { getSafeMercuryReturnUrl, isLegacyReturnUrl } from '@/lib/return-url'
import { hasMeaningfulSessionData } from '../utils/sessionDataUtils'
import { ExitReportConfirmationModal } from './modals/ExitReportConfirmationModal'

interface UserDropdownProps {
  user: UserType | null
  onLogout: () => Promise<void>
}

export const UserDropdown: React.FC<UserDropdownProps> = ({ user, onLogout }) => {
  // Get client context to show client avatar when acting as client
  const { isActingAsClient, client } = useClientContext()
  const router = useTransitionRouter()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null) // Track button position

  // Embedded mode detection for iframe integration
  const { isEmbedded, closeEmbedded } = useEmbeddedMode()

  // Get session state to check report status
  const session = useSessionStore((state) => state.session)
  const hasUnsavedChanges = useSessionStore((state) => state.hasUnsavedChanges)
  const isSaving = useSessionStore((state) => state.isSaving)
  const saveSession = useSessionStore((state) => state.saveSession)
  const clearSession = useSessionStore((state) => state.clearSession)

  // Check if we're on a report page
  const isOnReportPage = pathname?.startsWith('/reports/') && pathname !== '/reports/new'
  const reportId =
    session?.reportId || (isOnReportPage ? pathname?.split('/reports/')[1]?.split('?')[0] : null)

  // Debug logging for pathname detection
  useEffect(() => {
    if (isOnReportPage) {
      generalLogger.debug('[UserDropdown] On report page detected', {
        pathname,
        isOnReportPage,
        reportId,
        sessionReportId: session?.reportId,
      })
    }
  }, [pathname, isOnReportPage, reportId, session?.reportId])

  // Calculate dropdown position based on button
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 })

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 8, // 8px below button
        right: window.innerWidth - rect.right, // Align right edge
      })
    }
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  // Close exit modal when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setShowExitModal(false)
    }
  }, [isOpen])

  // Get user initials for placeholder
  const getUserInitials = () => {
    // Always show accountant initials in toolbar
    if (!user?.name) return '?'
    const names = user.name.split(' ')
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase()
    }
    return user.name.substring(0, 2).toUpperCase()
  }

  // Use client avatar when acting as client, otherwise use user avatar
  const avatarUrl = isActingAsClient && client ? client.avatarUrl : user?.avatar_url || user?.avatar
  const hasAvatar = !!avatarUrl
  // Always show accountant identity in toolbar; client name belongs in breadcrumb/context bar
  const displayName = user?.name || user?.email

  const handleUserClick = () => {
    setIsOpen((prev) => !prev)
  }

  const handleLogout = async () => {
    setIsOpen(false)
    await onLogout()
  }

  // Removed handleSignIn since Sign In menu item was removed

  const handleCreateAccount = () => {
    setIsOpen(false)
    // Open parent window to sign up
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OPEN_SIGNUP' }, '*')
    } else {
      // Fallback: open in same window
      window.open(`${getMercuryUrl()}/signup`, '_blank')
    }
  }

  const handleBackToDashboard = () => {
    setIsOpen(false)

    const returnUrl = typeof window !== 'undefined'
      ? sessionStorage.getItem('upswitch_return_url')
      : null
    const sourceApp = typeof window !== 'undefined'
      ? sessionStorage.getItem('upswitch_source')
      : null
    const locale = pathname?.match(/\/(en|nl|fr|de)\//)?.[1] || 'en'

    if (!returnUrl || isLegacyReturnUrl(returnUrl)) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'NAVIGATE_TO_DASHBOARD' }, '*')
        return
      }
    }

    const { relationshipId } = useClientContext.getState()
    const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
      clientContextId: relationshipId ?? undefined,
      locale,
      sourceApp: sourceApp ?? undefined,
    })
    window.location.href = targetUrl
  }

  const handleAccountSettings = () => {
    setIsOpen(false)
    // Navigate to parent window settings
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'NAVIGATE_TO_SETTINGS' }, '*')
    } else {
      // Fallback: open in same window
      window.open(`${getMercuryUrl()}/users/profile`, '_blank')
    }
  }

  const handleLearnMore = () => {
    setIsOpen(false)
    // Navigate to parent window valuation page
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'NAVIGATE_TO_VALUATION' }, '*')
    } else {
      // Fallback: open in same window
      window.open(`${getMercuryUrl()}/valuation`, '_blank')
    }
  }

  /**
   * Handle "Back to Home" click
   * Checks report state and shows appropriate confirmation modal
   * Updated for Mercury integration - uses embedded mode or returns to Mercury if return_url exists
   */
  const handleBackToHome = () => {
    generalLogger.info('[UserDropdown] Back to Home clicked', {
      pathname,
      isOnReportPage,
      reportId,
      hasSession: !!session,
      isEmbedded,
    })

    setIsOpen(false)

    // If embedded in iframe (Mercury modal), close the embedded view
    if (isEmbedded) {
      generalLogger.info('[UserDropdown] Embedded mode detected, closing embedded view')
      closeEmbedded()
      return
    }

    // Check for return URL (Mercury integration - skip legacy routes to avoid 404)
    if (typeof window !== 'undefined') {
      const returnUrl = sessionStorage.getItem('upswitch_return_url')
      const sourceApp = sessionStorage.getItem('upswitch_source')
      const locale = pathname?.match(/\/(en|nl|fr|de)\//)?.[1] || 'en'

      if (returnUrl && !isLegacyReturnUrl(returnUrl)) {
        generalLogger.info('[UserDropdown] Return URL found, redirecting to Mercury', {
          returnUrl,
        })
        if (reportId) {
          try {
            const event = new CustomEvent('upswitch-report-updated', {
              detail: {
                reportId,
                reportName: session?.name,
                updatedAt: session?.updatedAt || new Date(),
                source: 'valuation.upswitch.app',
              },
            })
            window.dispatchEvent(event)
            if (typeof BroadcastChannel !== 'undefined') {
              const channel = new BroadcastChannel('upswitch-report-sync')
              channel.postMessage({
                type: 'upswitch-report-updated',
                data: {
                  reportId,
                  reportName: session?.name,
                  updatedAt: session?.updatedAt || new Date(),
                },
                source: 'valuation.upswitch.app',
              })
              channel.close()
            }
          } catch (error) {
            generalLogger.warn('[UserDropdown] Failed to broadcast before return:', error)
          }
        }
        const { relationshipId: relId } = useClientContext.getState()
        const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
          clientContextId: relId ?? undefined,
          locale,
          sourceApp: sourceApp ?? undefined,
        })
        window.location.href = targetUrl
        return
      }
    }

    // If not on a report page, just navigate to home
    if (!isOnReportPage || !reportId) {
      generalLogger.info('[UserDropdown] Not on report page, navigating to home', {
        pathname,
        isOnReportPage,
        reportId,
      })
      router.push(UrlGeneratorService.root())
      return
    }

    // Check report state
    const hasValuationResults =
      !!session?.valuationResult || !!session?.htmlReport || !!session?.infoTabHtml
    const hasMeaningfulData = hasMeaningfulSessionData(session?.sessionData || {}, session)

    generalLogger.info('[UserDropdown] Report state check', {
      reportId,
      hasValuationResults,
      hasMeaningfulData,
      hasUnsavedChanges,
    })

    // Empty report (no meaningful data, no results) -> Just exit
    if (!hasMeaningfulData && !hasValuationResults) {
      generalLogger.info('[UserDropdown] Empty report detected, exiting without confirmation', {
        reportId,
      })
      handleExitReport()
      return
    }

    // Show confirmation modal for reports with data
    generalLogger.info('[UserDropdown] Showing exit confirmation modal', {
      reportId,
      hasUnsavedChanges,
      hasValuationResults,
    })
    setShowExitModal(true)
  }

  /**
   * Exit report without saving
   * Updated for Mercury integration - uses embedded mode or returns to Mercury if return_url exists
   */
  const handleExitReport = async () => {
    try {
      generalLogger.info('[UserDropdown] Exiting report', { reportId, isEmbedded })
      if (reportId) {
        // Clear session
        clearSession()
        generalLogger.info('[UserDropdown] Session cleared', { reportId })
      }
      // Close modal first
      setShowExitModal(false)

      // If embedded in iframe (Mercury modal), close the embedded view
      if (isEmbedded) {
        generalLogger.info('[UserDropdown] Embedded mode detected, closing embedded view')
        closeEmbedded()
        return
      }

      // Check for return URL (Mercury integration - skip legacy routes to avoid 404)
      if (typeof window !== 'undefined') {
        const returnUrl = sessionStorage.getItem('upswitch_return_url')
        const sourceApp = sessionStorage.getItem('upswitch_source')
        const locale = pathname?.match(/\/(en|nl|fr|de)\//)?.[1] || 'en'

        if (returnUrl && !isLegacyReturnUrl(returnUrl)) {
          generalLogger.info('[UserDropdown] Return URL found, redirecting to Mercury', {
            returnUrl,
          })
          const { relationshipId: relId2 } = useClientContext.getState()
          const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
            clientContextId: relId2 ?? undefined,
            locale,
            sourceApp: sourceApp ?? undefined,
          })
          window.location.href = targetUrl
          return
        }
      }

      // Navigate to home
      const homeUrl = UrlGeneratorService.root()
      generalLogger.info('[UserDropdown] Navigating to home', { homeUrl })
      router.push(homeUrl)
    } catch (error) {
      generalLogger.error('[UserDropdown] Error exiting report', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Still navigate even if cleanup fails
      setShowExitModal(false)

      // If embedded, try to close even on error
      if (isEmbedded) {
        closeEmbedded()
        return
      }

      // Check for return URL even on error (skip legacy routes)
      if (typeof window !== 'undefined') {
        const returnUrl = sessionStorage.getItem('upswitch_return_url')
        const sourceApp = sessionStorage.getItem('upswitch_source')
        const locale = pathname?.match(/\/(en|nl|fr|de)\//)?.[1] || 'en'

        if (returnUrl && !isLegacyReturnUrl(returnUrl)) {
          const { relationshipId: relId3 } = useClientContext.getState()
          const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
            clientContextId: relId3 ?? undefined,
            locale,
            sourceApp: sourceApp ?? undefined,
          })
          window.location.href = targetUrl
          return
        }
      }

      router.push(UrlGeneratorService.root())
    }
  }

  /**
   * Save report and exit
   */
  const handleSaveAndExit = async () => {
    if (!reportId) {
      generalLogger.warn('[UserDropdown] No reportId, exiting without save', { reportId })
      handleExitReport()
      return
    }

    try {
      generalLogger.info('[UserDropdown] Saving report before exit', { reportId })
      // Save session
      await saveSession('user')
      generalLogger.info('[UserDropdown] Report saved successfully, now exiting', { reportId })
      // Exit
      handleExitReport()
    } catch (error) {
      generalLogger.error('[UserDropdown] Error saving report before exit', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Still exit even if save fails
      handleExitReport()
    }
  }

  /**
   * Close exit modal
   */
  const handleCloseExitModal = () => {
    setShowExitModal(false)
  }

  // Menu items for authenticated users
  const authenticatedMenuItems = [
    // Show "Back to Home" when on report page, otherwise "Back to Dashboard"
    ...(isOnReportPage
      ? [
          {
            key: 'back-to-home',
            icon: Home,
            label: 'Back to Home',
            action: handleBackToHome,
          },
        ]
      : [
          {
            key: 'back-to-dashboard',
            icon: Home,
            label: 'Back to Dashboard',
            action: handleBackToDashboard,
          },
        ]),
    {
      key: 'account-settings',
      icon: Settings,
      label: 'Account Settings',
      action: handleAccountSettings,
    },
    {
      key: 'divider-1',
      isDivider: true,
    },
    {
      key: 'logout',
      icon: LogOut,
      label: 'Log Out',
      action: handleLogout,
    },
  ]

  // Menu items for guest users
  const guestMenuItems = [
    // Show "Back to Home" when on report page
    ...(isOnReportPage
      ? [
          {
            key: 'back-to-home',
            icon: Home,
            label: 'Back to Home',
            action: () => {
              generalLogger.info('[UserDropdown] Back to Home action called from guest menu')
              handleBackToHome()
            },
          },
          {
            key: 'divider-home',
            isDivider: true,
          },
        ]
      : []),
    {
      key: 'create-account',
      icon: UserPlus,
      label: 'Create Account',
      action: handleCreateAccount,
    },
    {
      key: 'divider-1',
      isDivider: true,
    },
    {
      key: 'learn-more',
      icon: Info,
      label: 'Learn More',
      action: handleLearnMore,
    },
  ]

  // Debug: Log menu items when they change
  useEffect(() => {
    if (!user) {
      generalLogger.debug('[UserDropdown] Guest menu items', {
        isOnReportPage,
        pathname,
        menuItemCount: guestMenuItems.length,
        hasBackToHome: guestMenuItems.some((item) => item.key === 'back-to-home'),
      })
    }
  }, [user, isOnReportPage, pathname, guestMenuItems.length])

  const menuItems = user ? authenticatedMenuItems : guestMenuItems

  // Debug: Log which menu items are being used
  useEffect(() => {
    generalLogger.debug('[UserDropdown] Menu items updated', {
      userType: user ? 'authenticated' : 'guest',
      menuItemCount: menuItems.length,
      menuItemKeys: menuItems.map((item) => item.key),
      isOnReportPage,
      pathname,
    })
  }, [user, menuItems.length, isOnReportPage, pathname])

  return (
    <div ref={dropdownRef} className="relative" style={{ zIndex: 10001, position: 'relative' }}>
      {/* Avatar Button */}
      <button
        ref={buttonRef}
        onClick={handleUserClick}
        className="flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-foreground/10 text-foreground text-sm font-medium hover:bg-foreground/15 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label={user ? `${displayName} - Account Menu` : 'Guest - Account Menu'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{ position: 'relative', zIndex: 10001 }}
      >
        {user ? (
          <>
            {hasAvatar ? (
              <img
                src={avatarUrl || ''}
                alt={displayName || 'User'}
                className="w-full h-full rounded-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <span className={hasAvatar ? 'hidden' : 'block'}>{getUserInitials()}</span>
          </>
        ) : (
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000]"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
            style={{ zIndex: 10000 }}
          />

          {/* Dropdown */}
          {/* ✅ FIX: Use very high z-index to ensure dropdown appears above report content */}
          <div
            className="fixed w-56 bg-popover rounded-lg shadow-lg border border-foreground/10 py-2 z-[10001]"
            style={{
              top: `${dropdownPosition.top}px`, // Dynamic position
              right: `${dropdownPosition.right}px`, // Dynamic position
              zIndex: 10001,
            }}
          >
            {/* User Profile Header */}
            <div className="px-4 py-3 border-b border-foreground/10">
              {user ? (
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                    {hasAvatar ? (
                      <img
                        src={avatarUrl || ''}
                        alt={user?.name || 'User'}
                        className="w-full h-full rounded-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          e.currentTarget.nextElementSibling?.classList.remove('hidden')
                        }}
                      />
                    ) : null}
                    <span className={hasAvatar ? 'hidden' : 'block text-foreground text-sm font-medium'}>
                      {getUserInitials()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {user.name || 'User'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <p className="text-sm font-medium text-foreground">Welcome, Guest</p>
                  <p className="text-xs text-muted-foreground">Sign in to access your dashboard</p>
                </div>
              )}
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {menuItems.map((item, index) => {
                if (item.isDivider) {
                  return <div key={index} className="h-px bg-foreground/10 my-1" role="separator" />
                }

                const Icon = item.icon
                const isFirst = index === 0
                const isLast = index === menuItems.length - 1

                const isLogout = item.key === 'logout'
                return (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      generalLogger.debug('[UserDropdown] Menu item clicked', {
                        key: item.key,
                        label: item.label,
                        hasAction: !!item.action,
                      })
                      item.action?.()
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-4 sm:py-3 text-base sm:text-sm font-medium text-left border-0 bg-transparent
                      transition-colors duration-150
                      ${isFirst ? 'rounded-t-xl' : ''}
                      ${isLast ? 'rounded-b-xl' : ''}
                      ${
                        isLogout
                          ? 'hover:bg-red-900/20 text-red-400 hover:text-red-300'
                          : 'hover:bg-foreground/10 text-muted-foreground hover:text-foreground'
                      }
                    `}
                    role="menuitem"
                    tabIndex={0}
                  >
                    {Icon && (
                      <Icon
                        className={`w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0 ${isLogout ? 'text-red-400' : 'text-muted-foreground'}`}
                      />
                    )}
                    <span className="flex-1">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Exit Confirmation Modal */}
      <ExitReportConfirmationModal
        isOpen={showExitModal}
        onClose={handleCloseExitModal}
        onConfirm={handleExitReport}
        onSaveAndExit={handleSaveAndExit}
        hasUnsavedChanges={hasUnsavedChanges}
        hasValuationResults={
          !!session?.valuationResult || !!session?.htmlReport || !!session?.infoTabHtml
        }
        isSaving={isSaving}
      />
    </div>
  )
}
