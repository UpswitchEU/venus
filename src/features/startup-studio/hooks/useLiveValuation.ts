'use client'

/**
 * ValuationIQ-backed Startup Studio preview.
 *
 * Venus owns inputs and presentation only. It never mirrors Berkus, VC,
 * scorecard, SaaS-forward, weighting, pedigree, inception-lens, cap-table, or
 * range formulas. A debounced, shared request asks local/normal Titan to attach
 * Business Types evidence and delegate the calculation to ValuationIQ.
 */

import { useEffect, useMemo, useState } from 'react'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { backendAPI } from '@/services/backendApi'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  type InceptionLens,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import type { ValuationRequest, ValuationResponse } from '@/types/valuation'
import { buildStartupValuationRequest } from '@/utils/buildStartupValuationRequest'
import { resolveVentureCountryIso2 } from '@/utils/resolveVentureCountryIso2'

export interface LiveLeg {
  key: 'berkus' | 'scorecard' | 'vc' | 'saas_forward'
  label: string
  value: number | null
  /** ValuationIQ currently returns each startup leg as a point, not a band. */
  low: number | null
  high: number | null
  weight: number
  unavailable: boolean
}

export interface LiveValuation {
  blended: { low: number; mid: number; high: number } | null
  blendedPrePedigree: { low: number; mid: number; high: number } | null
  pedigreeMultiplier: number
  inceptionLens: InceptionLens
  inceptionLensMultiplier: number
  inceptionLensBandWidenPct: number
  blendedPreLens: { low: number; mid: number; high: number } | null
  legs: LiveLeg[]
  isEmpty: boolean
}

type UnknownRecord = Record<string, unknown>
type PreviewEntry = {
  listeners: Set<(value: LiveValuation) => void>
  promise?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
  value?: LiveValuation
}

const PREVIEW_DEBOUNCE_MS = 500
const MAX_PREVIEW_CACHE_ENTRIES = 50
const previewCache = new Map<string, PreviewEntry>()

