/**
 * Registry: which manual sections map to which valuation methods and what client-side preview exists.
 * Server-calibrated multiples (EV/EBITDA, EV/Revenue, EV/ARR bands) stay backend-only — UI shows ratios + field-driven hints.
 */

import type { MethodPreviewAuditRegistry } from './types'

export const METHOD_PREVIEW_AUDIT = {
  upswitch_adaptive: {
    bonusSections: [] as const,
    clientPreview:
      'headline equity range comes from full valuation response; no duplicate formula in the calculator',
  },
  omzet_multiple: {
    bonusSections: ['revenue_quality'] as const,
    clientPreview:
      'EBITDA margin + revenue-quality derived metrics; EV/Revenue multiple is calibration-backed server-side',
  },
  ebitda_multiple: {
    bonusSections: ['revenue_quality'] as const,
    clientPreview:
      'EBITDA margin + revenue-quality derived metrics; EV/EBITDA multiple is calibration-backed server-side',
  },
  arr_multiple: {
    bonusSections: ['saas_metrics'] as const,
    clientPreview: 'SaaS signal cards in lib/saas; ARR × multiple equity bridge is server-side',
  },
  dcf: {
    bonusSections: ['dcf_projections'] as const,
    clientPreview:
      'DCF workspace + deriveDcfProjectionPreview; EUR cells + sensitivity matrix use useManualPreviewFormatters (formatEurCompact for large EV); full EV from engine',
  },
  sde_multiple: {
    bonusSections: ['sde_owner_compensation'] as const,
    clientPreview: 'lib/sde computeSdePreviewMetrics (omni_calc SDE branch)',
  },
  adjusted_nav: {
    bonusSections: ['nav_asset_schedule'] as const,
    clientPreview: 'navSchedulePreview sum of entered adjustments; full NAV from engine',
  },
  fiscal_4x: {
    bonusSections: [] as const,
    clientPreview:
      'fiscalPreviewMetrics (4× anchor + book equity) × ownershipMultiplierFromSharesForSale; Step 8 not client-side',
  },
  /** Omni secondary key; same economics as `omzet_multiple` in coordinator. */
  revenue_multiple: {
    bonusSections: ['revenue_quality'] as const,
    clientPreview:
      'Same as omzet_multiple — revenue-quality section; EV/Revenue from calibration server-side',
  },
} as const satisfies MethodPreviewAuditRegistry
