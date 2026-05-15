'use client'

import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { coalesceFiniteNumber } from '@/lib/omniPreview'
import {
  type AccountingAdministration,
  type AccountingBatchPayload,
  type AccountingImportProvider,
  accountingAPI,
  accountingProviderDisplayName,
  type IntegrationStatus,
  parseAccountingApiError,
  pickConnectedVenusBatchImportStatus,
} from '@/services/api/accounting'
import type { ManualValuationFormData, YearDataInput, YearlyFinancials } from '@/types/valuation'
import { getCurrentFilingYear } from '@/utils/fiscalYear'
import { mergeImportedLedgerAnalysisIntoBusinessContext } from '@/utils/mergeImportedLedgerAnalysisIntoBusinessContext'
import { decodeSilverfinOAuthState } from '@/utils/silverfin-oauth-state'

type LiveBatchImportProvider = 'bizzcontrol' | 'octopus'
type ImportHistoryRange = '3' | '5'

export interface ManualAccountingImportMessages {
  importUnavailable: string
  importFailedTitle: string
  bizzcontrolForecastImportedDescription: string
  octopusForecastImportedDescription: string
  batchSuccessDescription: (score: number) => string
  batchSuccessTitle: (values: { years: number; provider: string }) => string
}

interface UseManualAccountingImportControllerParams {
  currentFilingYear: number
  messages: ManualAccountingImportMessages
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
}

/** Bizzcontrol / Octopus support pull-to-form in Venus; other providers sync via Mercury first. */
export function venusLiveBatchImportProvider(
  row: IntegrationStatus | null
): LiveBatchImportProvider | null {
  if (!row?.is_connected) return null
  if (row.provider === 'bizzcontrol' || row.provider === 'octopus') {
    return row.provider
  }
  return null
}

