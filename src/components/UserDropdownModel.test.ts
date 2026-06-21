import { describe, expect, it } from 'vitest'
import type { User } from '../contexts/AuthContextTypes'
import {
  getUserInitials,
  isReportPathname,
  resolveMercuryLocale,
  resolveReportId,
  resolveUserDropdownIdentity,
} from './UserDropdownModel'

const user: User = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  role: 'advisor',
  avatar_url: 'https://cdn.example.com/user.png',
}

describe('UserDropdownModel', () => {
  it('derives stable accountant initials from names', () => {
    expect(getUserInitials(user)).toBe('AL')
    expect(getUserInitials({ ...user, name: 'Ada' })).toBe('AD')
    expect(getUserInitials({ ...user, name: '  Ada   Byron  ' })).toBe('AB')
    expect(getUserInitials(null)).toBe('?')
  })

  it('uses client avatar only while acting as a client', () => {
    expect(
      resolveUserDropdownIdentity({
        user,
        isActingAsClient: true,
        client: { avatarUrl: 'https://cdn.example.com/client.png' },
      })
    ).toMatchObject({
      avatarUrl: 'https://cdn.example.com/client.png',
      displayName: 'Ada Lovelace',
      hasAvatar: true,
      initials: 'AL',
    })

    expect(
      resolveUserDropdownIdentity({
        user,
        isActingAsClient: false,
        client: { avatarUrl: 'https://cdn.example.com/client.png' },
      }).avatarUrl
    ).toBe('https://cdn.example.com/user.png')
  })

  it('resolves locale and report identity from current Venus paths', () => {
    expect(resolveMercuryLocale('/nl/reports/report-123')).toBe('nl')
    expect(resolveMercuryLocale('/fr')).toBe('fr')
    expect(resolveMercuryLocale('/reports/report-123')).toBe('en')

    expect(isReportPathname('/reports/report-123')).toBe(true)
    expect(isReportPathname('/reports/new')).toBe(false)
    expect(
      resolveReportId({
        isOnReportPage: true,
        pathname: '/reports/report-123?tab=summary',
      })
    ).toBe('report-123')
    expect(
      resolveReportId({
        isOnReportPage: true,
        pathname: '/reports/report-123',
        sessionReportId: 'canonical-report',
      })
    ).toBe('canonical-report')
  })
})
