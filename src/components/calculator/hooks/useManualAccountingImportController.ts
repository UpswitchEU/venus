'use client'

import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import {
  ACCOUNTING_RECONNECT_STATUS_EVENT,
  applyValuationSnapshotToReconnectDraft,
  beginAccountingReconnectHandoffResync,
  beginAccountingReconnectResync,
  markAccountingReconnectFailed,
  markAccountingReconnectReady,
} from '@/features/manual/utils/accountingReconnectResume'
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
import {
  consumeSilverfinOAuthState,
  decodeSilverfinOAuthStatePayload,
} from '@/utils/silverfin-oauth-state'

type LiveBatchImportProvider = 'bizzcontrol' | 'octopus'
type ImportHistoryRange = '3' | '5'

function publishAccountingReconnectStatus(input: {
  phase: 'resyncing' | 'failed'
  provider: string
  clientId: string
  failure?: string
}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ACCOUNTING_RECONNECT_STATUS_EVENT, { detail: input }))
}

export interface ManualAccountingImportMessages {
  importUnavailable: string
  importFailedTitle: string
  bizzcontrolForecastImportedDescription: string
  octopusForecastImportedDescription: string
  batchSuccessDescription: (score: number) => string
  incompleteYearsSkippedDescription: (count: number) => string
  batchSuccessTitle: (values: { years: number; provider: string }) => string
}

interface UseManualAccountingImportControllerParams {
  currentFilingYear: number
  integrationsEnabled: boolean
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
  integrationsEnabled,
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
  const openingLiveAccountingImportRef = useRef(false)
  const liveStatusFetchGenRef = useRef(0)
  const liveOpenImportRunIdRef = useRef(0)
  const statusFetchPromiseRef = useRef<Promise<IntegrationStatus[]> | null>(null)
  const accountingRefetchThrottle = useRef(0)

  const getAccountingIntegrationStatuses = useCallback(() => {
    if (statusFetchPromiseRef.current) return statusFetchPromiseRef.current
    const promise = accountingAPI.getAllIntegrationStatus()
    statusFetchPromiseRef.current = promise
    promise
      .finally(() => {
        if (statusFetchPromiseRef.current === promise) {
          statusFetchPromiseRef.current = null
        }
      })
      .catch(() => undefined)
    return promise
  }, [])

  const loadAccountingIntegrationStatus = useCallback(async () => {
    const gen = ++liveStatusFetchGenRef.current
    if (!integrationsEnabled) {
      setVenusLiveImportProvider(null)
      return
    }
    try {
      const statuses = await getAccountingIntegrationStatuses()
      if (gen !== liveStatusFetchGenRef.current) return
      const row = pickConnectedVenusBatchImportStatus(statuses)
      setVenusLiveImportProvider(venusLiveBatchImportProvider(row))
    } catch {
      if (gen === liveStatusFetchGenRef.current) {
        setVenusLiveImportProvider(null)
      }
    }
  }, [getAccountingIntegrationStatuses, integrationsEnabled])

  const notifyImportFailure = useCallback(
    (message: string) => {
      import('sonner').then(({ toast }) =>
        toast.error(messages.importFailedTitle || 'Import failed', { description: message })
      )
    },
    [messages.importFailedTitle]
  )