export function useManualAccountingImportController({
  currentFilingYear,
  messages,
  setFormData,
}: UseManualAccountingImportControllerParams) {
  const [importBatchData, setImportBatchData] = useState<AccountingBatchPayload | null>(null)
  const [importAccountingError, setImportAccountingError] = useState<string | null>(null)
  const [showBizzcontrolImportModal, setShowBizzcontrolImportModal] = useState(false)
  const [bizzcontrolCompanies, setBizzcontrolCompanies] = useState<AccountingAdministration[]>([])
  const [loadingBizzcontrolCompanies, setLoadingBizzcontrolCompanies] = useState(false)
  const [bizzcontrolImportError, setBizzcontrolImportError] = useState<string | null>(null)
  const [selectedBizzcontrolCompanyId, setSelectedBizzcontrolCompanyId] = useState('')
  const [bizzcontrolHistoryRange, setBizzcontrolHistoryRange] = useState<ImportHistoryRange>('3')
  const [bizzcontrolManualOverride, setBizzcontrolManualOverride] = useState(true)
  const [importingBizzcontrolBatch, setImportingBizzcontrolBatch] = useState(false)
  const [showOctopusImportModal, setShowOctopusImportModal] = useState(false)
  const [octopusCompanies, setOctopusCompanies] = useState<AccountingAdministration[]>([])
  const [loadingOctopusCompanies, setLoadingOctopusCompanies] = useState(false)
  const [octopusImportError, setOctopusImportError] = useState<string | null>(null)
  const [selectedOctopusCompanyId, setSelectedOctopusCompanyId] = useState('')
  const [octopusHistoryRange, setOctopusHistoryRange] = useState<ImportHistoryRange>('3')
  const [octopusManualOverride, setOctopusManualOverride] = useState(true)
  const [importingOctopusBatch, setImportingOctopusBatch] = useState(false)
  const [venusLiveImportProvider, setVenusLiveImportProvider] =
    useState<LiveBatchImportProvider | null>(null)
  const [openingLiveAccountingImport, setOpeningLiveAccountingImport] = useState(false)
  const venusLiveImportFetchGenRef = useRef(0)
  const accountingRefetchThrottle = useRef(0)

  const loadAccountingIntegrationStatus = useCallback(async () => {
    const gen = ++venusLiveImportFetchGenRef.current
    try {
      const statuses = await accountingAPI.getAllIntegrationStatus()
      if (gen !== venusLiveImportFetchGenRef.current) return
      const row = pickConnectedVenusBatchImportStatus(statuses)
      setVenusLiveImportProvider(venusLiveBatchImportProvider(row))
    } catch {
      if (gen === venusLiveImportFetchGenRef.current) {
        setVenusLiveImportProvider(null)
      }
    }
  }, [])

  const notifyImportFailure = useCallback(
    (message: string) => {
      import('sonner').then(({ toast }) =>
        toast.error(messages.importFailedTitle || 'Import failed', { description: message })
      )
    },
    [messages.importFailedTitle]
  )

  const handleOpenLiveAccountingImport = useCallback(async () => {
    setImportAccountingError(null)
    setOpeningLiveAccountingImport(true)
    const gen = ++venusLiveImportFetchGenRef.current
    try {
      const statuses = await accountingAPI.getAllIntegrationStatus()
      if (gen !== venusLiveImportFetchGenRef.current) return
      const row = pickConnectedVenusBatchImportStatus(statuses)
      setVenusLiveImportProvider(venusLiveBatchImportProvider(row))

      if (row?.provider === 'bizzcontrol') {
        setBizzcontrolImportError(null)
        setShowBizzcontrolImportModal(true)
        setLoadingBizzcontrolCompanies(true)
        try {
          const res = await accountingAPI.getBizzcontrolCompanies()
          setBizzcontrolCompanies(res.administrations)
          setSelectedBizzcontrolCompanyId((prev) => {
            if (prev) return prev
            if (res.administrations.length === 1) return res.administrations[0].administration_id
            return ''
          })
        } catch (error) {
          setBizzcontrolImportError(parseAccountingApiError(error))
        } finally {
          setLoadingBizzcontrolCompanies(false)
        }
        return
      }

      if (row?.provider === 'octopus') {
        setOctopusImportError(null)
        setShowOctopusImportModal(true)
        setLoadingOctopusCompanies(true)
        try {
          const res = await accountingAPI.getOctopusCompanies()
          setOctopusCompanies(res.administrations)
          setSelectedOctopusCompanyId((prev) => {
            if (prev) return prev
            if (res.administrations.length === 1) return res.administrations[0].administration_id
            return ''
          })
        } catch (error) {
          setOctopusImportError(parseAccountingApiError(error))
        } finally {
          setLoadingOctopusCompanies(false)
        }
        return
      }

      setImportAccountingError(messages.importUnavailable)
    } catch (error) {
      const message = parseAccountingApiError(error)
      setImportAccountingError(message)
      notifyImportFailure(message)
    } finally {
      setOpeningLiveAccountingImport(false)
    }
  }, [messages.importUnavailable, notifyImportFailure])

  useEffect(() => {
    void loadAccountingIntegrationStatus()
  }, [loadAccountingIntegrationStatus])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - accountingRefetchThrottle.current < 2500) return
      accountingRefetchThrottle.current = now
      void loadAccountingIntegrationStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [loadAccountingIntegrationStatus])

  const applyImportedBatch = useCallback(
    (
      provider: Extract<AccountingImportProvider, 'silverfin' | 'bizzcontrol' | 'octopus'>,
      batch: AccountingBatchPayload
    ) => {
      setImportBatchData(batch)
      setImportAccountingError(null)
      setFormData((prev) => {
        const merged = [...prev.yearlyFinancials]
        for (const yearPayload of batch.years) {
          const year = String(yearPayload.data.fiscal_year ?? getCurrentFilingYear())
          const raw = yearPayload.data as { capex?: number; depreciation?: number }
          const nextYear: YearlyFinancials = {
            year,
            revenue: coalesceFiniteNumber(yearPayload.data.revenue),
            ebitda: coalesceFiniteNumber(yearPayload.data.ebitda),
            depreciation:
              yearPayload.data.depreciation != null
                ? Number(yearPayload.data.depreciation)
                : undefined,
            capex: raw.capex != null ? Number(raw.capex) : undefined,
            cash:
              yearPayload.data.cash_and_equivalents != null
                ? Number(yearPayload.data.cash_and_equivalents)
                : undefined,
            current_assets:
              yearPayload.data.current_assets != null
                ? Number(yearPayload.data.current_assets)
                : undefined,
            current_liabilities:
              yearPayload.data.current_liabilities != null
                ? Number(yearPayload.data.current_liabilities)
                : undefined,
            accounts_receivable:
              yearPayload.data.accounts_receivable != null
                ? Number(yearPayload.data.accounts_receivable)
                : undefined,
            inventory:
              yearPayload.data.inventory != null ? Number(yearPayload.data.inventory) : undefined,
            short_term_debt:
              yearPayload.data.short_term_financial_debt != null
                ? Number(yearPayload.data.short_term_financial_debt)
                : undefined,
            total_debt: (() => {
              const ltd = yearPayload.data.long_term_debt
              const std = yearPayload.data.short_term_financial_debt
              if (ltd == null && std == null) return undefined
              return coalesceFiniteNumber(ltd, 0) + coalesceFiniteNumber(std, 0)
            })(),
          }
          const index = merged.findIndex((entry) => entry.year === year)
          if (index >= 0) merged[index] = { ...merged[index], ...nextYear }
          else merged.push(nextYear)
        }
        merged.sort((a, b) => Number(b.year) - Number(a.year))

        const forecastFromBatch = batch.forecast_years_data
        let nextForecast: YearDataInput[] | undefined
        if (forecastFromBatch && forecastFromBatch.length > 0) {
          nextForecast = forecastFromBatch.map((row) => ({
            year: row.year,
            revenue: row.revenue,
            ebitda: row.ebitda ?? 0,
            capex: row.capex,
            is_forecast: row.is_forecast ?? true,
          }))
        }

        const prevBusinessContext =
          prev.business_context && typeof prev.business_context === 'object'
            ? (prev.business_context as Record<string, unknown>)
            : undefined
        const mergedContext = mergeImportedLedgerAnalysisIntoBusinessContext(
          prevBusinessContext,
          batch,
          provider
        )

        return {
          ...prev,
          yearlyFinancials: merged,
          ...(nextForecast != null ? { forecast_years_data: nextForecast } : {}),
          business_context: mergedContext as ManualValuationFormData['business_context'],
        }
      })

      import('sonner').then(({ toast }) => {
        const mappedYears = batch.years.length
        const qualityScore =
          batch.years.length > 0
            ? Math.round(
                (batch.years.reduce((sum, year) => sum + (year.quality_score ?? 0), 0) /
                  batch.years.length) *
                  100
              )
            : 0
        const baseDescription = messages.batchSuccessDescription(qualityScore)
        const forecastExtra =
          provider === 'bizzcontrol'
            ? messages.bizzcontrolForecastImportedDescription
            : provider === 'octopus'
              ? messages.octopusForecastImportedDescription
              : ''
        const description =
          (provider === 'bizzcontrol' || provider === 'octopus') &&
          batch.forecast_years_data &&
          batch.forecast_years_data.length > 0
            ? `${baseDescription} ${forecastExtra}`
            : baseDescription
        toast.success(
          messages.batchSuccessTitle({
            years: mappedYears,
            provider: accountingProviderDisplayName(provider),
          }),
          { description }
        )
      })
    },
    [messages, setFormData]
  )

  const handleConfirmBizzcontrolImport = useCallback(async () => {
    if (!selectedBizzcontrolCompanyId) return
    setImportingBizzcontrolBatch(true)
    setBizzcontrolImportError(null)
    try {
      const endYear = currentFilingYear
      const span = bizzcontrolHistoryRange === '5' ? 5 : 3
      const startYear = endYear - (span - 1)
      const batch = await accountingAPI.getBizzcontrolFinancialDataBatch(startYear, endYear, {
        companyId: selectedBizzcontrolCompanyId,
      })
      applyImportedBatch('bizzcontrol', batch)
      setShowBizzcontrolImportModal(false)
    } catch (error) {
      const message = parseAccountingApiError(error)
      setBizzcontrolImportError(message)
      notifyImportFailure(message)
    } finally {
      setImportingBizzcontrolBatch(false)
    }
  }, [
    selectedBizzcontrolCompanyId,
    bizzcontrolHistoryRange,
    currentFilingYear,
    applyImportedBatch,
    notifyImportFailure,
  ])

  const handleConfirmOctopusImport = useCallback(async () => {
    if (!selectedOctopusCompanyId) return
    setImportingOctopusBatch(true)
    setOctopusImportError(null)
    try {
      const endYear = currentFilingYear
      const span = octopusHistoryRange === '5' ? 5 : 3
      const startYear = endYear - (span - 1)
      const batch = await accountingAPI.getOctopusFinancialDataBatch(startYear, endYear, {
        companyId: selectedOctopusCompanyId,
      })
      applyImportedBatch('octopus', batch)
      setShowOctopusImportModal(false)
    } catch (error) {
      const message = parseAccountingApiError(error)
      setOctopusImportError(message)
      notifyImportFailure(message)
    } finally {
      setImportingOctopusBatch(false)
    }
  }, [
    selectedOctopusCompanyId,
    octopusHistoryRange,
    currentFilingYear,
    applyImportedBatch,
    notifyImportFailure,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const firmIdFromQuery = params.get('firm_id')?.trim() || null
    const firmIdFromState = decodeSilverfinOAuthState(params.get('state'))
    const resolvedFirmId = firmIdFromQuery || firmIdFromState
    const silverfinConnectRequested =
      params.get('silverfin_connect') === '1' ||
      window.sessionStorage.getItem('upswitch_silverfin_oauth_in_progress') === '1'
    if (!code || !resolvedFirmId || !silverfinConnectRequested) return

    const oauthLockKey = `silverfin_oauth_${code}`
    if (window.sessionStorage.getItem(oauthLockKey)) {
      params.delete('code')
      params.delete('state')
      params.delete('firm_id')
      params.delete('silverfin_connect')
      const nextSearch = params.toString()
      window.history.replaceState(
        {},
        '',
        nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname
      )
      return
    }
    window.sessionStorage.setItem(oauthLockKey, '1')

    const redirectUrl = new URL(window.location.href)
    redirectUrl.searchParams.delete('code')
    redirectUrl.searchParams.delete('state')
    redirectUrl.searchParams.delete('firm_id')

    accountingAPI
      .connectSilverfin(code, redirectUrl.toString(), resolvedFirmId)
      .then(async () => {
        window.sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
        window.sessionStorage.removeItem(oauthLockKey)
        await loadAccountingIntegrationStatus()
        const cleanedUrl = new URL(window.location.href)
        cleanedUrl.searchParams.delete('code')
        cleanedUrl.searchParams.delete('state')
        cleanedUrl.searchParams.delete('firm_id')
        cleanedUrl.searchParams.delete('silverfin_connect')
        window.history.replaceState({}, '', cleanedUrl.toString())
      })
      .catch((error) => {
        import('sonner').then(({ toast }) =>
          toast.error(parseAccountingApiError(error) || 'Silverfin connection failed')
        )
        window.sessionStorage.removeItem(oauthLockKey)
        const cleanedUrl = new URL(window.location.href)
        cleanedUrl.searchParams.delete('code')
        cleanedUrl.searchParams.delete('state')
        cleanedUrl.searchParams.delete('firm_id')
        cleanedUrl.searchParams.delete('silverfin_connect')
        window.history.replaceState({}, '', cleanedUrl.toString())
      })
  }, [loadAccountingIntegrationStatus])

  const setBizzcontrolOpen = useCallback((open: boolean) => {
    setShowBizzcontrolImportModal(open)
    if (!open) setBizzcontrolImportError(null)
  }, [])

  const setOctopusOpen = useCallback((open: boolean) => {
    setShowOctopusImportModal(open)
    if (!open) setOctopusImportError(null)
  }, [])

  return {
    importAccountingError,
    importBatchData,
    liveImportProviderName: venusLiveImportProvider
      ? accountingProviderDisplayName(venusLiveImportProvider)
      : null,
    openingLiveAccountingImport,
    handleOpenLiveAccountingImport,
    bizzcontrolImport: {
      companies: bizzcontrolCompanies,
      error: bizzcontrolImportError,
      handleConfirmImport: handleConfirmBizzcontrolImport,
      historyRange: bizzcontrolHistoryRange,
      isImporting: importingBizzcontrolBatch,
      isLoadingCompanies: loadingBizzcontrolCompanies,
      manualOverride: bizzcontrolManualOverride,
      open: showBizzcontrolImportModal,
      selectedCompanyId: selectedBizzcontrolCompanyId,
      setHistoryRange: setBizzcontrolHistoryRange,
      setManualOverride: setBizzcontrolManualOverride,
      setOpen: setBizzcontrolOpen,
      setSelectedCompanyId: setSelectedBizzcontrolCompanyId,
    },
    octopusImport: {
      companies: octopusCompanies,
      error: octopusImportError,
      handleConfirmImport: handleConfirmOctopusImport,
      historyRange: octopusHistoryRange,
      isImporting: importingOctopusBatch,
      isLoadingCompanies: loadingOctopusCompanies,
      manualOverride: octopusManualOverride,
      open: showOctopusImportModal,
      selectedCompanyId: selectedOctopusCompanyId,
      setHistoryRange: setOctopusHistoryRange,
      setManualOverride: setOctopusManualOverride,
      setOpen: setOctopusOpen,
      setSelectedCompanyId: setSelectedOctopusCompanyId,
    },
  }
}
