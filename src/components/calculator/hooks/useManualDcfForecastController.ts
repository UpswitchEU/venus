'use client'

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { dcfSmartDefaultsFromForm } from '../../../lib/methods/dcf'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import type { TerminalValueMethod } from '../sections/DcfGlobalAssumptions'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
  DCF_DEFAULT_TERMINAL_GROWTH_PCT,
  DCF_DEFAULT_WACC_PCT,
} from '../sections/dcfEngineDefaults'
import {
  type DcfForecastModelSnapshot,
  snapshotFromForecastRowLike,
  snapshotsClose,
} from '../sections/dcfForecastModelSync'
import {
  applyDcfProjectionPreviewToForecastRows,
  buildProjectionRowFromForecastRow,
  deriveDcfProjectionPreview,
} from '../sections/dcfProjectionPreview'
import { deriveDcfSmartDefaults, deriveWaccSectorBand } from '../sections/dcfSmartDefaults'

interface ImportedLedgerAnalysisSummary {
  dcf_defaults?: {
    average_depreciation?: number
    suggested_capex?: number
  }
}

interface DcfImportBatchData {
  dcf_defaults?: {
    average_depreciation?: number
    suggested_capex?: number
  }
}

type DcfInputMode = 'ebitda' | 'fcff_only'
type ManualDcfTranslator = (key: string, values?: Record<string, string | number>) => string

interface UseManualDcfForecastControllerParams {
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  hasDcfSelected: boolean
  importBatchData: DcfImportBatchData | null
  selectedBusinessCategory?: string | null
  sortedYearlyFinancials: YearlyFinancials[]
  translate: ManualDcfTranslator
}

