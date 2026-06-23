'use client'

/**
 * Meerwaarde-tax left-panel section — pure data input.
 *
 * Captures the four amount values used as a possible 31/12/2025 cost-basis
 * reference under the Belgian capital-gains regime (Art. 90 WIB 92; final
 * filing treatment to be confirmed with a tax advisor):
 *
 *   1. Aanschaffingswaarde (historische kostprijs van de aandelen) — primary
 *   2. Anker 2 — contractuele formule (aandeelhoudersovereenkomst) — fallback
 *   3. Anker 3 — markttransactie 2025 — fallback
 *   4. Anker 4 — onafhankelijk waarderingsverslag — fallback
 *
 * UX (rebuild 2026-05-12):
 * - Anchor 1 (notarial acquisition cost) is rendered as a primary hero
 *   block. It is the source of truth in ~90% of cases.
 * - Anchors 2-4 collapse behind an "Alternative anchors" disclosure with
 *   a filled-count chip ("0 of 3"). The disclosure latches open the
 *   moment any alternative value transitions from undefined to defined,
 *   so a saved draft hydrating after mount still surfaces its values
 *   (the naïve `useState(altFilled > 0)` only ran on mount and silently
 *   hid hydrated drafts).
 * - Anchors 2-4 render as a vertical stack (not a 3-col grid) — long
 *   NL labels were getting crushed at left-panel widths and the parallel
 *   3-card layout falsely implied equal importance with anchor 1.
 * - Section subtitle states the "hoogste-van-vier" rule once, inline,
 *   instead of relying on the report page to do so.
 * - Progress chip ("X of 4 anchors filled") mirrors the
 *   LiquidationInputsSection pattern for visual consistency across
 *   manual-flow advisor sections.
 *
 * A11y:
 * - Each AnchorRow generates a stable id via `useId`, wires
 *   `<label htmlFor={id}>` to the input, and passes the composite
 *   "{Eyebrow} — {label}" as `ariaLabel` so screen readers get a
 *   single accessible name even when the eyebrow chip is decorative.
 * - The disclosure button is a real `<button aria-expanded
 *   aria-controls>` pair, and the chevron rotates rather than
 *   swapping characters (no AT speech for the transition).
 *
 * Field-to-engine mapping (set in `buildValuationRequest`):
 *   - fiscal_acquisition_cost   → fiscal_inputs.acquisition_cost
 *   - fiscal_anchor_2_value     → fiscal_inputs.anchor_2_value
 *   - fiscal_anchor_3_value     → fiscal_inputs.anchor_3_value
 *   - fiscal_anchor_4_value     → fiscal_inputs.anchor_4_value
 *
 * Advisory metadata (peildatum, company role, EBITDA basis, internal-
 * transfer flag, acknowledged-anchors attestation) is intentionally
 * NOT captured here — auto-derived by the report builder.
 */

import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useId, useState } from 'react'

import { cn } from '@/design-system/utils'

import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

