/**
 * Credit Badge Component for Valuation Tester
 *
 * Displays user's current credit status with upgrade prompts
 */

import { Tooltip } from '@/design-system'
import React from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('modals.creditBadge')
  const { isAuthenticated } = useAuth()
  const { creditsRemaining, isPremium, isLoading } = useCredits()

  // AUTH-FIRST: All users are authenticated - no guest credit check needed

  // Loading state
  if (isLoading) {
    return <div className={`animate-pulse bg-foreground/10 h-8 w-24 rounded ${className}`} />
  }

  // SOFT DISABLE: Show unlimited access badge for all users
  if (UNLIMITED_CREDITS_MODE) {
    const content = {
      default: { icon: '♾️', text: t('unlimitedAccess') },
      compact: { icon: '♾️', text: t('unlimited') },
      inline: { icon: '♾️', text: '' },
    }[variant]

    const badgeContent = (
      <div
        className={`flex items-center gap-2 px-3 py-1 bg-accent text-accent-foreground rounded-full text-sm font-medium transition-all duration-200 hover:shadow-md ${onClick ? 'cursor-pointer hover:scale-105' : ''} ${className}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={t('unlimitedAccessAria')}
      >
        <span aria-hidden="true">{content.icon}</span>
        {content.text && <span>{content.text}</span>}
      </div>
    )

    if (showTooltip && !onClick) {
      return (
        <Tooltip content={t('generateUnlimited')} side="bottom">
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
        className={`flex items-center gap-2 px-3 py-1 bg-accent text-accent-foreground rounded-full text-sm font-medium ${className}`}
      >
        <span>✨ {t('premium')}</span>
      </div>
    )
  }

  // Credit status indicators
  const isLow = creditsRemaining <= 1
  const isOut = creditsRemaining === 0

  // Color classes based on credit status
  const getColorClasses = () => {
    if (isOut) {
      return 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/30'
    }
    if (isLow) {
      return 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/30'
    }
    return 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30'
  }

  // Icon based on status
  const getIcon = () => {
    if (isOut) return '🔒'
    if (isLow) return '⚠️'
    return '💳'
  }

  // Text content
  const getText = () => {
    if (isOut) return t('outOfCredits')
    if (isLow) return t('creditsLeft', { count: creditsRemaining })
    return t('credits', { count: creditsRemaining })
  }

  // Upgrade prompt
  const getUpgradeText = () => {
    if (isOut) return t('upgradeNow')
    if (isLow) return t('upgrade')
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
