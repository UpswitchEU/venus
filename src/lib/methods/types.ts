/**
 * MethodSpec — single source of truth for a valuation method.
 *
 * Each product valuation method declares one MethodSpec; the registry also
 * carries compatibility aliases such as `revenue_multiple` when API payloads
 * need them. The legacy scattered constants (`COMBINABLE_METHODS`,
 * `STANDALONE_METHODS`, `METHOD_FIELD_CONFIG`, `MUTUALLY_EXCLUSIVE_PAIRS`,
 * `PRE_SELECTABLE_METHODS`, `METHOD_LABEL_KEYS`, `METHOD_DESCRIPTION_KEYS`)
 * are derived from this registry so adding a method or alias requires editing
 * exactly one entry.
 */

/**
 * Bonus input sections rendered in the ManualInputPanel for method-specific
 * extras (e.g. DCF forecasts, NAV balance-sheet schedule, SaaS metrics).
 *
 * Declared here so the method-spec graph has no upward dependency on
 * `@/constants/methodFieldConfig` (which itself imports from this file).
 */
export type InputSectionKey =
  | 'dcf_projections'
  | 'nav_asset_schedule'
  | 'saas_metrics'
  | 'revenue_quality'
  | 'sde_owner_compensation'
  | 'liquidation_inputs'
  | 'fiscal_inputs'

/** Method-key string. Kept as `string` for pragmatic interop with API payloads. */
export type MethodKey = string

export interface MethodSpec {
  /** Stable identifier persisted on the backend and used as the API contract key. */
  key: MethodKey

  /** next-intl path under `manualInput.methodSelector.*` for the short label. */
  labelKey: string

  /** Optional next-intl path for the long-form description in the method dropdown tooltip. */
  descriptionKey?: string

  /**
   * `true` for market/income methods that can participate in a weighted blend
   * (Waarderingssynthese). Mutually exclusive with `standalone`.
   */
  combinable: boolean

  /**
   * `true` for methods that cannot be blended because they serve a distinct
   * legal/financial purpose or operate on a different premise of value
   * (IVS 104). Mutually exclusive with `combinable`.
   */
  standalone: boolean

  /**
   * `true` when this method appears in the top-bar method dropdown for upfront
   * pre-selection. Subset of "all methods the engine can compute".
   */
  preSelectable: boolean

  /**
   * Bonus input sections that should render in the ManualInputPanel when this
   * method is pre-selected. The base Omni inputs (company / financials /
   * ownership) are always shown — these are the method-specific extras.
   */
  bonusSections: readonly InputSectionKey[]

  /**
   * Other method keys this method must never appear alongside in a blend
   * (double-counting / duplicate-lens guards). Declarations should be
   * symmetric — `registry.test.ts` enforces bidirectional consistency.
   */
  mutuallyExclusiveWith: readonly MethodKey[]

  // ─── Capability flags ─────────────────────────────────────────────────────
  // Used by `ManualLayout` and `ManualInputPanel` to drive method-specific UI
  // behaviour without scattering string-equality checks throughout the panels.
  // Adding another method or alias means declaring the right flags on its spec
  // — no edits to the consumer files.

  /**
   * The "no specific method" sentinel. The store represents adaptive as `null`
   * (no override); all other methods are stored as their key.
   */
  isAdaptive: boolean

  /**
   * Whether this method surfaces a "user-supplied EBITDA multiple override"
   * preview tile in the right-rail (true for `ebitda_multiple` and the
   * adaptive blend which leans on the same input).
   */
  acceptsPreparerMultipleOverride: boolean

  /**
   * Whether this method routes through the dedicated `StartupAwareInputPanel`
   * + `useStartupValuationStore` + startup assistant (the venture / pre-revenue
   * path — Berkus / Scorecard / VC method). Currently only `startup_valuation`.
   */
  requiresVenturePath: boolean

  /**
   * Whether this method needs explicit forecast-year rows on the historical
   * grid (the manual input panel injects defaults when toggled on, prompts
   * for removal confirmation when toggled off). Currently only `dcf`.
   */
  requiresForecastYears: boolean

  /**
   * Whether this method needs an owner-compensation add-back input (the
   * `sde_owner_compensation` bonus section). Currently only `sde_multiple`.
   */
  requiresOwnerCompensation: boolean

  /**
   * Whether this method consumes the real-estate carve-out toggle. The
   * carve-out is a going-concern equity-bridge concern — meaningful only
   * for methods that run EBITDA or the EV→Equity bridge. For revenue /
   * ARR / Adjusted NAV (own RE section) / fiscal_4x / startup /
   * liquidation, the toggle is a no-op or conceptually wrong, so the UI
   * hides it. Replaces the legacy `REAL_ESTATE_CARVE_OUT_METHODS`
   * hardcoded array in `src/utils/realEstateCarveOutDisplay.ts`.
   */
  appliesRealEstateCarveOut: boolean
}
