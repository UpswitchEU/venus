'use client'

import { Building2, CreditCard, HelpCircle, Home, LogOut, Settings } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/design-system/utils'
import type { CalculatorNavProps } from './CalculatorNav.types'
import { Dropdown } from './CalculatorNavDropdown'

type CalculatorNavUserMenuProps = Pick<
  CalculatorNavProps,
  | 'avatarUrl'
  | 'isAccountantMode'
  | 'onAccountSettings'
  | 'onLogout'
  | 'onNavigateToBilling'
  | 'onNavigateToDashboard'
  | 'onNavigateToHelp'
  | 'onSwitchWorkspace'
  | 'userEmail'
  | 'userInitials'
  | 'userName'
>

export function CalculatorNavUserMenu({
  avatarUrl,
  isAccountantMode = false,
  onAccountSettings,
  onLogout,
  onNavigateToBilling,
  onNavigateToDashboard,
  onNavigateToHelp,
  onSwitchWorkspace,
  userEmail,
  userInitials = 'GL',
  userName,
}: CalculatorNavUserMenuProps) {
  const t = useTranslations()
  const [avatarError, setAvatarError] = useState(false)
  const showAvatar = avatarUrl && !avatarError
  const avatarFallback = userInitials?.charAt(0)?.toUpperCase() || '?'

  return (
    <Dropdown
      variant="glass"
      avoidViewportOverflow="mobile"
      className="col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto md:justify-self-auto"
      trigger={
        <button
          type="button"
          data-testid="user-menu"
          aria-haspopup="menu"
          aria-label={userName ? t('account.accountMenu') : t('account.guestMenu')}
          className={cn(
            'relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full md:h-8 md:w-8',
            'bg-primary/20 border-2 border-foreground/10',
            'text-foreground/70 font-medium text-xs',
            'hover:ring-2 hover:ring-primary/30 transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
            'p-1.5 md:p-0.5'
          )}
        >
          {showAvatar ? (
            <img
              src={avatarUrl}
              alt={userName || t('account.accountMenu')}
              className="w-full h-full object-cover rounded-full"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <span className="text-foreground/70 font-medium">{avatarFallback}</span>
          )}
        </button>
      }
      align="end"
    >
      <div className="p-1.5 w-56 min-w-[220px]" role="menu">
        <div className="px-3 py-3 border-b border-foreground/10 mb-1.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border border-foreground/10 flex-shrink-0">
              {showAvatar ? (
                <img
                  src={avatarUrl}
                  alt={userName || t('account.accountMenu')}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <span className="text-foreground/70 font-medium text-sm">{avatarFallback}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {userName || t('historyPanel.guest')}
              </p>
              {userEmail && <p className="text-xs text-foreground/50 truncate">{userEmail}</p>}
              {isAccountantMode && (
                <p className="text-xs text-primary/80 mt-0.5">{t('account.roleAccountantPro')}</p>
              )}
            </div>
          </div>
        </div>

        {isAccountantMode ? (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => onNavigateToDashboard?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Home className="w-4 h-4 text-foreground/50" />
              <span>{t('account.returnToDashboard')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onAccountSettings?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Settings className="w-4 h-4 text-foreground/50" />
              <span>{t('account.settings')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onNavigateToBilling?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <CreditCard className="w-4 h-4 text-foreground/50" />
              <span>{t('account.billing')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onNavigateToHelp?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-foreground/50" />
              <span>{t('account.helpCenter')}</span>
            </button>
            <div className="h-px bg-foreground/10 -mx-1 my-1.5" />
            <button
              type="button"
              role="menuitem"
              onClick={() => onLogout?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.logout')}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => onAccountSettings?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Settings className="w-4 h-4 text-foreground/50" />
              <span>{t('account.settings')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onSwitchWorkspace?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Building2 className="w-4 h-4 text-foreground/50" />
              <span>{t('account.switchWorkspace')}</span>
            </button>
            <div className="h-px bg-foreground/10 -mx-1 my-1.5" />
            <button
              type="button"
              role="menuitem"
              onClick={() => onLogout?.()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.logout')}</span>
            </button>
          </>
        )}
      </div>
    </Dropdown>
  )
}