  const handleOpenLiveAccountingImport = useCallback(async () => {
    if (openingLiveAccountingImportRef.current) return
    setImportAccountingError(null)
    if (!integrationsEnabled) {
      setVenusLiveImportProvider(null)
      setImportAccountingError(messages.importUnavailable)
      setOpeningLiveAccountingImport(false)
      return
    }
    openingLiveAccountingImportRef.current = true
    setOpeningLiveAccountingImport(true)
    const runId = ++liveOpenImportRunIdRef.current
    const isCurrentOpenRun = () => liveOpenImportRunIdRef.current === runId
    try {
      const statuses = await getAccountingIntegrationStatuses()
      if (!isCurrentOpenRun()) return
      const row = pickConnectedVenusBatchImportStatus(statuses)
      setVenusLiveImportProvider(venusLiveBatchImportProvider(row))

      if (row?.provider === 'bizzcontrol') {
        setBizzcontrolImportError(null)
        setShowBizzcontrolImportModal(true)
        setLoadingBizzcontrolCompanies(true)
        try {
          const res = await accountingAPI.getBizzcontrolCompanies()
          if (!isCurrentOpenRun()) return
          setBizzcontrolCompanies(res.administrations)
          setSelectedBizzcontrolCompanyId((prev) => {
            if (prev) return prev
            if (res.administrations.length === 1) return res.administrations[0].administration_id
            return ''
          })
        } catch (error) {
          if (isCurrentOpenRun()) {
            setBizzcontrolImportError(parseAccountingApiError(error))
          }
        } finally {
          if (isCurrentOpenRun()) {
            setLoadingBizzcontrolCompanies(false)
          }
        }
        return
      }

      if (row?.provider === 'octopus') {
        setOctopusImportError(null)
        setShowOctopusImportModal(true)
        setLoadingOctopusCompanies(true)
        try {
          const res = await accountingAPI.getOctopusCompanies()
          if (!isCurrentOpenRun()) return
          setOctopusCompanies(res.administrations)
          setSelectedOctopusCompanyId((prev) => {
            if (prev) return prev
            if (res.administrations.length === 1) return res.administrations[0].administration_id
            return ''
          })
        } catch (error) {
          if (isCurrentOpenRun()) {
            setOctopusImportError(parseAccountingApiError(error))
          }
        } finally {
          if (isCurrentOpenRun()) {
            setLoadingOctopusCompanies(false)
          }
        }
        return
      }

      setImportAccountingError(messages.importUnavailable)
    } catch (error) {
      if (!isCurrentOpenRun()) return
      const message = parseAccountingApiError(error)
      setImportAccountingError(message)
      notifyImportFailure(message)
    } finally {
      if (isCurrentOpenRun()) {
        openingLiveAccountingImportRef.current = false
        setOpeningLiveAccountingImport(false)
      }
    }
  }, [
    getAccountingIntegrationStatuses,
    integrationsEnabled,
    messages.importUnavailable,
    notifyImportFailure,
  ])

  useEffect(() => {
    void loadAccountingIntegrationStatus()
  }, [loadAccountingIntegrationStatus])

  useEffect(() => {
    if (integrationsEnabled) return
    liveStatusFetchGenRef.current++
    liveOpenImportRunIdRef.current++
    openingLiveAccountingImportRef.current = false
    setOpeningLiveAccountingImport(false)
    setVenusLiveImportProvider(null)
    setShowBizzcontrolImportModal(false)
    setLoadingBizzcontrolCompanies(false)
    setShowOctopusImportModal(false)
    setLoadingOctopusCompanies(false)
  }, [integrationsEnabled])

  useEffect(() => {
    if (!integrationsEnabled) return
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - accountingRefetchThrottle.current < 2500) return
      accountingRefetchThrottle.current = now
      void loadAccountingIntegrationStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [integrationsEnabled, loadAccountingIntegrationStatus])

