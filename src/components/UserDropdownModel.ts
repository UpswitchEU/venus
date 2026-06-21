import type { User as UserType } from '../contexts/AuthContextTypes'

interface ClientAvatarLike {
  avatarUrl?: string | null
}

export interface UserDropdownIdentity {
  avatarUrl?: string | null
  displayName?: string
  hasAvatar: boolean
  initials: string
}

export function getUserInitials(user: UserType | null): string {
  const name = user?.name?.trim()
  if (!name) return '?'

  const parts = name.split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return name.substring(0, 2).toUpperCase()
}

export function resolveUserDropdownIdentity({
  client,
  isActingAsClient,
  user,
}: {
  client: ClientAvatarLike | null
  isActingAsClient: boolean
  user: UserType | null
}): UserDropdownIdentity {
  const avatarUrl =
    isActingAsClient && client
      ? client.avatarUrl
      : user?.avatar_url || user?.avatar || user?.profile_picture || user?.picture

  return {
    avatarUrl,
    displayName: user?.name || user?.email,
    hasAvatar: Boolean(avatarUrl),
    initials: getUserInitials(user),
  }
}

export function resolveMercuryLocale(pathname: string | null | undefined): string {
  return pathname?.match(/^\/(en|nl|fr)/)?.[1] || 'en'
}

export function isReportPathname(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith('/reports/') && pathname !== '/reports/new')
}

export function resolveReportId({
  isOnReportPage,
  pathname,
  sessionReportId,
}: {
  isOnReportPage: boolean
  pathname: string | null | undefined
  sessionReportId?: string | null
}): string | null {
  return (
    sessionReportId ||
    (isOnReportPage ? (pathname?.split('/reports/')[1]?.split('?')[0] ?? null) : null)
  )
}
