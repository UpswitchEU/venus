import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { toast } from 'sonner'
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

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('./VersionCompareModal', () => ({
  VersionCompareModal: ({
    open,
    onRestore,
    restoring,
  }: {
    open: boolean
    onRestore?: () => void
    restoring?: boolean
  }) =>
    open && onRestore ? (
      <button type="button" disabled={restoring}>
        Comparison restore
      </button>
    ) : null,
}))

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
      indicativeValuation: 'Indicatieve waardering',
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
  function setupHistory() {
    useVersionHistoryStore.setState({
      activeVersions: { 'report-1': 3 },
      versions: {
        'report-1': [1, 2, 3].map(
          (versionNumber) =>
            ({
              id: `version-${versionNumber}`,
              reportId: 'report-1',
              versionNumber,
              versionLabel: `Version ${versionNumber}`,
              createdAt: new Date(),
              formData: {},
              valuationResult: { equity_value_mid: versionNumber * 100000 },
              isActive: versionNumber === 3,
            }) as unknown as ValuationVersion
        ),
      },
    })
    return { id: 'report-1', companyName: 'Test company', valuation: 300000 }
  }

  it('exposes expanded and selected states for keyboard and assistive technology', () => {
    render(<HistoryPanel report={setupHistory()} reportId="report-1" />)
    const first = screen.getByRole('button', { name: /Version 1/ })
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(first).toHaveAttribute('type', 'button')
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(first.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'compare' }))
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(first).not.toHaveAttribute('aria-expanded')
    fireEvent.click(screen.getByRole('button', { name: /Version 2/ }))
    expect(screen.getByRole('button', { name: /Version 3/ })).toBeDisabled()
  })

  it('keeps every restore control unavailable while a restore is pending', async () => {
    let finish!: () => void
    const restore = vi.fn(
      () =>
        new Promise<void>((done) => {
          finish = done
        })
    )
    render(<HistoryPanel report={setupHistory()} reportId="report-1" onVersionRestore={restore} />)
    fireEvent.click(screen.getByRole('button', { name: /Version 1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Version 2/ }))
    const actions = screen.getAllByRole('button', { name: 'restoreToVersion' })
    fireEvent.click(actions[0])
    expect(screen.getByRole('button', { name: 'restoring' })).toHaveAttribute('aria-busy', 'true')
    expect(actions[1]).toBeDisabled()
    fireEvent.click(actions[1])
    expect(restore).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'compare' }))
    fireEvent.click(screen.getByRole('button', { name: /Version 1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Version 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'compare (2)' }))
    expect(screen.getByRole('button', { name: 'Comparison restore' })).toBeDisabled()
    await act(async () => {
      finish()
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Comparison restore' })).toBeEnabled()
    )
  })

  it('recovers the restore controls after a rejected callback', async () => {
    render(
      <HistoryPanel
        report={setupHistory()}
        reportId="report-1"
        onVersionRestore={vi.fn().mockRejectedValue(new Error('Offline'))}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Version 1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'restoreToVersion' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('versionRestoreFailed'))
    expect(screen.getByRole('button', { name: 'restoreToVersion' })).toBeEnabled()
  })

  it('does not offer a restore action without a restore handler', () => {
    render(<HistoryPanel report={setupHistory()} reportId="report-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Version 1/ }))
    expect(screen.queryByRole('button', { name: 'restoreToVersion' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'compare' }))
    fireEvent.click(screen.getByRole('button', { name: /Version 1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Version 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'compare (2)' }))
    expect(screen.queryByRole('button', { name: 'Comparison restore' })).not.toBeInTheDocument()
  })

  it('allows the current version to stay collapsed after its initial expansion', () => {
    render(<HistoryPanel report={setupHistory()} reportId="report-1" />)
    const current = screen.getByRole('button', { name: /Version 3/ })
    expect(current).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(current)
    expect(current).toHaveAttribute('aria-expanded', 'false')
  })
})
