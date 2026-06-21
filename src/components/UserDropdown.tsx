'use client'

import { Home, Info, LogOut, Settings, UserPlus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import { useEffect, useRef, useState } from 'react'
import {
  hasUsableMercuryHandoffReturnUrl,
  isManualMercuryEmbeddedContext,
  navigateToMercuryFromManualHandoff,
  readManualMercuryHandoffFromBrowser,
} from '@/features/manual/utils/manualMercuryNavigate'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import type { User as UserType } from '../contexts/AuthContextTypes'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import UrlGeneratorService from '../services/urlGenerator'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import { generalLogger } from '../utils/logger'
import { hasMeaningfulSessionData } from '../utils/sessionDataUtils'
import { ExitReportConfirmationModal } from './modals/ExitReportConfirmationModal'
import {
  isReportPathname,
  resolveMercuryLocale,
  resolveReportId,
  resolveUserDropdownIdentity,
} from './UserDropdownModel'
import {
  UserDropdownButton,
  UserDropdownMenu,
  type UserDropdownMenuItem,
} from './UserDropdownParts'

interface UserDropdownProps {
  user: UserType | null
  onLogout: () => Promise<void>
}

export function UserDropdown({ user, onLogout }: UserDropdownProps) {
  const t = useTranslations('userDropdown')
  // Get client context to show client avatar when acting as client
  const { isActingAsClient, client } = useClientContext()
  const router = useTransitionRouter()
  const pathname = usePathname()
  /** Mercury app routes are /en|nl/... — align deep links with current Venus locale. */
  const mercuryLocale = resolveMercuryLocale(pathname)
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
  const isOnReportPage = isReportPathname(pathname)
  const reportId = resolveReportId({
    isOnReportPage,
    pathname,
    sessionReportId: session?.reportId,
  })

  /** Only then may Mercury show "valuation added to business card" — not on plain exit. */
  const celebrateMercuryReturn = !!session?.valuationResult || !!session?.htmlReport

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

  const identity = resolveUserDropdownIdentity({ client, isActingAsClient, user })

  const handleUserClick = () => {
    setIsOpen((prev) => !prev)
  }

  const handleLogout = async () => {
    setIsOpen(false)
    await onLogout()
  }

  const handleCreateAccount = () => {
    setIsOpen(false)
    // Open parent window to sign up
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OPEN_SIGNUP' }, '*')
    } else {
      // Fallback: open in same window
      window.open(`${getMercuryUrl()}/${mercuryLocale}/auth/signup`, '_blank')
    }
  }

  const broadcastReportUpdateBeforeMercuryReturn = () => {
    if (!reportId) return
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

  const shouldReturnToMercuryHandoff = () => {
    const { sourceApp } = readManualMercuryHandoffFromBrowser()
    return (
      hasUsableMercuryHandoffReturnUrl() ||
      Boolean(sourceApp?.trim()) ||
      isManualMercuryEmbeddedContext()
    )
  }

  const handleBackToDashboard = () => {
    setIsOpen(false)
    const locale = resolveMercuryLocale(pathname)
    const { relationshipId } = useClientContext.getState()
    broadcastReportUpdateBeforeMercuryReturn()
    navigateToMercuryFromManualHandoff({
      currentLocale: locale,
      clientContextId: relationshipId,
      hasCompletedValuation: celebrateMercuryReturn,
    })
  }

  const handleAccountSettings = () => {
    setIsOpen(false)
    // Navigate to parent window settings
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'NAVIGATE_TO_SETTINGS' }, '*')
    } else {
      // Fallback: open in same window
      window.open(`${getMercuryUrl()}/${mercuryLocale}/users/profile`, '_blank')
    }
  }

  const handleLearnMore = () => {
    setIsOpen(false)
    // Navigate to parent window valuation page
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'NAVIGATE_TO_VALUATION' }, '*')
    } else {
      // Fallback: open in same window
      window.open(`${getMercuryUrl()}/${mercuryLocale}/valuation`, '_blank')
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

    if (typeof window !== 'undefined' && shouldReturnToMercuryHandoff()) {
      generalLogger.info('[UserDropdown] Returning to Mercury via handoff')
      const locale = resolveMercuryLocale(pathname)
      broadcastReportUpdateBeforeMercuryReturn()
      const { relationshipId: relId } = useClientContext.getState()
      navigateToMercuryFromManualHandoff({
        currentLocale: locale,
        clientContextId: relId,
        hasCompletedValuation: celebrateMercuryReturn,
      })
      return
    }

    if (isEmbedded) {
      generalLogger.info('[UserDropdown] Embedded mode without handoff, closing embedded view')
      closeEmbedded()
      return
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
    const hasValuationResults = !!session?.valuationResult || !!session?.htmlReport
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

      if (typeof window !== 'undefined' && shouldReturnToMercuryHandoff()) {
        const locale = resolveMercuryLocale(pathname)
        const { relationshipId: relId2 } = useClientContext.getState()
        navigateToMercuryFromManualHandoff({
          currentLocale: locale,
          clientContextId: relId2,
          hasCompletedValuation: celebrateMercuryReturn,
        })
        return
      }

      if (isEmbedded) {
        closeEmbedded()
        return
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

      if (typeof window !== 'undefined' && shouldReturnToMercuryHandoff()) {
        const locale = resolveMercuryLocale(pathname)
        const { relationshipId: relId3 } = useClientContext.getState()
        navigateToMercuryFromManualHandoff({
          currentLocale: locale,
          clientContextId: relId3,
          hasCompletedValuation: celebrateMercuryReturn,
        })
        return
      }

      if (isEmbedded) {
        closeEmbedded()
        return
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

  const authenticatedMenuItems: UserDropdownMenuItem[] = [
    ...(isOnReportPage
      ? [
          {
            key: 'back-to-home',
            icon: Home,
            label: t('backToHome'),
            action: handleBackToHome,
          },
        ]
      : [
          {
            key: 'back-to-dashboard',
            icon: Home,
            label: t('backToDashboard'),
            action: handleBackToDashboard,
          },
        ]),
    {
      key: 'account-settings',
      icon: Settings,
      label: t('accountSettings'),
      action: handleAccountSettings,
    },
    {
      key: 'divider-1',
      isDivider: true as const,
    },
    {
      key: 'logout',
      icon: LogOut,
      label: t('logOut'),
      action: handleLogout,
    },
  ]

  const guestMenuItems: UserDropdownMenuItem[] = [
    ...(isOnReportPage
      ? [
          {
            key: 'back-to-home',
            icon: Home,
            label: t('backToHome'),
            action: () => {
              generalLogger.info('[UserDropdown] Back to Home action called from guest menu')
              handleBackToHome()
            },
          },
          {
            key: 'divider-home',
            isDivider: true as const,
          },
        ]
      : []),
    {
      key: 'create-account',
      icon: UserPlus,
      label: t('createAccount'),
      action: handleCreateAccount,
    },
    {
      key: 'divider-1',
      isDivider: true as const,
    },
    {
      key: 'learn-more',
      icon: Info,
      label: t('learnMore'),
      action: handleLearnMore,
    },
  ]

  const menuItems = user ? authenticatedMenuItems : guestMenuItems
  const menuItemKeySignature = menuItems.map((item) => item.key).join('|')
  const hasBackToHomeMenuItem = menuItemKeySignature.split('|').includes('back-to-home')

  // Debug: Log menu items when they change
  useEffect(() => {
    if (!user) {
      generalLogger.debug('[UserDropdown] Guest menu items', {
        isOnReportPage,
        pathname,
        menuItemCount: guestMenuItems.length,
        hasBackToHome: hasBackToHomeMenuItem,
      })
    }
  }, [user, isOnReportPage, pathname, guestMenuItems.length, hasBackToHomeMenuItem])

  // Debug: Log which menu items are being used
  useEffect(() => {
    generalLogger.debug('[UserDropdown] Menu items updated', {
      userType: user ? 'authenticated' : 'guest',
      menuItemCount: menuItems.length,
      menuItemKeys: menuItemKeySignature.split('|'),
      isOnReportPage,
      pathname,
    })
  }, [user, menuItems.length, menuItemKeySignature, isOnReportPage, pathname])

  return (
    <div ref={dropdownRef} className="relative" style={{ zIndex: 10001, position: 'relative' }}>
      <UserDropdownButton
        accountMenuLabel={t('accountMenu')}
        buttonRef={buttonRef}
        guestAccountMenuLabel={t('guestAccountMenu')}
        identity={identity}
        isOpen={isOpen}
        onClick={handleUserClick}
        user={user}
      />

      {isOpen && (
        <UserDropdownMenu
          identity={identity}
          menuItems={menuItems}
          onClose={() => setIsOpen(false)}
          onItemSelect={(item) => {
            generalLogger.debug('[UserDropdown] Menu item clicked', {
              key: item.key,
              label: item.label,
              hasAction: !!item.action,
            })
            item.action()
          }}
          position={dropdownPosition}
          signInToDashboardLabel={t('signInToDashboard')}
          user={user}
          welcomeGuestLabel={t('welcomeGuest')}
        />
      )}

      {/* Exit Confirmation Modal */}
      <ExitReportConfirmationModal
        isOpen={showExitModal}
        onClose={handleCloseExitModal}
        onConfirm={handleExitReport}
        onSaveAndExit={handleSaveAndExit}
        hasUnsavedChanges={hasUnsavedChanges}
        hasValuationResults={!!session?.valuationResult || !!session?.htmlReport}
        isSaving={isSaving}
      />
    </div>
  )
}
