import { act, renderHook } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindAccountingReconnectOAuth,
  consumeReadyAccountingReconnect,
  persistAccountingReconnectIntent,
} from '@/features/manual/utils/accountingReconnectResume'
import { accountingAPI, type IntegrationStatus } from '@/services/api/accounting'
import type { ManualValuationFormData } from '@/types/valuation'
import {
  encodeSilverfinOAuthState,
  persistSilverfinOAuthState,
} from '@/utils/silverfin-oauth-state'
import { useManualAccountingImportController } from './useManualAccountingImportController'

const messages = {
  importUnavailable: 'Accounting imports are unavailable on this plan.',
  importFailedTitle: 'Import failed',
  bizzcontrolForecastImportedDescription: 'Bizzcontrol forecast imported.',
  octopusForecastImportedDescription: 'Octopus forecast imported.',
  batchSuccessDescription: (score: number) => `Quality ${score}`,
  incompleteYearsSkippedDescription: (count: number) => `${count} incomplete years skipped.`,
  batchSuccessTitle: ({ years, provider }: { years: number; provider: string }) =>
    `${provider} imported ${years} years`,
}

function renderController(integrationsEnabled: boolean) {
  const setFormData = vi.fn() as Dispatch<SetStateAction<ManualValuationFormData>>
  return renderHook(() =>
    useManualAccountingImportController({
      currentFilingYear: 2026,
      integrationsEnabled,
      messages,
      setFormData,
    })
  )
}

