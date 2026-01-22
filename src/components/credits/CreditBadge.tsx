/**
 * Credit Badge Component for Valuation Tester
 *
 * Displays user's current credit status with upgrade prompts
 */

import { Tooltip } from '@heroui/react'
import React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
// AUTH-FIRST: guestCreditService removed - all users must authenticate

interface CreditBadgeProps {
  className?: string
  showUpgrade?: boolean
  showTooltip?: boolean
  onClick?: () => void
  variant?: 'default' | 'compact' | 'inline'
}

// SOFT DISABLE: Feature flag for unlimited credits mode
import { env } from '../../utils/env'

const UNLIMITED_CREDITS_MODE = env.NEXT_PUBLIC_UNLIMITED_CREDITS_MODE !== 'false'

/**
 * Credit Badge Component
 * Shows user's credit status with visual indicators
 */
export const CreditBadge: React.FC<CreditBadgeProps> = ({
  className = '',
  showUpgrade = true,
  showTooltip = true,
  onClick,
  variant = 'default',
}) => {
  const { isAuthenticated } = useAuth()
  const { creditsRemaining, isPremium, isLoading } = useCredits()

  // AUTH-FIRST: All users are authenticated - no guest credit check needed

  // Loading state
  if (isLoading) {
    return <div className={`animate-pulse bg-gray-200 h-8 w-24 rounded ${className}`} />
  }

  // SOFT DISABLE: Show unlimited access badge for all users
  if (UNLIMITED_CREDITS_MODE) {
    const content = {
      default: { icon: '♾️', text: 'Unlimited Access' },
      compact: { icon: '♾️', text: 'Unlimited' },
      inline: { icon: '♾️', text: '' },
    }[variant]

    const badgeContent = (
      <div
        className={`flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-accent-500 to-accent-600 text-white rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md ${onClick ? 'cursor-pointer hover:scale-105' : ''} ${className}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label="Unlimited access to valuations"
      >
        <span aria-hidden="true">{content.icon}</span>
        {content.text && <span>{content.text}</span>}
      </div>
    )

    if (showTooltip && !onClick) {
      return (
        <Tooltip content="Generate unlimited valuations" placement="bottom">
          {badgeContent}
        </Tooltip>
      )
    }

    return badgeContent
  }

  // AUTH-FIRST: Guest badge logic removed - all users must authenticate

  // Premium user badge
  if (isPremium) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-accent-500 to-accent-600 text-white rounded-full text-sm font-medium ${className}`}
      >
        <span>✨ Premium</span>
      </div>
    )
  }

  // Credit status indicators
  const isLow = creditsRemaining <= 1
  const isOut = creditsRemaining === 0

  // Color classes based on credit status
  const getColorClasses = () => {
    if (isOut) {
      return 'bg-accent-100 text-accent-700 hover:bg-accent-200 border-accent-200'
    }
    if (isLow) {
      return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200'
    }
    return 'bg-primary-100 text-primary-700 hover:bg-primary-200 border-primary-200'
  }

  // Icon based on status
  const getIcon = () => {
    if (isOut) return '🔒'
    if (isLow) return '⚠️'
    return '💳'
  }

  // Text content
  const getText = () => {
    if (isOut) return 'Out of Credits'
    if (isLow) return `${creditsRemaining} Credit${creditsRemaining === 1 ? '' : 's'} Left`
    return `${creditsRemaining} Credit${creditsRemaining === 1 ? '' : 's'}`
  }

  // Upgrade prompt
  const getUpgradeText = () => {
    if (isOut) return 'Upgrade Now'
    if (isLow) return 'Upgrade'
    return null
  }

  const badgeContent = (
    <div
      className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors border ${getColorClasses()} ${className}`}
    >
      <span className="text-lg">{getIcon()}</span>
      <span>{getText()}</span>
      {showUpgrade && getUpgradeText() && (
        <span className="text-xs font-semibold opacity-75">↗ {getUpgradeText()}</span>
      )}
    </div>
  )

  // Wrap in clickable div if upgrade is needed and showUpgrade is true
  if (showUpgrade && (isOut || isLow)) {
    return (
      <>
        <div className="block cursor-pointer hover:opacity-80 transition-opacity" onClick={onClick}>
          {badgeContent}
        </div>
      </>
    )
  }

  return badgeContent
}

/**
 * Compact Credit Badge
 * Smaller version for headers and compact spaces
 */
export const CompactCreditBadge: React.FC<Omit<CreditBadgeProps, 'variant'>> = ({
  className = '',
  showUpgrade = false,
}) => {
  return (
    <CreditBadge
      variant="compact"
      className={`text-xs px-2 py-1 ${className}`}
      showUpgrade={showUpgrade}
    />
  )
}

/**
 * Inline Credit Badge
 * For use within text or forms
 */
export const InlineCreditBadge: React.FC<Omit<CreditBadgeProps, 'variant'>> = ({
  className = '',
  showUpgrade = false,
}) => {
  return (
    <CreditBadge
      variant="inline"
      className={`text-xs px-2 py-1 ${className}`}
      showUpgrade={showUpgrade}
    />
  )
}

export default CreditBadge
