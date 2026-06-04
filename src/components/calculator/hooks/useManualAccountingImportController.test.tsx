import { act, renderHook } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountingAPI, type IntegrationStatus } from '@/services/api/accounting'
import type { ManualValuationFormData } from '@/types/valuation'
import { useManualAccountingImportController } from './useManualAccountingImportController'

const messages = {
  importUnavailable: 'Accounting imports are unavailable on this plan.',
  importFailedTitle: 'Import failed',
  bizzcontrolForecastImportedDescription: 'Bizzcontrol forecast imported.',
  octopusForecastImportedDescription: 'Octopus forecast imported.',
  batchSuccessDescription: (score: number) => `Quality ${score}`,
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
})
