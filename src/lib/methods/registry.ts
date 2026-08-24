/**
 * Method registry — the single source of truth for the valuation method specs.
 *
 * The canonical engine surface has 11 distinct valuation methods. This registry stores
 * those 11 plus `revenue_multiple`, the English compatibility alias for the
 * same revenue lens as `omzet_multiple`. `revenue_multiple` is intentionally
 * not pre-selectable in the Venus nav, but it must stay here because API
 * payloads, engine results, and weight maps can still carry it.
 *
 * All legacy method constants (`COMBINABLE_METHODS`, `STANDALONE_METHODS`,
 * `METHOD_FIELD_CONFIG`, `MUTUALLY_EXCLUSIVE_PAIRS`, `PRE_SELECTABLE_METHODS`,
 * `METHOD_LABEL_KEYS`, `METHOD_DESCRIPTION_KEYS`) derive from this registry —
 * see the `derive*` helpers below.
 */

// Import each spec from its leaf `./<method>/spec` module, NOT from the
// method's `index.ts` barrel. The barrels re-export React section stacks,
// hooks, and adapters whose transitive deps eventually pull
// `useManualResultsStore`, which itself imports `@/constants/methodFieldConfig`
// — and that file calls `deriveMethodFieldConfig()` at top level. Loading the
// barrels during registry init therefore re-enters this module before
// `ORDERED_SPECS` is bound and trips a TDZ ReferenceError that kills ~9 test
// suites at module-eval time. The leaf `./*/spec` modules only import
// `type MethodSpec from '../types'` so they are side-effect-free for this
// graph.
import { adjustedNavMethodSpec } from './adjusted_nav/spec'
import { arrMultipleMethodSpec } from './arr_multiple/spec'
import { dcfMethodSpec } from './dcf/spec'
import { ebitdaMultipleMethodSpec } from './ebitda_multiple/spec'
import { fiscal4xMethodSpec } from './fiscal_4x/spec'
import { liquidationAnalysisMethodSpec } from './liquidation_analysis/spec'
import { omzetMultipleMethodSpec } from './omzet_multiple/spec'
import { realEstateYieldMethodSpec } from './real_estate_yield/spec'
import { revenueMultipleMethodSpec } from './revenue_multiple/spec'
import { sdeMultipleMethodSpec } from './sde_multiple/spec'
import { startupValuationMethodSpec } from './startup_valuation/spec'
import type { InputSectionKey, MethodKey, MethodSpec } from './types'
import { upswitchAdaptiveMethodSpec } from './upswitch_adaptive/spec'

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
  realEstateYieldMethodSpec,
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
    Object.fromEntries(ORDERED_SPECS.map((s) => [s.key, { bonusSections: [...s.bonusSections] }]))
  )
}

export function deriveMethodLabelKeys(): Readonly<Record<MethodKey, string>> {
  return Object.freeze(Object.fromEntries(ORDERED_SPECS.map((s) => [s.key, s.labelKey])))
}

export function deriveMethodCompactLabelKeys(): Readonly<Record<MethodKey, string>> {
  return Object.freeze(Object.fromEntries(ORDERED_SPECS.map((s) => [s.key, `${s.labelKey}Pill`])))
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
