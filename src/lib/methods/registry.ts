/**
 * Method registry — the single source of truth for the 10 valuation methods.
 *
 * Three methods live in their own modules (`./dcf`, `./ebitda_multiple`,
 * `./adjusted_nav`) as proof points for the per-method module pattern. The
 * remaining seven specs live inline until later phases migrate them.
 *
 * All legacy method constants (`COMBINABLE_METHODS`, `STANDALONE_METHODS`,
 * `METHOD_FIELD_CONFIG`, `MUTUALLY_EXCLUSIVE_PAIRS`, `PRE_SELECTABLE_METHODS`,
 * `METHOD_LABEL_KEYS`, `METHOD_DESCRIPTION_KEYS`) derive from this registry —
 * see the `derive*` helpers below.
 */

import { adjustedNavMethodSpec } from './adjusted_nav'
import { arrMultipleMethodSpec } from './arr_multiple'
import { dcfMethodSpec } from './dcf'
import { ebitdaMultipleMethodSpec } from './ebitda_multiple'
import { fiscal4xMethodSpec } from './fiscal_4x'
import { liquidationAnalysisMethodSpec } from './liquidation_analysis'
import { omzetMultipleMethodSpec } from './omzet_multiple'
import { revenueMultipleMethodSpec } from './revenue_multiple'
import { sdeMultipleMethodSpec } from './sde_multiple'
import { startupValuationMethodSpec } from './startup_valuation'
import { upswitchAdaptiveMethodSpec } from './upswitch_adaptive'
import type { InputSectionKey, MethodKey, MethodSpec } from './types'

/**
 * Canonical order — drives `PRE_SELECTABLE_METHODS` order and any
 * `Object.values(METHOD_SPECS)` iteration.
 */
const ORDERED_SPECS: readonly MethodSpec[] = [
  upswitchAdaptiveMethodSpec,
  omzetMultipleMethodSpec,
  arrMultipleMethodSpec,
  ebitdaMultipleMethodSpec,
  dcfMethodSpec,
  sdeMultipleMethodSpec,
  adjustedNavMethodSpec,
  fiscal4xMethodSpec,
  startupValuationMethodSpec,
  liquidationAnalysisMethodSpec,
  revenueMultipleMethodSpec,
]

export const METHOD_SPECS: Readonly<Record<MethodKey, MethodSpec>> = Object.freeze(
  Object.fromEntries(ORDERED_SPECS.map((spec) => [spec.key, spec]))
)

/** Stable iteration order for derived constants. */
export const ORDERED_METHOD_SPECS: readonly MethodSpec[] = ORDERED_SPECS

export function getMethodSpec(key: MethodKey): MethodSpec | undefined {
  return METHOD_SPECS[key]
}

// ─── Capability lookups ─────────────────────────────────────────────────────
// Single-key and multi-key (active selection) helpers built on the capability
// flags in each spec. Callers stay free of inline `=== 'dcf'` checks and
// new methods inherit the right UI behaviour by setting one flag.

export function isAdaptiveMethodKey(key: MethodKey | null | undefined): boolean {
  if (!key) return false
  return METHOD_SPECS[key]?.isAdaptive === true
}

export function isVenturePathMethodKey(key: MethodKey | null | undefined): boolean {
  if (!key) return false
  return METHOD_SPECS[key]?.requiresVenturePath === true
}

export function methodKeyAcceptsPreparerMultipleOverride(
  key: MethodKey | null | undefined
): boolean {
  if (!key) return false
  return METHOD_SPECS[key]?.acceptsPreparerMultipleOverride === true
}

export function methodKeyRequiresForecastYears(key: MethodKey | null | undefined): boolean {
  if (!key) return false
  return METHOD_SPECS[key]?.requiresForecastYears === true
}

/** True iff at least one active method key requires forecast-year rows. */
export function selectionRequiresForecastYears(keys: readonly MethodKey[]): boolean {
  return keys.some((key) => METHOD_SPECS[key]?.requiresForecastYears === true)
}

/** True iff at least one active method key requires an owner-compensation add-back. */
export function selectionRequiresOwnerCompensation(keys: readonly MethodKey[]): boolean {
  return keys.some((key) => METHOD_SPECS[key]?.requiresOwnerCompensation === true)
}

/**
 * True iff at least one active method key consumes the real-estate carve-out
 * toggle. Replaces the legacy `REAL_ESTATE_CARVE_OUT_METHODS` hardcoded list
 * in `@/utils/realEstateCarveOutDisplay`. Source of truth lives on the spec
 * (`appliesRealEstateCarveOut` flag) so adding/removing a method is a
 * one-line spec edit, not a separate hardcoded array.
 */
export function selectionAppliesRealEstateCarveOut(
  keys: readonly MethodKey[] | undefined | null
): boolean {
  if (!keys || keys.length === 0) return false
  return keys.some((key) => METHOD_SPECS[key]?.appliesRealEstateCarveOut === true)
}

// ─── Derived helpers ────────────────────────────────────────────────────────

export function deriveCombinableMethods(): ReadonlySet<MethodKey> {
  return new Set(ORDERED_SPECS.filter((s) => s.combinable).map((s) => s.key))
}

export function deriveStandaloneMethods(): ReadonlySet<MethodKey> {
  return new Set(ORDERED_SPECS.filter((s) => s.standalone).map((s) => s.key))
}

export function derivePreSelectableMethods(): readonly MethodKey[] {
  return ORDERED_SPECS.filter((s) => s.preSelectable).map((s) => s.key)
}

export function deriveMethodFieldConfig(): Readonly<
  Record<MethodKey, { bonusSections: InputSectionKey[] }>
> {
  return Object.freeze(
    Object.fromEntries(
      ORDERED_SPECS.map((s) => [s.key, { bonusSections: [...s.bonusSections] }])
    )
  )
}

export function deriveMethodLabelKeys(): Readonly<Record<MethodKey, string>> {
  return Object.freeze(Object.fromEntries(ORDERED_SPECS.map((s) => [s.key, s.labelKey])))
}

export function deriveMethodDescriptionKeys(): Readonly<Record<MethodKey, string>> {
  const entries: Array<[MethodKey, string]> = []
  for (const s of ORDERED_SPECS) {
    if (s.descriptionKey) entries.push([s.key, s.descriptionKey])
  }
  return Object.freeze(Object.fromEntries(entries))
}

/**
 * Unique unordered pairs derived from each spec's `mutuallyExclusiveWith`.
 * If declaration is asymmetric (A lists B but B does not list A), the pair is
 * still emitted once — `registry.test.ts` asserts symmetry to catch drift.
 */
export function deriveMutuallyExclusivePairs(): ReadonlyArray<readonly [MethodKey, MethodKey]> {
  const seen = new Set<string>()
  const pairs: Array<readonly [MethodKey, MethodKey]> = []
  for (const spec of ORDERED_SPECS) {
    for (const other of spec.mutuallyExclusiveWith) {
      const [a, b] = spec.key < other ? [spec.key, other] : [other, spec.key]
      const id = `${a}::${b}`
      if (seen.has(id)) continue
      seen.add(id)
      pairs.push([a, b])
    }
  }
  return pairs
}
