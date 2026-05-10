'use client'

/**
 * Meerwaarde-tax left-panel section — pure data input.
 *
 * Captures the four amount values needed to file the cedent's 31/12/2025
 * cost basis under the Belgian capital-gains regime (Wet 22/12/2024,
 * Art. 90 WIB 92, effective 01/01/2026):
 *
 *   1. Aanschaffingswaarde (historische kostprijs van de aandelen)
 *   2. Anker 2 — contractuele formule (aandeelhoudersovereenkomst)
 *   3. Anker 3 — markttransactie 2025
 *   4. Anker 4 — onafhankelijk waarderingsverslag
 *
 * The legal "hoogste van vier" rule wins: anchor 1 (forfait) is
 * computed by the engine; this section captures the alternative
 * anchors, and the report picks the highest as the proposed
 * aanschaffingswaarde.
 *
 * Field-to-engine mapping (set in `buildValuationRequest`):
 *   - fiscal_acquisition_cost   → fiscal_inputs.acquisition_cost
 *   - fiscal_anchor_2_value     → fiscal_inputs.anchor_2_value
 *   - fiscal_anchor_3_value     → fiscal_inputs.anchor_3_value
 *   - fiscal_anchor_4_value     → fiscal_inputs.anchor_4_value
 *
 * Advisory metadata (peildatum, company role, EBITDA basis, internal-
 * transfer flag, acknowledged-anchors attestation) is intentionally
 * NOT captured here. Those are auto-derived by the report builder
 * (peildatum from closed_fiscal_year_data.year, company role from KBO
 * NACE, EBITDA basis from `fiscal_uses_normalized_ebitda`) or set via
 * firm/transaction settings on Mercury → Titan metadata pass-through.
 * Putting them in the data rail confused "what the user enters" with
 * "what the report renders" — the rail must stay focused on facts the
 * advisor brings.
 */

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground/80">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export interface FiscalInputsSectionProps {
  step: number
  fiscalAcquisitionCost?: number
  fiscalAnchor2Value?: number
  fiscalAnchor3Value?: number
  fiscalAnchor4Value?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function FiscalInputsSection({
  step,
  fiscalAcquisitionCost,
  fiscalAnchor2Value,
  fiscalAnchor3Value,
  fiscalAnchor4Value,
  onFieldChange,
  disabled,
}: FiscalInputsSectionProps) {
  const t = useTranslations('manualInput.fiscalInputs')

  return (
    <motion.section
      key="fiscal_inputs"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-3 rounded-xl border border-primary/10 bg-primary/[0.03] p-3"
      data-testid="fiscal-inputs-section"
    >
      <ValuationSectionHeader step={step} title={t('title')} complete={false} />
      {/* Section subtitle paragraph removed 2026-05-10 — statutory
          context (Wet 22/12/2024, Art. 90 WIB 92) lives in the fiscal
          report (`fiscal_reference.html` legal-anchors block), not on
          the data-input panel. */}
      <div className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3">
        <FieldRow
          label={t('acquisitionCostLabel')}
          hint={t('acquisitionCostHint')}
        >
          <CurrencyInput
            value={fiscalAcquisitionCost}
            onChange={(next) => onFieldChange('fiscal_acquisition_cost', next)}
            disabled={disabled}
            data-testid="fiscal-acquisition-cost-input"
          />
        </FieldRow>
      </div>

      {/* Three alternative wettelijke ankers — anchor 1 (forfait) is
          engine-derived. */}
      <div className="space-y-3 rounded-lg border border-primary/10 bg-background/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {t('anchorsTitle')}
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldRow label={t('anchor2Label')} hint={t('anchor2Hint')}>
            <CurrencyInput
              value={fiscalAnchor2Value}
              onChange={(next) => onFieldChange('fiscal_anchor_2_value', next)}
              disabled={disabled}
              data-testid="fiscal-anchor-2-input"
            />
          </FieldRow>
          <FieldRow label={t('anchor3Label')} hint={t('anchor3Hint')}>
            <CurrencyInput
              value={fiscalAnchor3Value}
              onChange={(next) => onFieldChange('fiscal_anchor_3_value', next)}
              disabled={disabled}
              data-testid="fiscal-anchor-3-input"
            />
          </FieldRow>
          <FieldRow label={t('anchor4Label')} hint={t('anchor4Hint')}>
            <CurrencyInput
              value={fiscalAnchor4Value}
              onChange={(next) => onFieldChange('fiscal_anchor_4_value', next)}
              disabled={disabled}
              data-testid="fiscal-anchor-4-input"
            />
          </FieldRow>
        </div>
      </div>
    </motion.section>
  )
}