const LEG_LABELS: Record<LiveLeg['key'], string> = {
  berkus: 'studio.legs.berkus',
  scorecard: 'studio.legs.scorecard',
  vc: 'studio.legs.vc',
  saas_forward: 'studio.legs.saas',
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function positiveNumber(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

function rangeFromRecord(
  value: UnknownRecord | null,
  lowKey: string,
  midKey: string,
  highKey: string
): { low: number; mid: number; high: number } | null {
  const low = positiveNumber(value?.[lowKey])
  const mid = positiveNumber(value?.[midKey])
  const high = positiveNumber(value?.[highKey])
  return low != null && mid != null && high != null ? { low, mid, high } : null
}

function emptyLiveValuation(inceptionLens: InceptionLens): LiveValuation {
  return {
    blended: null,
    blendedPrePedigree: null,
    pedigreeMultiplier: 1,
    inceptionLens,
    inceptionLensMultiplier: 1,
    inceptionLensBandWidenPct: 0,
    blendedPreLens: null,
    legs: [],
    isEmpty: true,
  }
}

/** Copy the signed ValuationIQ preview into Venus's presentation model. */
export function valuationIqPreviewToLiveValuation(
  response: ValuationResponse | UnknownRecord | null | undefined,
  fallbackLens: InceptionLens = 'milestones_driven'
): LiveValuation {
  const root = asRecord(response)
  const authority = asRecord(root?.valuation_authority)
  if (authority?.authority !== 'valuation_iq') return emptyLiveValuation(fallbackLens)

  const results = asRecord(root?.valuation_results)
  const startup = asRecord(results?.startup_valuation)
  const details = asRecord(startup?.details)
  if (startup?.available !== true || !details) return emptyLiveValuation(fallbackLens)

  const canonical = asRecord(details.canonical)
  const blended = canonical
    ? rangeFromRecord(canonical, 'pre_money_low', 'pre_money_mid', 'pre_money_high')
    : rangeFromRecord(details, 'equity_value_low', 'equity_value_mid', 'equity_value_high')
  if (!blended) return emptyLiveValuation(fallbackLens)

  const founderView = asRecord(details.founder_view)
  const founderWeights = asRecord(founderView?.weights)
  const founderContributors = new Set(
    Array.isArray(founderView?.contributors)
      ? founderView.contributors.filter((item): item is string => typeof item === 'string')
      : []
  )
  const advisorContributors = new Set(
    Array.isArray(details.contributors)
      ? details.contributors.filter((item): item is string => typeof item === 'string')
      : []
  )
  const contributors = founderContributors.size > 0 ? founderContributors : advisorContributors

  const legs = (['berkus', 'scorecard', 'vc', 'saas_forward'] as const).map((key) => {
    const block = asRecord(details[key])
    const value = positiveNumber(block?.pre_money)
    const weight = finiteNumber(founderWeights?.[key]) ?? 0
    return {
      key,
      label: LEG_LABELS[key],
      value,
      low: null,
      high: null,
      weight,
      unavailable: value == null || !contributors.has(key),
    }
  })

  const prePedigree = asRecord(details.pre_pedigree)
  const blendedPrePedigree = rangeFromRecord(
    prePedigree,
    'equity_value_low',
    'equity_value_mid',
    'equity_value_high'
  )
  const pedigree = asRecord(details.founder_pedigree)
  const inception = asRecord(details.inception_lens)
  const preLens = asRecord(inception?.pre_lens)
  const lensValue = inception?.lens
  const inceptionLens: InceptionLens =
    lensValue === 'momentum_driven' ||
    lensValue === 'inception_bet' ||
    lensValue === 'milestones_driven'
      ? lensValue
      : fallbackLens

  const blendedPreLens = rangeFromRecord(
    preLens,
    'equity_value_low',
    'equity_value_mid',
    'equity_value_high'
  )

  return {
    blended,
    blendedPrePedigree,
    pedigreeMultiplier: finiteNumber(pedigree?.multiplier) ?? 1,
    inceptionLens,
    inceptionLensMultiplier: finiteNumber(inception?.multiplier) ?? 1,
    inceptionLensBandWidenPct: finiteNumber(inception?.band_widen_pct) ?? 0,
    blendedPreLens,
    legs,
    isEmpty: false,
  }
}

function previewKey(request: ValuationRequest): string {
  return JSON.stringify(request)
}

function prunePreviewCache(): void {
  if (previewCache.size <= MAX_PREVIEW_CACHE_ENTRIES) return
  for (const [key, entry] of previewCache) {
    if (entry.listeners.size === 0 && !entry.promise && !entry.timer) {
      previewCache.delete(key)
      if (previewCache.size <= MAX_PREVIEW_CACHE_ENTRIES) return
    }
  }
}

function schedulePreview(
  key: string,
  request: ValuationRequest,
  fallbackLens: InceptionLens
): PreviewEntry {
  const existing = previewCache.get(key)
  if (existing) return existing

  const entry: PreviewEntry = { listeners: new Set() }
  entry.timer = setTimeout(() => {
    entry.timer = undefined
    entry.promise = backendAPI
      .calculateStartupPreview(request)
      .then((response) => {
        entry.value = valuationIqPreviewToLiveValuation(response, fallbackLens)
        for (const listener of entry.listeners) listener(entry.value)
      })
      .catch(() => {
        // Fail closed: an unavailable engine produces no preview number. The
        // canonical report submission remains the explicit retry surface.
        entry.value = emptyLiveValuation(fallbackLens)
        for (const listener of entry.listeners) listener(entry.value)
      })
      .finally(() => {
        entry.promise = undefined
        prunePreviewCache()
      })
  }, PREVIEW_DEBOUNCE_MS)
  previewCache.set(key, entry)
  prunePreviewCache()
  return entry
}

export function useLiveValuation(_benchmark: StartupBenchmarkRow): LiveValuation {
  const startupState = useStartupValuationStore()
  const formData = useManualFormStore((state) => state.formData)
  const fallbackLens = startupState.inception_lens

  const request = useMemo(() => {
    const countryCode = resolveVentureCountryIso2(formData)
    const naceCode = formData.nace_code?.trim() || formData.canonical_nace_code?.trim() || ''
    const startupInputs = {
      ...startupState.toRequestPayload(),
      country_code: countryCode,
      ...(naceCode ? { nace_code: naceCode } : {}),
    }
    return buildStartupValuationRequest({
      companyName: formData.company_name ?? 'Unknown Startup',
      countryCode,
      currency: formData.currency,
      industry: formData.industry,
      businessModel: formData.business_model,
      foundingYear: formData.founding_year,
      naceCode: naceCode || undefined,
      naceDescription: formData.nace_description,
      businessTypeId: formData.business_type_id,
      businessTypeSegments: formData.business_type_segments,
      businessTypeMix: formData.business_type_mix,
      businessTypeWeights: formData.business_type_weights,
      businessType: formData.business_type,
      startupInputs,
    })
  }, [formData, startupState])
  const key = useMemo(() => previewKey(request), [request])
  const [snapshot, setSnapshot] = useState<{ key: string; value: LiveValuation }>(() => ({
    key,
    value: previewCache.get(key)?.value ?? emptyLiveValuation(fallbackLens),
  }))

  useEffect(() => {
    const entry = schedulePreview(key, request, fallbackLens)
    const listener = (value: LiveValuation) => setSnapshot({ key, value })
    entry.listeners.add(listener)
    setSnapshot({ key, value: entry.value ?? emptyLiveValuation(fallbackLens) })

    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0 && entry.timer) {
        clearTimeout(entry.timer)
        entry.timer = undefined
        previewCache.delete(key)
      }
    }
  }, [fallbackLens, key, request])

  return snapshot.key === key ? snapshot.value : emptyLiveValuation(fallbackLens)
}

export function formatEur(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${Math.round(value)}`
}
