/**
 * Fiscal 4× EBITDA — Belgian capital-gains tax (meerwaardebelasting,
 * Art. 90 WIB 92).
 *
 * Standalone method that drives the dedicated `fiscal_inputs` left-panel
 * section so accountants and lawyers can capture the legal artefacts the
 * report needs:
 *   - Peildatum override (non-calendar boekjaar)
 *   - Company role (werkmaatschappij / holding / mixed) — drives the
 *     holding-EBITDA warning on the report
 *   - Interne meerwaarde flag — surfaces the 33% rate banner and the
 *     4× EBITDA debt-cap anti-misbruik check
 *   - EBITDA basis (statutair vs genormaliseerd) — wettelijke formule
 *     uses last closed boekjaar; we expose the choice explicitly
 *   - Aanschaffingswaarde (per-share or total) — the value being filed
 *   - Four-anchor "hoogste van" worksheet (forfait / contract / 2025
 *     markttransactie / onafhankelijk verslag) with optional € amounts
 *
 * The engine still needs no extra inputs for the forfait formula itself
 * — these inputs feed the `fiscal_section.py` report builder verbatim
 * through `fiscal_inputs: dict` on the calculate request.
 *
 * Standalone because the tax filing serves a distinct legal purpose
 * (Belgian capital-gains declaration) — blending it with a going-concern
 * valuation lens would conflate two different questions ("what would a
 * buyer pay?" vs "what's the legal taxable basis?").
 */

import type { MethodSpec } from '../types'

export const FISCAL_4X_METHOD_KEY = 'fiscal_4x' as const

export const fiscal4xMethodSpec: MethodSpec = {
  key: FISCAL_4X_METHOD_KEY,
  labelKey: 'manualInput.methodSelector.fiscal4x',
  descriptionKey: 'manualInput.methodSelector.fiscal4xDescription',
  combinable: false,
  standalone: true,
  preSelectable: true,
  bonusSections: ['fiscal_inputs'],
  mutuallyExclusiveWith: [],
  isAdaptive: false,
  acceptsPreparerMultipleOverride: false,
  requiresVenturePath: false,
  requiresForecastYears: false,
  requiresOwnerCompensation: false,
  appliesRealEstateCarveOut: false,
}
