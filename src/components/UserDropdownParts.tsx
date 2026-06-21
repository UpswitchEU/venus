'use client'

import { type LucideIcon, User } from 'lucide-react'
import type { RefObject } from 'react'
import type { User as UserType } from '../contexts/AuthContextTypes'
import type { UserDropdownIdentity } from './UserDropdownModel'

export interface UserDropdownPosition {
  top: number
  right: number
}

export type UserDropdownActionItem = {
  key: string
  icon: LucideIcon
  label: string
  action: () => void
  isDivider?: false
}

export type UserDropdownMenuItem =
  | UserDropdownActionItem
  | {
      key: string
      isDivider: true
    }

function UserAvatarImage({
  alt,
  avatarUrl,
  className,
}: {
  alt: string
  avatarUrl?: string | null
  className: string
}) {
  if (!avatarUrl) return null

  return (
    <img
      src={avatarUrl}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = 'none'
        event.currentTarget.nextElementSibling?.classList.remove('hidden')
      }}
    />
  )
}

export function UserDropdownButton({
  accountMenuLabel,
  buttonRef,
  guestAccountMenuLabel,
  identity,
  isOpen,
  onClick,
  user,
}: {
  accountMenuLabel: string
  buttonRef: RefObject<HTMLButtonElement>
  guestAccountMenuLabel: string
  identity: UserDropdownIdentity
  isOpen: boolean
  onClick: () => void
  user: UserType | null
}) {
  return (
    <button
      ref={buttonRef}
      data-testid="user-menu"
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-foreground/10 text-foreground text-sm font-medium hover:bg-foreground/15 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      aria-label={user ? `${identity.displayName} - ${accountMenuLabel}` : guestAccountMenuLabel}
      aria-expanded={isOpen}
      aria-haspopup="true"
      style={{ position: 'relative', zIndex: 10001 }}
    >
      {user ? (
        <>
          <UserAvatarImage
            avatarUrl={identity.avatarUrl}
            alt={identity.displayName || 'User'}
            className="w-full h-full rounded-full object-cover"
          />
          <span className={identity.hasAvatar ? 'hidden' : 'block'}>{identity.initials}</span>
        </>
      ) : (
        <User className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  )
}

function UserDropdownProfileHeader({
  identity,
  signInToDashboardLabel,
  user,
  welcomeGuestLabel,
}: {
  identity: UserDropdownIdentity
  signInToDashboardLabel: string
  user: UserType | null
  welcomeGuestLabel: string
}) {
  return (
    <div className="px-4 py-3 border-b border-foreground/10">
      {user ? (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <UserAvatarImage
              avatarUrl={identity.avatarUrl}
              alt={user.name || 'User'}
              className="w-full h-full rounded-full object-cover"
            />
            <span
              className={
                identity.hasAvatar ? 'hidden' : 'block text-foreground text-sm font-medium'
              }
            >
              {identity.initials}
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
          <p className="text-sm font-medium text-foreground">{welcomeGuestLabel}</p>
          <p className="text-xs text-muted-foreground">{signInToDashboardLabel}</p>
        </div>
      )}
    </div>
  )
}

export function UserDropdownMenu({
  identity,
  menuItems,
  onClose,
  onItemSelect,
  position,
  signInToDashboardLabel,
  user,
  welcomeGuestLabel,
}: {
  identity: UserDropdownIdentity
  menuItems: UserDropdownMenuItem[]
  onClose: () => void
  onItemSelect: (item: UserDropdownActionItem) => void
  position: UserDropdownPosition
  signInToDashboardLabel: string
  user: UserType | null
  welcomeGuestLabel: string
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[10000]"
        onClick={onClose}
        aria-hidden="true"
        style={{ zIndex: 10000 }}
      />

      <div
        className="fixed w-56 bg-popover rounded-lg shadow-lg border border-foreground/10 py-2 z-[10001]"
        style={{
          top: `${position.top}px`,
          right: `${position.right}px`,
          zIndex: 10001,
        }}
      >
        <UserDropdownProfileHeader
          identity={identity}
          signInToDashboardLabel={signInToDashboardLabel}
          user={user}
          welcomeGuestLabel={welcomeGuestLabel}
        />

        <div className="py-2">
          {menuItems.map((item, index) => {
            if (item.isDivider) {
              return <div key={item.key} className="h-px bg-foreground/10 my-1" role="separator" />
            }

            const Icon = item.icon
            const isFirst = index === 0
            const isLast = index === menuItems.length - 1
            const isLogout = item.key === 'logout'

            return (
              <button
                key={item.key}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onItemSelect(item)
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
                <Icon
                  className={`w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0 ${isLogout ? 'text-red-400' : 'text-muted-foreground'}`}
                />
                <span className="flex-1">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
