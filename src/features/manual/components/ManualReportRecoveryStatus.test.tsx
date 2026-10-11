import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ManualReportRecoveryStatus } from './ManualReportRecoveryStatus'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
const auth = vi.hoisted(() => ({ role: 'accountant' as string | undefined }))
vi.mock('../../../lib/auth/store', () => ({
  useAuthStore: (selector: (state: { user: { role?: string } }) => unknown) =>
    selector({ user: { role: auth.role } }),
}))
const base = {
  recovery: { failure: null, saving: false, blocked: false, scheduled: false, retry: vi.fn() },
  hasReport: true,
  pdfStale: true,
  pdfFailed: true,
  pdfRetrying: false,
  retryPdf: vi.fn(),
}
describe('one report status', () => {
  beforeEach(() => {
    auth.role = 'accountant'
  })
  it('requires an updated calculation before offering an old PDF or a PDF retry', () => {
    const view = render(
      <ManualReportRecoveryStatus
        {...base}
        calculationStale
        updateValuationFormId="manual-valuation-inputs"
        downloadPdf={vi.fn()}
      />
    )
    expect(screen.getByText('calculationStale')).toBeVisible()
    expect(screen.queryByText('pdfFailed')).toBeNull()
    expect(screen.queryByRole('button', { name: 'retryPdf' })).toBeNull()
    expect(screen.getByRole('button', { name: 'updateValuation' })).toHaveAttribute(
      'form',
      'manual-valuation-inputs'
    )
    expect(screen.getByRole('button', { name: 'updateValuation' })).toHaveAttribute(
      'type',
      'submit'
    )
    view.rerender(
      <ManualReportRecoveryStatus
        {...base}
        calculationStale
        pdfStale={false}
        downloadPdf={vi.fn()}
      />
    )
    expect(screen.queryByText('saved')).toBeNull()
    expect(screen.queryByRole('button', { name: 'downloadPdf' })).toBeNull()
  })
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

  it.each([
    'buyer',
    'seller',
    undefined,
  ])('keeps the subscription gate without inventing a firm owner for %s', (role) => {
    auth.role = role
    render(
      <ManualReportRecoveryStatus
        {...base}
        downloadPdf={vi.fn()}
        recovery={{
          ...base.recovery,
          blocked: true,
          failure: { kind: 'subscription', message: 'required', canManageBilling: false },
        }}
      />
    )
    expect(screen.getByText('accountSubscription')).toBeVisible()
    expect(screen.getByText('accountSubscriptionHelp')).toBeVisible()
    expect(screen.queryByText('askOwner')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
