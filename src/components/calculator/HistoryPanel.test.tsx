import { render, screen } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import type { ValuationVersion } from '../../types/ValuationVersion'
import { HistoryPanel } from './HistoryPanel'

type MockMotionDivProps = React.HTMLAttributes<HTMLDivElement> & {
  animate?: unknown
  exit?: unknown
  initial?: unknown
  transition?: unknown
}

type MockButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: string
  variant?: string
}

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: MockMotionDivProps) => <div {...props}>{children}</div>,
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    const translations: Record<string, string> = {
      changed: 'Gewijzigd',
      current: 'HUIDIG',
      guest: 'Gast',
      indicativeEV: 'Indicatieve EV',
      title: 'Schattingsversies',
      user: 'Gebruiker',
      valuationFlow: 'Waarderingsverloop',
    }

    if (key === 'versionN') return `Versie ${values?.number ?? 1}`
    if (key === 'versionsCount') {
      return `${values?.count ?? 0} ${values?.count === 1 ? 'versie' : 'versies'} · Audit trail`
    }
    if (key === 'timeJustNow') return 'Zojuist'

    return translations[key] ?? key
  },
}))

vi.mock('@/design-system', () => ({
  AuroraButton: ({ children, size: _size, variant: _variant, ...props }: MockButtonProps) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Checkbox: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="checkbox" {...props} />
  ),
}))

vi.mock('@/lib/analytics', () => ({
  trackVersionCompare: vi.fn(),
  trackVersionRestore: vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'venus@example.com', id: 'user-1' } }),
}))

describe('HistoryPanel', () => {
  beforeEach(() => {
    useVersionHistoryStore.setState({
      activeVersions: {},
      error: null,
      fetchVersions: vi.fn().mockResolvedValue(undefined),
      syncStatus: {},
      versions: {},
    })
  })

  it('uses the live report valuation for the current lightweight version', async () => {
    useVersionHistoryStore.setState({
      activeVersions: { 'report-1': 1 },
      versions: {
        'report-1': [
          {
            id: 'version-1',
            versionNumber: 1,
            versionLabel: 'Version 1',
            createdAt: new Date('2026-06-02T08:00:00.000Z'),
            createdBy: 'user-1',
            isActive: true,
            formData: {},
            valuationResult: null,
          } as unknown as ValuationVersion,
        ],
      },
    })

    render(
      <HistoryPanel
        report={{
          id: 'report-1',
          companyName: 'Restaurant Decan',
          valuation: 293_000,
          valuationLow: 220_000,
          valuationHigh: 367_000,
          ebitda: 70_000,
          multiple: 4.19,
        }}
        reportId="report-1"
      />
    )

    expect(await screen.findByText('Version 1')).toBeInTheDocument()
    expect(screen.getAllByText(/€\s*293\.000/).length).toBeGreaterThan(0)
    expect(screen.getByText(/€\s*220\.000/)).toBeInTheDocument()
    expect(screen.getByText(/€\s*367\.000/)).toBeInTheDocument()
    expect(screen.getAllByText('HUIDIG').length).toBeGreaterThan(0)
  })

  it('uses the live report valuation when the current snapshot is zero-only metadata', async () => {
    useVersionHistoryStore.setState({
      activeVersions: { 'report-1': 1 },
      versions: {
        'report-1': [
          {
            id: 'version-1',
            versionNumber: 1,
            versionLabel: 'Version 1',
            createdAt: new Date('2026-06-02T08:00:00.000Z'),
            createdBy: 'user-1',
            isActive: true,
            formData: {},
            valuationResult: {
              equity_value_high: 0,
              equity_value_low: 0,
              equity_value_mid: 0,
              valuation_summary: { final_valuation: 0 },
            },
          } as unknown as ValuationVersion,
        ],
      },
    })

    render(
      <HistoryPanel
        report={{
          id: 'report-1',
          companyName: 'Restaurant Decan',
          valuation: 293_000,
          valuationLow: 220_000,
          valuationHigh: 367_000,
          ebitda: 70_000,
          multiple: 4.19,
        }}
        reportId="report-1"
      />
    )

    expect(await screen.findByText('Version 1')).toBeInTheDocument()
    expect(screen.getAllByText(/€\s*293\.000/).length).toBeGreaterThan(0)
    expect(screen.getByText(/€\s*220\.000/)).toBeInTheDocument()
    expect(screen.getByText(/€\s*367\.000/)).toBeInTheDocument()
    expect(screen.queryByText(/€\s*0\b/)).not.toBeInTheDocument()
  })
})