function AnchorRow({
  htmlFor,
  eyebrow,
  label,
  hint,
  children,
}: {
  htmlFor: string
  eyebrow: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 cursor-pointer">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
          {eyebrow}
        </span>
        <span className="text-xs font-medium text-foreground/85">{label}</span>
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
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
  const reactId = useId()
  // One stable id per input so `<label htmlFor>` lines up with the
  // underlying `<input id>` rendered by CurrencyInput → AuroraInput.
  const ids = {
    anchor1: `${reactId}-anchor-1`,
    anchor2: `${reactId}-anchor-2`,
    anchor3: `${reactId}-anchor-3`,
    anchor4: `${reactId}-anchor-4`,
  }

  const altValues = [fiscalAnchor2Value, fiscalAnchor3Value, fiscalAnchor4Value]
  const altFilled = altValues.filter((v) => v !== undefined).length
  const totalFilled = (fiscalAcquisitionCost !== undefined ? 1 : 0) + altFilled

  // Disclosure state — latching open: once an alternative value is
  // present we open and never auto-close, so the user's manual
  // collapse (a deliberate UX gesture) is respected after they fill a
  // value, but a freshly-hydrated draft also opens automatically.
  const [showAlternatives, setShowAlternatives] = useState(false)
  useEffect(() => {
    if (altFilled > 0) {
      setShowAlternatives(true)
    }
    // Intentionally only re-opens when altFilled transitions upward.
    // We do NOT collapse on user-driven blanking — that would yank
    // the panel out from under the user mid-edit.
  }, [altFilled])

  const ariaAnchor1 = `${t('anchor1Eyebrow')} — ${t('anchor1Label')}`
  const ariaAnchor2 = `${t('anchor2Eyebrow')} — ${t('anchor2Short')}`
  const ariaAnchor3 = `${t('anchor3Eyebrow')} — ${t('anchor3Short')}`
  const ariaAnchor4 = `${t('anchor4Eyebrow')} — ${t('anchor4Short')}`

  return (
    <motion.section
      key="fiscal_inputs"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-3 rounded-xl border border-primary/10 bg-primary/[0.03] p-3"
      data-testid="fiscal-inputs-section"
    >
      <div className="space-y-1.5">
        <ValuationSectionHeader
          step={step}
          title={t('title')}
          complete={fiscalAcquisitionCost !== undefined}
        />
        <p className="pl-8 text-[11px] leading-snug text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Progress chip — same visual rhythm as LiquidationInputsSection. */}
      <div
        className="flex items-center gap-2 rounded-md bg-primary/[0.06] px-2.5 py-1.5 text-[11px] text-foreground/70"
        data-testid="fiscal-inputs-progress"
        aria-live="polite"
      >
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
        {t('progress', { filled: totalFilled, total: 4 })}
      </div>

      {/* Primary: Anchor 1 — notarial acquisition value. Hero card with
          a stronger border so it visually outranks the alternatives. */}
      <div
        className="space-y-2 rounded-lg border border-primary/15 bg-background/80 p-3"
        data-testid="fiscal-anchor-1-block"
      >
        <AnchorRow
          htmlFor={ids.anchor1}
          eyebrow={t('anchor1Eyebrow')}
          label={t('anchor1Label')}
          hint={t('anchor1Hint')}
        >
          <CurrencyInput
            id={ids.anchor1}
            ariaLabel={ariaAnchor1}
            value={fiscalAcquisitionCost}
            onChange={(next) => onFieldChange('fiscal_acquisition_cost', next)}
            disabled={disabled}
            placeholder={t('anchor1Placeholder')}
          />
        </AnchorRow>
      </div>

      {/* Alternative anchors — collapsed by default. Highest of four
          rule means most advisors only need anchor 1. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowAlternatives((s) => !s)}
          aria-expanded={showAlternatives}
          aria-controls="fiscal-alternative-anchors"
          className="flex w-full items-center justify-between rounded-lg border border-primary/10 bg-background/60 px-3 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          data-testid="fiscal-alternative-anchors-toggle"
        >
          <span className="flex items-center gap-2">
            <span>{t('alternativeAnchorsToggle')}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors',
                altFilled > 0
                  ? 'bg-primary/15 text-primary'
                  : 'bg-foreground/[0.06] text-foreground/60'
              )}
              data-testid="fiscal-alternative-anchors-count"
            >
              {t('alternativeAnchorsCount', { filled: altFilled })}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              showAlternatives && 'rotate-180'
            )}
          />
        </button>

        {showAlternatives ? (
          <motion.div
            id="fiscal-alternative-anchors"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.15 }}
            className="space-y-4 rounded-lg border border-primary/10 bg-background/60 p-3"
            data-testid="fiscal-alternative-anchors-panel"
          >
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t('alternativeAnchorsHint')}
            </p>
            <AnchorRow
              htmlFor={ids.anchor2}
              eyebrow={t('anchor2Eyebrow')}
              label={t('anchor2Short')}
              hint={t('anchor2Hint')}
            >
              <CurrencyInput
                id={ids.anchor2}
                ariaLabel={ariaAnchor2}
                value={fiscalAnchor2Value}
                onChange={(next) => onFieldChange('fiscal_anchor_2_value', next)}
                disabled={disabled}
              />
            </AnchorRow>
            <AnchorRow
              htmlFor={ids.anchor3}
              eyebrow={t('anchor3Eyebrow')}
              label={t('anchor3Short')}
              hint={t('anchor3Hint')}
            >
              <CurrencyInput
                id={ids.anchor3}
                ariaLabel={ariaAnchor3}
                value={fiscalAnchor3Value}
                onChange={(next) => onFieldChange('fiscal_anchor_3_value', next)}
                disabled={disabled}
              />
            </AnchorRow>
            <AnchorRow
              htmlFor={ids.anchor4}
              eyebrow={t('anchor4Eyebrow')}
              label={t('anchor4Short')}
              hint={t('anchor4Hint')}
            >
              <CurrencyInput
                id={ids.anchor4}
                ariaLabel={ariaAnchor4}
                value={fiscalAnchor4Value}
                onChange={(next) => onFieldChange('fiscal_anchor_4_value', next)}
                disabled={disabled}
              />
            </AnchorRow>
          </motion.div>
        ) : null}
      </div>
    </motion.section>
  )
}