export function useManualDcfForecastController({
  formData,
  setFormData,
  hasDcfSelected,
  importBatchData,
  selectedBusinessCategory,
  sortedYearlyFinancials,
  translate,
}: UseManualDcfForecastControllerParams) {
  const dcfForecastRows = useMemo(
    () =>
      hasDcfSelected
        ? [...sortedYearlyFinancials.filter((year) => year.isForecast)].sort(
            (a, b) => Number(a.year) - Number(b.year)
          )
        : [],
    [hasDcfSelected, sortedYearlyFinancials]
  )

  const { latestHistoricalRevenue, latestHistoricalEbitda } = useMemo(() => {
    const historical = sortedYearlyFinancials.filter(
      (y) =>
        !y.isForecast && (Number.isFinite(Number(y.revenue)) || Number.isFinite(Number(y.ebitda)))
    )
    if (historical.length === 0) {
      return {
        latestHistoricalRevenue: undefined as number | undefined,
        latestHistoricalEbitda: undefined as number | undefined,
      }
    }
    const row = historical[0]
    const revenue = row.revenue
    const ebitda = row.ebitda
    return {
      latestHistoricalRevenue:
        typeof revenue === 'number' && Number.isFinite(revenue) ? revenue : undefined,
      latestHistoricalEbitda:
        typeof ebitda === 'number' && Number.isFinite(ebitda) ? ebitda : undefined,
    }
  }, [sortedYearlyFinancials])

  const dcfSmartDefaultsFromHistory = useMemo(
    () =>
      deriveDcfSmartDefaults({
        yearlyFinancials: formData.yearlyFinancials,
        businessCategory: selectedBusinessCategory ?? formData.industry ?? formData.businessType,
      }),
    [
      formData.yearlyFinancials,
      selectedBusinessCategory,
      formData.industry,
      formData.businessType,
    ]
  )

  const integrationDerivedCapexPct = useMemo(() => {
    const raw = formData.business_context?._imported_ledger_analysis
    const persisted =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as ImportedLedgerAnalysisSummary).dcf_defaults?.suggested_capex
        : undefined
    const suggested = importBatchData?.dcf_defaults?.suggested_capex ?? persisted
    const revenue = latestHistoricalRevenue
    if (suggested == null || !Number.isFinite(suggested) || revenue == null || revenue <= 0) {
      return null
    }
    const pct = (suggested / revenue) * 100
    return Math.round(Math.min(8, Math.max(2, pct)) * 10) / 10
  }, [importBatchData, formData.business_context, latestHistoricalRevenue])

  const integrationDerivedDaPct = useMemo(() => {
    const raw = formData.business_context?._imported_ledger_analysis
    const persisted =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as ImportedLedgerAnalysisSummary).dcf_defaults?.average_depreciation
        : undefined
    const averageDepreciation = importBatchData?.dcf_defaults?.average_depreciation ?? persisted
    const revenue = latestHistoricalRevenue
    if (
      averageDepreciation == null ||
      !Number.isFinite(averageDepreciation) ||
      revenue == null ||
      revenue <= 0
    ) {
      return null
    }
    const pct = (averageDepreciation / revenue) * 100
    return Math.round(Math.min(5, Math.max(2, pct)) * 10) / 10
  }, [importBatchData, formData.business_context, latestHistoricalRevenue])

  const waccSectorBand = useMemo(
    () => deriveWaccSectorBand(selectedBusinessCategory ?? formData.industry ?? formData.businessType),
    [selectedBusinessCategory, formData.industry, formData.businessType]
  )

  const dcfDefaultsProvenance = useMemo((): 'none' | 'integration' | 'history' | 'both' => {
    const hasSmart = dcfSmartDefaultsFromHistory != null
    const hasImport = integrationDerivedCapexPct != null || integrationDerivedDaPct != null
    if (hasImport && hasSmart) return 'both'
    if (hasImport) return 'integration'
    if (hasSmart) return 'history'
    return 'none'
  }, [dcfSmartDefaultsFromHistory, integrationDerivedCapexPct, integrationDerivedDaPct])

  const hasDcfForecastWorkspace = hasDcfSelected && dcfForecastRows.length > 0

  const dcfModeSegmentOptions = useMemo(
    () => [
      { value: 'ebitda' as const, label: translate('dcfInputMode.ebitdaShort') },
      { value: 'fcff_only' as const, label: translate('dcfInputMode.fcffOnlyShort') },
    ],
    [translate]
  )

  const [terminalValueMethod, setTerminalValueMethod] = useState<TerminalValueMethod>(() => {
    if (formData.dcf_terminal_value_method) return formData.dcf_terminal_value_method
    if (formData.dcf_exit_multiple != null && formData.dcf_terminal_growth_pct == null) {
      return 'exit_multiple'
    }
    return 'perpetual_growth'
  })

  const handleTerminalValueMethodChange = useCallback(
    (method: TerminalValueMethod) => {
      setTerminalValueMethod(method)
      setFormData((prev) => ({ ...prev, dcf_terminal_value_method: method }))
    },
    [setFormData]
  )

  const dcfLastModelSnapshotRef = useRef<Record<string, DcfForecastModelSnapshot>>({})

  useEffect(() => {
    if (formData.dcf_input_mode !== 'fcff_only') return
    if (terminalValueMethod !== 'exit_multiple') return
    setTerminalValueMethod('perpetual_growth')
    setFormData((prev) => ({ ...prev, dcf_terminal_value_method: 'perpetual_growth' }))
  }, [formData.dcf_input_mode, terminalValueMethod, setFormData])

  const dcfProjectionAutofillRows = useMemo(
    () =>
      hasDcfSelected
        ? deriveDcfProjectionPreview({
            yearlyFinancials: formData.yearlyFinancials,
            smartDefaults: dcfSmartDefaultsFromHistory,
            revenueGrowthPct: formData.dcf_revenue_growth_pct,
            ebitdaMarginPct: formData.dcf_ebitda_margin_pct,
            capexPct: formData.dcf_capex_pct,
            daPct: formData.dcf_da_pct,
            nwcPct: formData.dcf_nwc_pct,
            taxRatePct: formData.dcf_tax_rate_pct,
            forecastYears: dcfForecastRows.map((row) => Number(row.year)),
          })
        : [],
    [
      dcfForecastRows,
      dcfSmartDefaultsFromHistory,
      hasDcfSelected,
      formData.dcf_capex_pct,
      formData.dcf_da_pct,
      formData.dcf_ebitda_margin_pct,
      formData.dcf_nwc_pct,
      formData.dcf_revenue_growth_pct,
      formData.dcf_tax_rate_pct,
      formData.yearlyFinancials,
    ]
  )

  const growthPctOk =
    typeof formData.dcf_revenue_growth_pct === 'number' &&
    Number.isFinite(formData.dcf_revenue_growth_pct)
  const marginPctOk =
    typeof formData.dcf_ebitda_margin_pct === 'number' &&
    Number.isFinite(formData.dcf_ebitda_margin_pct)
  const canApplyDcfProjectionAutofill =
    formData.dcf_input_mode !== 'fcff_only' &&
    dcfForecastRows.length > 0 &&
    growthPctOk &&
    marginPctOk &&
    dcfProjectionAutofillRows.length > 0 &&
    dcfProjectionAutofillRows.length === dcfForecastRows.length

  const handleDcfInputModeChange = useCallback(
    (mode: DcfInputMode) => {
      if (mode === 'fcff_only') {
        setTerminalValueMethod('perpetual_growth')
      }
      setFormData((prev) => {
        if (mode === 'fcff_only') {
          const globals = {
            daPct: prev.dcf_da_pct ?? DCF_DEFAULT_DA_PCT,
            capexPct: prev.dcf_capex_pct ?? DCF_DEFAULT_CAPEX_PCT,
            nwcPct: prev.dcf_nwc_pct ?? DCF_DEFAULT_NWC_PCT,
            taxRatePct: prev.dcf_tax_rate_pct ?? DCF_DEFAULT_TAX_RATE_PCT,
          }
          return {
            ...prev,
            dcf_input_mode: 'fcff_only',
            dcf_terminal_value_method: 'perpetual_growth',
            yearlyFinancials: prev.yearlyFinancials.map((yf) => {
              if (!yf.isForecast) return yf
              const fcff = buildProjectionRowFromForecastRow(
                {
                  year: String(yf.year),
                  revenue: yf.revenue,
                  ebitda: yf.ebitda,
                  capex: yf.capex,
                  depreciation: yf.depreciation,
                  nwc_change: yf.nwc_change,
                  free_cash_flow: yf.free_cash_flow,
                },
                globals
              ).fcff
              return { ...yf, revenue: 0, ebitda: 0, free_cash_flow: fcff }
            }),
          }
        }
        const forecastYears = prev.yearlyFinancials
          .filter((row) => row.isForecast)
          .map((row) => Number(row.year))
        const cleared = prev.yearlyFinancials.map((yf) =>
          yf.isForecast ? { ...yf, free_cash_flow: undefined } : yf
        )
        const projectionRows = deriveDcfProjectionPreview({
          yearlyFinancials: cleared,
          smartDefaults: dcfSmartDefaultsFromForm(prev),
          revenueGrowthPct: prev.dcf_revenue_growth_pct,
          ebitdaMarginPct: prev.dcf_ebitda_margin_pct,
          capexPct: prev.dcf_capex_pct,
          daPct: prev.dcf_da_pct,
          nwcPct: prev.dcf_nwc_pct,
          taxRatePct: prev.dcf_tax_rate_pct,
          forecastYears,
        })
        if (projectionRows.length === 0) {
          return {
            ...prev,
            dcf_input_mode: 'ebitda',
            yearlyFinancials: cleared as YearlyFinancials[],
          }
        }
        return {
          ...prev,
          dcf_input_mode: 'ebitda',
          yearlyFinancials: applyDcfProjectionPreviewToForecastRows(
            cleared as YearlyFinancials[],
            projectionRows
          ) as YearlyFinancials[],
        }
      })
    },
    [setFormData]
  )

  const handleApplyDcfProjectionAutofill = useCallback(() => {
    if (!canApplyDcfProjectionAutofill) return

    let snapshot: YearlyFinancials[] | null = null
    let manualEditCount = 0

    setFormData((prev) => {
      snapshot = prev.yearlyFinancials
      manualEditCount = prev.yearlyFinancials.filter((row) => {
        if (!row.isForecast) return false
        return (
          (typeof row.capex === 'number' && Number.isFinite(row.capex)) ||
          (typeof row.depreciation === 'number' && Number.isFinite(row.depreciation)) ||
          (typeof row.nwc_change === 'number' && Number.isFinite(row.nwc_change)) ||
          (typeof row.free_cash_flow === 'number' && Number.isFinite(row.free_cash_flow))
        )
      }).length

      return {
        ...prev,
        yearlyFinancials: applyDcfProjectionPreviewToForecastRows(
          prev.yearlyFinancials,
          deriveDcfProjectionPreview({
            yearlyFinancials: prev.yearlyFinancials,
            smartDefaults: dcfSmartDefaultsFromForm(prev),
            revenueGrowthPct: prev.dcf_revenue_growth_pct,
            ebitdaMarginPct: prev.dcf_ebitda_margin_pct,
            capexPct: prev.dcf_capex_pct,
            daPct: prev.dcf_da_pct,
            nwcPct: prev.dcf_nwc_pct,
            taxRatePct: prev.dcf_tax_rate_pct,
            forecastYears: prev.yearlyFinancials
              .filter((row) => row.isForecast)
              .map((row) => Number(row.year)),
          })
        ) as YearlyFinancials[],
      }
    })

    void import('sonner').then(({ toast }) => {
      const undoLabel = translate('dcfProjectionAutofillUndo') || 'Undo'
      const baseMsg = translate('dcfProjectionAutofillApplied', { count: dcfForecastRows.length })
      const overwriteSuffix =
        manualEditCount > 0
          ? ` ${translate('dcfProjectionAutofillOverwrote', { count: manualEditCount })}`
          : ''
      const restore = () => {
        if (!snapshot) return
        const restoreSnapshot = snapshot
        setFormData((prev) => ({ ...prev, yearlyFinancials: restoreSnapshot }))
      }
      if (manualEditCount > 0) {
        toast.warning(`${baseMsg}${overwriteSuffix}`, {
          duration: 8000,
          action: { label: undoLabel, onClick: restore },
        })
      } else {
        toast.success(baseMsg, {
          duration: 5000,
          action: { label: undoLabel, onClick: restore },
        })
      }
    })
  }, [canApplyDcfProjectionAutofill, dcfForecastRows.length, setFormData, translate])

  const dcfForecastYearKeys = useMemo(
    () =>
      dcfForecastRows
        .map((row) => String(row.year))
        .sort()
        .join(','),
    [dcfForecastRows]
  )

  useEffect(() => {
    const allowed = new Set(dcfForecastYearKeys.length > 0 ? dcfForecastYearKeys.split(',') : [])
    const next: Record<string, DcfForecastModelSnapshot> = {}
    for (const key of Object.keys(dcfLastModelSnapshotRef.current)) {
      if (allowed.has(key)) next[key] = dcfLastModelSnapshotRef.current[key]
    }
    dcfLastModelSnapshotRef.current = next
  }, [dcfForecastYearKeys])

  useEffect(() => {
    if (formData.dcf_input_mode === 'fcff_only') {
      dcfLastModelSnapshotRef.current = {}
    }
  }, [formData.dcf_input_mode])

  useEffect(() => {
    if (!hasDcfSelected) return

    const smart = dcfSmartDefaultsFromHistory

    setFormData((prev) => {
      const patch: Partial<ManualValuationFormData> = {}
      const hasForecastRows = dcfForecastRows.length > 0

      if (prev.dcf_wacc_pct == null || !Number.isFinite(prev.dcf_wacc_pct)) {
        patch.dcf_wacc_pct = smart?.waccPct ?? DCF_DEFAULT_WACC_PCT
      }
      if (prev.dcf_terminal_growth_pct == null || !Number.isFinite(prev.dcf_terminal_growth_pct)) {
        patch.dcf_terminal_growth_pct = smart?.terminalGrowthPct ?? DCF_DEFAULT_TERMINAL_GROWTH_PCT
      }

      if (prev.dcf_input_mode !== 'fcff_only' && hasForecastRows) {
        if (prev.dcf_revenue_growth_pct == null || !Number.isFinite(prev.dcf_revenue_growth_pct)) {
          patch.dcf_revenue_growth_pct = smart?.revenueGrowthPct ?? DCF_DEFAULT_REVENUE_GROWTH_PCT
        }
        if (prev.dcf_ebitda_margin_pct == null || !Number.isFinite(prev.dcf_ebitda_margin_pct)) {
          if (smart) {
            patch.dcf_ebitda_margin_pct = smart.ebitdaMarginPct
          } else {
            const revenue = latestHistoricalRevenue
            const ebitda = latestHistoricalEbitda
            if (revenue && revenue > 0 && ebitda != null && Number.isFinite(ebitda)) {
              patch.dcf_ebitda_margin_pct = Math.round((ebitda / revenue) * 1000) / 10
            } else {
              patch.dcf_ebitda_margin_pct = DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT
            }
          }
        }
        if (prev.dcf_capex_pct == null || !Number.isFinite(prev.dcf_capex_pct)) {
          patch.dcf_capex_pct =
            integrationDerivedCapexPct ?? smart?.capexPct ?? DCF_DEFAULT_CAPEX_PCT
        }
        if (prev.dcf_da_pct == null || !Number.isFinite(prev.dcf_da_pct)) {
          patch.dcf_da_pct = integrationDerivedDaPct ?? smart?.daPct ?? DCF_DEFAULT_DA_PCT
        }
        if (prev.dcf_nwc_pct == null || !Number.isFinite(prev.dcf_nwc_pct)) {
          patch.dcf_nwc_pct = DCF_DEFAULT_NWC_PCT
        }
        if (prev.dcf_tax_rate_pct == null || !Number.isFinite(prev.dcf_tax_rate_pct)) {
          patch.dcf_tax_rate_pct = smart?.taxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT
        }
      }

      if (Object.keys(patch).length === 0) return prev
      return { ...prev, ...patch }
    })
  }, [
    hasDcfSelected,
    formData.dcf_input_mode,
    dcfForecastRows.length,
    latestHistoricalRevenue,
    latestHistoricalEbitda,
    dcfSmartDefaultsFromHistory,
    integrationDerivedCapexPct,
    integrationDerivedDaPct,
    setFormData,
  ])

  useEffect(() => {
    if (!hasDcfSelected || formData.dcf_input_mode === 'fcff_only') return
    if (dcfForecastRows.length === 0) return

    setFormData((prev) => {
      const growth = prev.dcf_revenue_growth_pct
      const margin = prev.dcf_ebitda_margin_pct
      if (
        growth == null ||
        margin == null ||
        !Number.isFinite(growth) ||
        !Number.isFinite(margin)
      ) {
        return prev
      }

      const forecastYears = prev.yearlyFinancials
        .filter((row) => row.isForecast)
        .map((row) => Number(row.year))
      const preview = deriveDcfProjectionPreview({
        yearlyFinancials: prev.yearlyFinancials,
        smartDefaults: dcfSmartDefaultsFromForm(prev),
        revenueGrowthPct: growth,
        ebitdaMarginPct: margin,
        capexPct: prev.dcf_capex_pct,
        daPct: prev.dcf_da_pct,
        nwcPct: prev.dcf_nwc_pct,
        taxRatePct: prev.dcf_tax_rate_pct,
        forecastYears,
      })
      if (preview.length === 0) return prev

      const ref = dcfLastModelSnapshotRef
      let anyChange = false
      const nextYearlyFinancials = prev.yearlyFinancials.map((yf) => {
        if (!yf.isForecast) return yf
        const projection = preview.find((p) => String(p.year) === String(yf.year))
        if (!projection) return yf

        const modelSnapshot: DcfForecastModelSnapshot = {
          revenue: projection.revenue,
          ebitda: projection.ebitda,
          capex: projection.capex,
          depreciation: projection.da,
          nwc_change: projection.nwcChange,
        }
        const lastSnapshot = ref.current[String(yf.year)]
        const currentSnapshot = snapshotFromForecastRowLike(yf)
        if (lastSnapshot && !snapshotsClose(currentSnapshot, lastSnapshot)) {
          return yf
        }

        const merged = {
          ...yf,
          revenue: projection.revenue,
          ebitda: projection.ebitda,
          capex: projection.capex,
          depreciation: projection.da,
          nwc_change: projection.nwcChange,
          free_cash_flow: undefined,
        }
        if (
          merged.revenue !== yf.revenue ||
          merged.ebitda !== yf.ebitda ||
          (merged.capex ?? 0) !== (yf.capex ?? 0) ||
          (merged.depreciation ?? 0) !== (yf.depreciation ?? 0) ||
          (merged.nwc_change ?? 0) !== (yf.nwc_change ?? 0)
        ) {
          anyChange = true
        }
        ref.current[String(yf.year)] = modelSnapshot
        return merged
      })

      if (!anyChange) return prev
      return { ...prev, yearlyFinancials: nextYearlyFinancials as YearlyFinancials[] }
    })
  }, [
    hasDcfSelected,
    formData.dcf_input_mode,
    formData.dcf_revenue_growth_pct,
    formData.dcf_ebitda_margin_pct,
    formData.dcf_capex_pct,
    formData.dcf_da_pct,
    formData.dcf_nwc_pct,
    formData.dcf_tax_rate_pct,
    dcfForecastYearKeys,
    dcfForecastRows.length,
    setFormData,
  ])

  useEffect(() => {
    const persistedAnalysis = formData.business_context?._imported_ledger_analysis as
      | ImportedLedgerAnalysisSummary
      | undefined
    const suggestedCapex =
      importBatchData?.dcf_defaults?.suggested_capex ??
      persistedAnalysis?.dcf_defaults?.suggested_capex
    if (
      !hasDcfSelected ||
      formData.dcf_input_mode === 'fcff_only' ||
      !suggestedCapex ||
      dcfForecastRows.length === 0
    ) {
      return
    }

    setFormData((prev) => {
      let changed = false
      const next = prev.yearlyFinancials.map((row) => {
        if (row.isForecast && (row.capex == null || row.capex === 0)) {
          changed = true
          return { ...row, capex: suggestedCapex }
        }
        return row
      })
      if (!changed) return prev
      return { ...prev, yearlyFinancials: next }
    })
  }, [
    dcfForecastRows.length,
    hasDcfSelected,
    formData.business_context,
    formData.dcf_input_mode,
    importBatchData?.dcf_defaults?.suggested_capex,
    setFormData,
  ])

  return {
    canApplyDcfProjectionAutofill,
    dcfDefaultsProvenance,
    dcfForecastRows,
    dcfModeSegmentOptions,
    dcfProjectionAutofillRows,
    dcfSmartDefaultsFromHistory,
    handleApplyDcfProjectionAutofill,
    handleDcfInputModeChange,
    handleTerminalValueMethodChange,
    hasDcfForecastWorkspace,
    integrationDerivedCapexPct,
    integrationDerivedDaPct,
    latestHistoricalEbitda,
    latestHistoricalRevenue,
    terminalValueMethod,
    waccSectorBand,
  }
}
