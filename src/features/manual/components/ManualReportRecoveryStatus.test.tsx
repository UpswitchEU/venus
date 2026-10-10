import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ManualReportRecoveryStatus } from './ManualReportRecoveryStatus'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
const base = {
  recovery: { failure: null, saving: false, blocked: false, scheduled: false, retry: vi.fn() },
  hasReport: true,
  pdfStale: true,
  pdfFailed: true,
  pdfRetrying: false,
  retryPdf: vi.fn(),
}
describe('one report status', () => {
  it('suppresses downstream PDF actions during a save failure', () => {
    render(
      <ManualReportRecoveryStatus
        {...base}
        recovery={{
          ...base.recovery,
          blocked: true,
          failure: { kind: 'temporary', status: 503, message: 'unavailable' },
        }}
      />
    )
    expect(screen.getByText('saveFailed')).toBeVisible()
    expect(screen.queryByText('pdfFailed')).toBeNull()
    expect(screen.getByRole('button', { name: 'retrySave' })).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('offers download only after saves and the matching PDF are ready', () => {
    const view = render(
      <ManualReportRecoveryStatus {...base} pdfStale={false} downloadPdf={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'downloadPdf' })).toBeEnabled()
    view.rerender(
      <ManualReportRecoveryStatus
        {...base}
        pdfStale={false}
        downloadPdf={vi.fn()}
        recovery={{ ...base.recovery, saving: true, blocked: true }}
      />
    )
    expect(screen.queryByRole('button', { name: 'downloadPdf' })).toBeNull()
  })

  it('opens billing in another tab only for a confirmed billing manager', () => {
    const view = render(
      <ManualReportRecoveryStatus
        {...base}
        recovery={{
          ...base.recovery,
          blocked: true,
          failure: { kind: 'subscription', message: 'required', canManageBilling: true },
        }}
      />
    )
    const link = screen.getByRole('link', { name: 'manageSubscription' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('href')).toMatch(/\/en\/advisor\/settings\?tab=billing$/)
    view.rerender(
      <ManualReportRecoveryStatus
        {...base}
        recovery={{
          ...base.recovery,
          blocked: true,
          failure: { kind: 'subscription', message: 'required', canManageBilling: false },
        }}
      />
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('askOwner')).toBeVisible()
  })
})
