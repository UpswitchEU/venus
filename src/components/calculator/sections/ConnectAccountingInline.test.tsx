import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectAccountingInline } from './ConnectAccountingInline'

// Translations echo the key (params ignored) so assertions read against the key.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      animate,
      initial,
      transition,
      children,
      ...props
    }: {
      animate?: unknown
      initial?: unknown
      transition?: unknown
      children?: ReactNode
    }) => <div {...props}>{children}</div>,
  },
}))

const openInNewTab = vi.fn()
const mercuryPath = vi.fn(() => 'https://mercury.test/en/advisor/settings?tab=integrations')
vi.mock('../agent-action-cards/shared', () => ({
  openInNewTab: (url: string) => openInNewTab(url),
  mercuryPath: (...args: unknown[]) => mercuryPath(...args),
}))

vi.mock('@/design-system/components/Button', () => ({
  AuroraButton: ({
    children,
    onClick,
    loading,
    loadingScreenReaderLabel,
    ...props
  }: {
    children?: ReactNode
    onClick?: () => void
    loading?: boolean
    loadingScreenReaderLabel?: string
  } & Record<string, unknown>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

describe('ConnectAccountingInline (BET-316 Door 1)', () => {
  beforeEach(() => {
    openInNewTab.mockReset()
    mercuryPath.mockClear()
    mercuryPath.mockReturnValue('https://mercury.test/en/advisor/settings?tab=integrations')
  })

  it('shows the verified provenance badge once figures are imported', () => {
    render(
      <ConnectAccountingInline
        integrationsEnabled
        liveImportProviderName="Bizzcontrol"
        imported
        importBusy={false}
        openingImport={false}
        onImport={vi.fn()}
      />
    )
    expect(screen.getByText('verifiedTitle')).toBeInTheDocument()
    expect(screen.getByText('verifiedBody')).toBeInTheDocument()
  })

  it('offers a one-tap import when a Venus pull-provider is connected', () => {
    const onImport = vi.fn()
    render(
      <ConnectAccountingInline
        integrationsEnabled
        liveImportProviderName="Bizzcontrol"
        imported={false}
        importBusy={false}
        openingImport={false}
        onImport={onImport}
      />
    )
    expect(screen.getByText('descriptionConnected')).toBeInTheDocument()
    fireEvent.click(screen.getByText('importFromAccounting'))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('routes a not-yet-connected owner to the integrations settings', () => {
    render(
      <ConnectAccountingInline
        integrationsEnabled
        liveImportProviderName={null}
        imported={false}
        importBusy={false}
        openingImport={false}
        onImport={vi.fn()}
      />
    )
    expect(screen.getByText('descriptionDisconnected')).toBeInTheDocument()
    expect(screen.getByText('autofillReassurance')).toBeInTheDocument()
    fireEvent.click(screen.getByText('connectCta'))
    expect(mercuryPath).toHaveBeenCalledWith('en', '/advisor/settings', {
      tab: 'integrations',
      source: 'venus_financials',
    })
    expect(openInNewTab).toHaveBeenCalledTimes(1)
  })

  it('shows a Grow upgrade prompt instead of the connect route when integrations are locked', () => {
    render(
      <ConnectAccountingInline
        integrationsEnabled={false}
        liveImportProviderName={null}
        imported={false}
        importBusy={false}
        openingImport={false}
        onImport={vi.fn()}
      />
    )
    expect(screen.getByText('upgradeDescription')).toBeInTheDocument()
    expect(screen.getByText('upgradeReassurance')).toBeInTheDocument()
    fireEvent.click(screen.getByText('upgradeCta'))
    expect(mercuryPath).toHaveBeenCalledWith('en', '/pricing', { tab: 'business-owners' })
    expect(openInNewTab).toHaveBeenCalledTimes(1)
  })
})
