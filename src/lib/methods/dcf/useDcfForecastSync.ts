/**
 * useDcfForecastSync — owns the DCF forecast-year auto-injection effect.
 *
 * Behaviour (lifted verbatim from the in-panel effect this hook replaces):
 *   - On mount when DCF is already active, inject default forecast rows and
 *     prefill them with projection-preview values.
 *   - When the user switches *to* a method that requires forecasts (or DCF
 *     enters a multi-method selection), inject default forecast rows and
 *     show a toast naming the number of rows added.
 *   - When the user switches *away* from a forecast-requiring method while
 *     forecast rows still exist, request confirmation before removing them.
 *   - Otherwise no-op (cheap on every render).
 *
 * The hook is pure react-state machinery — no Zustand, no toast dependency
 * beyond the dynamic `sonner` import for the success notification. All inputs
 * are explicit so the hook is testable with `renderHook` without mounting
 * the panel.
 */

import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react'
import {
  applyDcfProjectionPreviewToForecastRows,
  deriveDcfProjectionPreview,
} from '@/components/calculator/sections/dcfProjectionPreview'
import { methodKeyRequiresForecastYears } from '@/lib/methods/registry'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { dcfInjectionAddedRowCount, injectDefaultDcfForecastYears } from '@/utils/forecastYears'
import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'
import { dcfSmartDefaultsFromForm } from './smartDefaultsFromForm'

/**
 * The hook calls `translate('dcfForecastAdded', { count })`. Matches the
 * value-shape that `next-intl`'s `useTranslations` returns.
 */
export type DcfTranslator = (
  key: 'dcfForecastAdded',
  values?: Record<string, string | number | Date>
) => string

export interface UseDcfForecastSyncHandle {
  /**
   * Imperatively pin the hook's "last seen method" memory. Used by the
   * forecast-removal confirmation modal when the user cancels: the store's
   * method is reverted back to DCF, and this handle keeps the hook's state
   * machine aligned so the next render does not re-trigger the inject path.
   */
  markPrevMethod: (method: string | null) => void
}

export interface UseDcfForecastSyncParams {
  /** Current "effective" method — `preSelectedMethod ?? selectedMethod`. */
  effectiveMethod: string | null | undefined
  /**
   * `true` when any active method in the multi-method selection requires
   * forecast rows. Today only `dcf` flips this on; tomorrow's `requiresForecastYears`
   * methods inherit the behaviour automatically.
   */
  hasDcfSelected: boolean
  /** React state setter for the manual form data. */
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  /** Setter for the "confirm removal of forecast rows" modal. */
  setShowForecastRemovalConfirm: Dispatch<SetStateAction<boolean>>
  /** Translation function for the toast message (typed to the keys we use). */
  translate: DcfTranslator
}

function autoProjectionEbitdaMarginPct(
  value: unknown,
  smartDefault: number | undefined
): number | undefined {
  const parsed = parseFlexibleNumber(value)
  if (parsed === 0 && smartDefault != null && smartDefault > 0) {
    return undefined
  }
  return parsed
}

export function useDcfForecastSync({
  effectiveMethod,
  hasDcfSelected,
  setFormData,
  setShowForecastRemovalConfirm,
  translate,
}: UseDcfForecastSyncParams): UseDcfForecastSyncHandle {
  const prevMethodRef = useRef<string | null>(null)
  const prevHasDcfRef = useRef(false)
  const setFormDataRef = useRef(setFormData)
  const setShowForecastRemovalConfirmRef = useRef(setShowForecastRemovalConfirm)
  const translateRef = useRef(translate)

  useEffect(() => {
    setFormDataRef.current = setFormData
    setShowForecastRemovalConfirmRef.current = setShowForecastRemovalConfirm
    translateRef.current = translate
  }, [setFormData, setShowForecastRemovalConfirm, translate])

  useEffect(() => {
    const prev = prevMethodRef.current
    const nextMethod = effectiveMethod ?? null
    prevMethodRef.current = nextMethod
    const prevHasDcf = prevHasDcfRef.current
    prevHasDcfRef.current = hasDcfSelected
    const isMount = prev === null

    const methodChanged = prev !== nextMethod
    const dcfJustEnabled = hasDcfSelected && !prevHasDcf
    if (!isMount && !methodChanged && !dcfJustEnabled) return

    if (methodKeyRequiresForecastYears(effectiveMethod) || hasDcfSelected) {
      setShowForecastRemovalConfirmRef.current(false)
      setFormDataRef.current((current) => {
        const before = current.yearlyFinancials
        let nextFinancials = injectDefaultDcfForecastYears(before)
        if (nextFinancials === current.yearlyFinancials) return current
        const addedCount = dcfInjectionAddedRowCount(before, nextFinancials)
        if (!isMount && addedCount > 0) {
          import('sonner').then(({ toast }) =>
            toast.info(translateRef.current('dcfForecastAdded', { count: addedCount }))
          )
        }
        const smart = dcfSmartDefaultsFromForm(current)
        const preview = deriveDcfProjectionPreview({
          yearlyFinancials: nextFinancials,
          smartDefaults: smart,
          revenueGrowthPct: current.dcf_revenue_growth_pct as number | undefined,
          ebitdaMarginPct: autoProjectionEbitdaMarginPct(
            current.dcf_ebitda_margin_pct,
            smart?.ebitdaMarginPct
          ),
          capexPct: current.dcf_capex_pct as number | undefined,
          daPct: current.dcf_da_pct as number | undefined,
          nwcPct: current.dcf_nwc_pct as number | undefined,
          taxRatePct: current.dcf_tax_rate_pct as number | undefined,
          forecastYears: nextFinancials.filter((r) => r.isForecast).map((r) => Number(r.year)),
        })
        if (preview.length > 0) {
          const mode = current.dcf_input_mode === 'fcff_only' ? 'fcff_only' : 'ebitda'
          nextFinancials = applyDcfProjectionPreviewToForecastRows(nextFinancials, preview, {
            mode,
          }) as typeof nextFinancials
        }
        return { ...current, yearlyFinancials: nextFinancials as YearlyFinancials[] }
      })
    } else if (
      !isMount &&
      (methodKeyRequiresForecastYears(prev) || (prevHasDcf && !hasDcfSelected))
    ) {
      setFormDataRef.current((current) => {
        const hasForecast = current.yearlyFinancials.some((yf) => yf.isForecast)
        if (hasForecast) {
          queueMicrotask(() => setShowForecastRemovalConfirmRef.current(true))
        }
        return current
      })
    }
  }, [effectiveMethod, hasDcfSelected])

  return {
    markPrevMethod: (method) => {
      prevMethodRef.current = method
    },
  }
}