  const applyImportedBatch = useCallback(
    (
      provider: Extract<AccountingImportProvider, 'silverfin' | 'bizzcontrol' | 'octopus'>,
      batch: AccountingBatchPayload
    ) => {
      setImportBatchData(batch)
      setImportAccountingError(null)
      const completeActualYears = batch.years.filter((yearPayload) => {
        const revenue = Number(yearPayload.data.revenue)
        const ebitda = Number(yearPayload.data.ebitda)
        return (
          yearPayload.data.revenue != null &&
          yearPayload.data.ebitda != null &&
          Number.isFinite(revenue) &&
          Number.isFinite(ebitda)
        )
      })
      setFormData((prev) => {
        const merged = [...prev.yearlyFinancials]
        for (const yearPayload of completeActualYears) {
          const year = String(yearPayload.data.fiscal_year ?? getCurrentFilingYear())
          const raw = yearPayload.data as { capex?: number; depreciation?: number }
          const revenue = Number(yearPayload.data.revenue)
          const ebitda = Number(yearPayload.data.ebitda)
          const rawQualityState = yearPayload.data.quality_state
          const qualityState =
            rawQualityState === 'ready' ||
            rawQualityState === 'needs_review' ||
            rawQualityState === 'blocked' ||
            rawQualityState === 'attested_review'
              ? rawQualityState
              : undefined
          const nextYear: YearlyFinancials = {
            year,
            revenue,
            ebitda,
            source_provider:
              typeof yearPayload.data.source_provider === 'string'
                ? yearPayload.data.source_provider
                : provider,
            source_kind:
              typeof yearPayload.data.source_kind === 'string'
                ? yearPayload.data.source_kind
                : 'live_accounting',
            source_synced_at:
              typeof yearPayload.data.source_synced_at === 'string'
                ? yearPayload.data.source_synced_at
                : yearPayload.synced_at,
            quality_state: qualityState,
            source_digest:
              typeof yearPayload.data.source_digest === 'string'
                ? yearPayload.data.source_digest
                : undefined,
            attestation_id:
              typeof yearPayload.data.attestation_id === 'string'
                ? yearPayload.data.attestation_id
                : undefined,
            eligibility_reason:
              typeof yearPayload.data.eligibility_reason === 'string'
                ? yearPayload.data.eligibility_reason
                : undefined,
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
          const completeForecast = forecastFromBatch
            .filter(
              (row) =>
                row.revenue != null &&
                row.ebitda != null &&
                Number.isFinite(Number(row.revenue)) &&
                Number.isFinite(Number(row.ebitda))
            )
            .map((row) => ({
              year: row.year,
              revenue: Number(row.revenue),
              ebitda: Number(row.ebitda),
              capex: row.capex,
              is_forecast: row.is_forecast ?? true,
            }))
          if (completeForecast.length > 0) nextForecast = completeForecast
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
        const mappedYears = completeActualYears.length
        const skippedYears = batch.years.length - mappedYears
        const qualityScore =
          completeActualYears.length > 0
            ? Math.round(
                (completeActualYears.reduce((sum, year) => sum + (year.quality_score ?? 0), 0) /
                  completeActualYears.length) *
                  100
              )
            : 0
        const baseDescription = messages.batchSuccessDescription(qualityScore)
        const skippedDescription =
          skippedYears > 0 ? messages.incompleteYearsSkippedDescription(skippedYears) : ''
        const forecastExtra =
          provider === 'bizzcontrol'
            ? messages.bizzcontrolForecastImportedDescription
            : provider === 'octopus'
              ? messages.octopusForecastImportedDescription
              : ''
        const providerDescription =
          (provider === 'bizzcontrol' || provider === 'octopus') &&
          batch.forecast_years_data &&
          batch.forecast_years_data.length > 0
            ? `${baseDescription} ${forecastExtra}`
            : baseDescription
        const description = [providerDescription, skippedDescription].filter(Boolean).join(' ')
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
    const statePayload = decodeSilverfinOAuthStatePayload(params.get('state'))
    const firmIdFromState = statePayload?.firm_id ?? null
    const resolvedFirmId = firmIdFromQuery || firmIdFromState
    const silverfinConnectRequested =
      params.get('silverfin_connect') === '1' ||
      window.sessionStorage.getItem('upswitch_silverfin_oauth_in_progress') === '1'
    if (!code || !resolvedFirmId || !silverfinConnectRequested) return

    const stripSilverfinCallback = () => {
      const cleanedUrl = new URL(window.location.href)
      cleanedUrl.searchParams.delete('code')
      cleanedUrl.searchParams.delete('state')
      cleanedUrl.searchParams.delete('firm_id')
      cleanedUrl.searchParams.delete('silverfin_connect')
      window.history.replaceState({}, '', cleanedUrl.toString())
    }

    const oauthLockKey = `silverfin_oauth_${code}`
    if (window.sessionStorage.getItem(oauthLockKey)) {
      return
    }
    window.sessionStorage.setItem(oauthLockKey, '1')

    const stateCheck = consumeSilverfinOAuthState(statePayload?.nonce ?? null)
    const firmMismatch = Boolean(
      firmIdFromQuery && firmIdFromState && firmIdFromQuery !== firmIdFromState
    )
    const reconnectClientId = params.get('clientId')?.trim() || ''
    const claimedIntent =
      stateCheck.ok && !firmMismatch && statePayload?.nonce && reconnectClientId
        ? beginAccountingReconnectResync(window.sessionStorage, {
            provider: 'silverfin',
            clientId: reconnectClientId,
            nonce: statePayload.nonce,
          })
        : null
    if (!stateCheck.ok || firmMismatch || !claimedIntent) {
      const failure = 'Silverfin sign-in could not be verified. Start the reconnect flow again.'
      if (reconnectClientId) {
        markAccountingReconnectFailed(window.sessionStorage, {
          provider: 'silverfin',
          clientId: reconnectClientId,
          failure,
        })
        publishAccountingReconnectStatus({
          phase: 'failed',
          provider: 'silverfin',
          clientId: reconnectClientId,
          failure,
        })
      }
      window.sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
      window.sessionStorage.removeItem(oauthLockKey)
      stripSilverfinCallback()
      import('sonner').then(({ toast }) => toast.error(failure))
      return
    }
    publishAccountingReconnectStatus({
      phase: 'resyncing',
      provider: 'silverfin',
      clientId: reconnectClientId,
    })

    const redirectUrl = new URL(window.location.href)
    redirectUrl.searchParams.delete('code')
    redirectUrl.searchParams.delete('state')
    redirectUrl.searchParams.delete('firm_id')

    void (async () => {
      try {
        await accountingAPI.connectSilverfin(code, redirectUrl.toString(), resolvedFirmId)
        await accountingAPI.resyncClient(reconnectClientId, { force: true })
        const snapshot = await accountingAPI.getClientValuationFinancials(reconnectClientId)
        const correctedFormData = applyValuationSnapshotToReconnectDraft(
          claimedIntent.formData,
          snapshot
        )
        setFormData(correctedFormData)
        if (
          !markAccountingReconnectReady(window.sessionStorage, {
            provider: 'silverfin',
            clientId: reconnectClientId,
            formData: correctedFormData,
            anchorYear: snapshot.anchor_year,
            unavailableYears: snapshot.unavailable_years,
          })
        ) {
          throw new Error('The reconnect request expired before synchronization completed.')
        }
        await loadAccountingIntegrationStatus()
        window.sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
        window.sessionStorage.removeItem(oauthLockKey)
        stripSilverfinCallback()
        const resumeUrl = new URL(window.location.href)
        resumeUrl.searchParams.set('resume_calculation', '1')
        window.history.replaceState({}, '', resumeUrl.toString())
        window.dispatchEvent(new Event('upswitch:accounting-reconnect-ready'))
      } catch (error) {
        const message = parseAccountingApiError(error) || 'Silverfin connection failed'
        markAccountingReconnectFailed(window.sessionStorage, {
          provider: 'silverfin',
          clientId: reconnectClientId,
          failure: message,
        })
        publishAccountingReconnectStatus({
          phase: 'failed',
          provider: 'silverfin',
          clientId: reconnectClientId,
          failure: message,
        })
        import('sonner').then(({ toast }) => toast.error(message))
        window.sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
        window.sessionStorage.removeItem(oauthLockKey)
        stripSilverfinCallback()
      }
    })()
  }, [loadAccountingIntegrationStatus, setFormData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('just_connected')?.trim().toLowerCase() || ''
    const nonce = params.get('accounting_resume')?.trim() || ''
    const reconnectClientId = params.get('clientId')?.trim() || ''
    if (!provider || !nonce || !reconnectClientId) return

    const stripHandoffCallback = () => {
      const cleanedUrl = new URL(window.location.href)
      cleanedUrl.searchParams.delete('just_connected')
      cleanedUrl.searchParams.delete('accounting_resume')
      window.history.replaceState({}, '', cleanedUrl.toString())
    }

    const lockKey = `accounting_handoff_${provider}_${nonce}`
    if (window.sessionStorage.getItem(lockKey)) return
    const claimedIntent = beginAccountingReconnectHandoffResync(window.sessionStorage, {
      provider,
      clientId: reconnectClientId,
      nonce,
    })
    if (!claimedIntent) {
      const failure = 'This accounting reconnect return expired. Start the reconnect flow again.'
      markAccountingReconnectFailed(window.sessionStorage, {
        provider,
        clientId: reconnectClientId,
        failure,
      })
      publishAccountingReconnectStatus({
        phase: 'failed',
        provider,
        clientId: reconnectClientId,
        failure,
      })
      stripHandoffCallback()
      import('sonner').then(({ toast }) => toast.error(failure))
      return
    }
    window.sessionStorage.setItem(lockKey, '1')
    publishAccountingReconnectStatus({
      phase: 'resyncing',
      provider,
      clientId: reconnectClientId,
    })

    void (async () => {
      try {
        await accountingAPI.resyncClient(reconnectClientId, { force: true })
        const snapshot = await accountingAPI.getClientValuationFinancials(reconnectClientId)
        const correctedFormData = applyValuationSnapshotToReconnectDraft(
          claimedIntent.formData,
          snapshot
        )
        setFormData(correctedFormData)
        if (
          !markAccountingReconnectReady(window.sessionStorage, {
            provider,
            clientId: reconnectClientId,
            formData: correctedFormData,
            anchorYear: snapshot.anchor_year,
            unavailableYears: snapshot.unavailable_years,
          })
        ) {
          throw new Error('The reconnect request expired before synchronization completed.')
        }
        await loadAccountingIntegrationStatus()
        window.sessionStorage.removeItem(lockKey)
        stripHandoffCallback()
        const resumeUrl = new URL(window.location.href)
        resumeUrl.searchParams.set('resume_calculation', '1')
        window.history.replaceState({}, '', resumeUrl.toString())
        window.dispatchEvent(new Event('upswitch:accounting-reconnect-ready'))
      } catch (error) {
        const message = parseAccountingApiError(error) || 'Accounting synchronization failed'
        markAccountingReconnectFailed(window.sessionStorage, {
          provider,
          clientId: reconnectClientId,
          failure: message,
        })
        publishAccountingReconnectStatus({
          phase: 'failed',
          provider,
          clientId: reconnectClientId,
          failure: message,
        })
        window.sessionStorage.removeItem(lockKey)
        stripHandoffCallback()
        import('sonner').then(({ toast }) => toast.error(message))
      }
    })()
  }, [loadAccountingIntegrationStatus, setFormData])

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