describe('useManualAccountingImportController', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not fetch accounting integration status when integrations are disabled', async () => {
    const getAllIntegrationStatus = vi
      .spyOn(accountingAPI, 'getAllIntegrationStatus')
      .mockResolvedValue([])

    const { result } = renderController(false)

    await act(async () => {
      await result.current.handleOpenLiveAccountingImport()
    })

    expect(getAllIntegrationStatus).not.toHaveBeenCalled()
    expect(result.current.liveImportProviderName).toBeNull()
    expect(result.current.importAccountingError).toBe(
      'Accounting imports are unavailable on this plan.'
    )
    expect(result.current.openingLiveAccountingImport).toBe(false)
  })

  it('coalesces duplicate live import opens while status is already loading', async () => {
    let resolveStatuses: ((statuses: IntegrationStatus[]) => void) | null = null
    const getAllIntegrationStatus = vi
      .spyOn(accountingAPI, 'getAllIntegrationStatus')
      .mockImplementation(
        () =>
          new Promise<IntegrationStatus[]>((resolve) => {
            resolveStatuses = resolve
          })
      )

    const { result } = renderController(true)

    let firstOpen: Promise<void> = Promise.resolve()
    let secondOpen: Promise<void> = Promise.resolve()
    act(() => {
      firstOpen = result.current.handleOpenLiveAccountingImport()
      secondOpen = result.current.handleOpenLiveAccountingImport()
    })

    expect(getAllIntegrationStatus).toHaveBeenCalledTimes(1)
    expect(result.current.openingLiveAccountingImport).toBe(true)

    await act(async () => {
      resolveStatuses?.([])
      await Promise.all([firstOpen, secondOpen])
    })

    expect(result.current.openingLiveAccountingImport).toBe(false)
    expect(result.current.importAccountingError).toBe(
      'Accounting imports are unavailable on this plan.'
    )
  })

  it('keeps a live import open flow current while background status refreshes run', async () => {
    const connectedBizzcontrol: IntegrationStatus = {
      provider: 'bizzcontrol',
      is_connected: true,
      company_name: 'Acme BV',
    }
    let resolveCompanies:
      | ((value: {
          administrations: { administration_id: string; name: string }[]
          connection_id: string
        }) => void)
      | null = null
    vi.spyOn(accountingAPI, 'getAllIntegrationStatus').mockResolvedValue([connectedBizzcontrol])
    vi.spyOn(accountingAPI, 'getBizzcontrolCompanies').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCompanies = resolve
        })
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    const { result } = renderController(true)

    await act(async () => {
      await Promise.resolve()
    })

    let openPromise: Promise<void> = Promise.resolve()
    act(() => {
      openPromise = result.current.handleOpenLiveAccountingImport()
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.bizzcontrolImport.open).toBe(true)
    expect(result.current.bizzcontrolImport.isLoadingCompanies).toBe(true)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await act(async () => {
      resolveCompanies?.({
        administrations: [{ administration_id: 'adm-1', name: 'Acme BV' }],
        connection_id: 'conn-1',
      })
      await openPromise
    })

    expect(result.current.bizzcontrolImport.open).toBe(true)
    expect(result.current.bizzcontrolImport.isLoadingCompanies).toBe(false)
    expect(result.current.bizzcontrolImport.companies).toEqual([
      { administration_id: 'adm-1', name: 'Acme BV' },
    ])
  })

  it('resyncs, replaces stale actuals, and publishes one authoritative resume after OAuth', async () => {
    const staleDraft: ManualValuationFormData = {
      companyName: 'Source Honest BV',
      businessType: 'services',
      industry: 'services',
      country: 'BE',
      yearFounded: '2010',
      businessStructure: 'company',
      ownerManagers: 1,
      fteEmployees: 5,
      yearlyFinancials: [{ year: '2025', revenue: 100_000, ebitda: 100_000 }],
    }
    persistAccountingReconnectIntent(sessionStorage, {
      provider: 'silverfin',
      clientId: 'client-1',
      reportId: 'report-1',
      formData: staleDraft,
    })
    const nonce = 'nonce-1'
    persistSilverfinOAuthState(nonce)
    bindAccountingReconnectOAuth(sessionStorage, {
      provider: 'silverfin',
      clientId: 'client-1',
      nonce,
    })
    sessionStorage.setItem('upswitch_silverfin_oauth_in_progress', '1')
    const state = encodeSilverfinOAuthState('firm-1', nonce)
    window.history.replaceState(
      {},
      '',
      `/?code=oauth-code&state=${encodeURIComponent(state)}&silverfin_connect=1&clientId=client-1`
    )

    vi.spyOn(accountingAPI, 'connectSilverfin').mockResolvedValue({
      success: true,
      message: 'connected',
    })
    vi.spyOn(accountingAPI, 'resyncClient').mockResolvedValue({ success: true })
    vi.spyOn(accountingAPI, 'getClientValuationFinancials').mockResolvedValue({
      provider: 'silverfin',
      anchor_year: 2023,
      last_successful_sync_at: '2026-08-24T18:00:00.000Z',
      years: [
        {
          fiscal_year: 2023,
          revenue: 500_000,
          ebitda: 100_000,
          source_provider: 'silverfin',
          source_kind: 'live_accounting',
          quality_state: 'ready',
        },
      ],
      unavailable_years: [{ year: 2025, reason: 'incomplete_operating_pair' }],
    })
    vi.spyOn(accountingAPI, 'getAllIntegrationStatus').mockResolvedValue([])
    const setFormData = vi.fn() as Dispatch<SetStateAction<ManualValuationFormData>>

    renderHook(() =>
      useManualAccountingImportController({
        currentFilingYear: 2026,
        integrationsEnabled: true,
        messages,
        setFormData,
      })
    )

    await act(async () => {
      await vi.waitFor(() => expect(accountingAPI.getClientValuationFinancials).toHaveBeenCalled())
    })

    expect(accountingAPI.resyncClient).toHaveBeenCalledWith('client-1', { force: true })
    expect(setFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        yearlyFinancials: [
          expect.objectContaining({ year: '2023', revenue: 500_000, ebitda: 100_000 }),
        ],
      })
    )
    expect(new URLSearchParams(window.location.search).get('resume_calculation')).toBe('1')
    const ready = consumeReadyAccountingReconnect(sessionStorage, {
      clientId: 'client-1',
      reportId: 'report-1',
    })
    expect(ready).toMatchObject({ phase: 'ready', anchorYear: 2023 })
    expect(
      consumeReadyAccountingReconnect(sessionStorage, {
        clientId: 'client-1',
        reportId: 'report-1',
      })
    ).toBeNull()
  })

  it('imports only complete operating pairs and preserves their source metadata', async () => {
    vi.spyOn(accountingAPI, 'getAllIntegrationStatus').mockResolvedValue([
      { provider: 'bizzcontrol', is_connected: true, company_name: 'Acme BV' },
    ])
    vi.spyOn(accountingAPI, 'getBizzcontrolCompanies').mockResolvedValue({
      administrations: [{ administration_id: 'adm-1', name: 'Acme BV' }],
      connection_id: 'connection-1',
    })
    vi.spyOn(accountingAPI, 'getBizzcontrolFinancialDataBatch').mockResolvedValue({
      years: [
        {
          source: 'bizzcontrol',
          synced_at: '2026-08-24T18:00:00.000Z',
          quality_score: 0.9,
          data: {
            fiscal_year: 2024,
            revenue: 700_000,
            ebitda: 140_000,
            source_provider: 'bizzcontrol',
            source_kind: 'live_accounting',
            source_digest: 'digest-2024',
            quality_state: 'ready',
          },
        },
        {
          source: 'bizzcontrol',
          quality_score: 1,
          data: { fiscal_year: 2025, revenue: 800_000 },
        },
      ],
    })
    const setFormData = vi.fn() as Dispatch<SetStateAction<ManualValuationFormData>>
    const { result } = renderHook(() =>
      useManualAccountingImportController({
        currentFilingYear: 2026,
        integrationsEnabled: true,
        messages,
        setFormData,
      })
    )

    await act(async () => {
      await result.current.handleOpenLiveAccountingImport()
    })
    act(() => result.current.bizzcontrolImport.setSelectedCompanyId('adm-1'))
    await act(async () => {
      await result.current.bizzcontrolImport.handleConfirmImport()
    })

    const updater = setFormData.mock.calls.at(-1)?.[0]
    expect(typeof updater).toBe('function')
    const initial: ManualValuationFormData = {
      companyName: 'Acme BV',
      businessType: 'services',
      industry: 'services',
      country: 'BE',
      yearFounded: '2010',
      businessStructure: 'company',
      ownerManagers: 1,
      fteEmployees: 5,
      yearlyFinancials: [{ year: '2023', revenue: 600_000, ebitda: 100_000 }],
    }
    const updated = (updater as (previous: ManualValuationFormData) => ManualValuationFormData)(
      initial
    )
    expect(updated.yearlyFinancials).toEqual([
      expect.objectContaining({
        year: '2024',
        revenue: 700_000,
        ebitda: 140_000,
        source_provider: 'bizzcontrol',
        source_kind: 'live_accounting',
        source_digest: 'digest-2024',
        quality_state: 'ready',
      }),
      initial.yearlyFinancials[0],
    ])
    expect(updated.yearlyFinancials).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ year: '2025' })])
    )
  })
})
