import { motion } from 'framer-motion'

import type { LiquidationAdvancedFieldKey } from '@/lib/methods/liquidation_analysis/liquidationInputConfig'
import { CurrencyInput } from '../CurrencyInput'
import { IntegerInput } from './IntegerInput'
import {
  LIQUIDATION_PANEL_GROUP,
  LiquidationPercentInput,
} from './LiquidationInputsSectionControls'

interface LiquidationInputsAdvancedPanelProps {
  panelId: string
  liqTaxableReserves?: number
  liqRunwayMonthsOrderly?: number
  liqRunwayMonthsForced?: number
  liqDistressWaccOrderly?: number
  liqDistressWaccForced?: number
  liqIntangiblesUpliftPct?: number
  liqMultiplesValueOverride?: number
  onFieldChange: (field: LiquidationAdvancedFieldKey, value: number | undefined) => void
  disabled?: boolean
  t: (key: string) => string
}

export function LiquidationInputsAdvancedPanel({
  panelId,
  liqTaxableReserves,
  liqRunwayMonthsOrderly,
  liqRunwayMonthsForced,
  liqDistressWaccOrderly,
  liqDistressWaccForced,
  liqIntangiblesUpliftPct,
  liqMultiplesValueOverride,
  onFieldChange,
  disabled,
  t,
}: LiquidationInputsAdvancedPanelProps) {
  return (
    <motion.div
      id={panelId}
      role="region"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.15 }}
      className={LIQUIDATION_PANEL_GROUP}
      data-testid="liq-advanced-section"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CurrencyInput
          id="liq_taxable_reserves"
          name="liq_taxable_reserves"
          label={t('taxableReservesLabel')}
          description={t('taxableReservesHint')}
          value={liqTaxableReserves}
          onChange={(next) => onFieldChange('liq_taxable_reserves', next)}
          disabled={disabled}
          truncateLabel={false}
        />
        <IntegerInput
          label={t('runwayMonthsLabel')}
          description={t('runwayMonthsHint')}
          value={liqRunwayMonthsOrderly}
          onChange={(next) => onFieldChange('liq_runway_months_orderly', next)}
          min={1}
          max={24}
          placeholder={t('runwayMonthsPlaceholder')}
          disabled={disabled}
        />
        <IntegerInput
          label={t('runwayMonthsForcedLabel')}
          description={t('runwayMonthsForcedHint')}
          value={liqRunwayMonthsForced}
          onChange={(next) => onFieldChange('liq_runway_months_forced', next)}
          min={1}
          max={12}
          placeholder={t('runwayMonthsForcedPlaceholder')}
          disabled={disabled}
        />
        <LiquidationPercentInput
          name="liq_distress_wacc_orderly"
          label={t('distressWaccLabel')}
          description={t('distressWaccHint')}
          placeholder={t('distressWaccPlaceholder')}
          value={liqDistressWaccOrderly}
          onChange={(next) => onFieldChange('liq_distress_wacc_orderly', next)}
          disabled={disabled}
          testId="liq-distress-wacc-input"
        />
        <LiquidationPercentInput
          name="liq_distress_wacc_forced"
          label={t('distressWaccForcedLabel')}
          description={t('distressWaccForcedHint')}
          placeholder={t('distressWaccForcedPlaceholder')}
          value={liqDistressWaccForced}
          onChange={(next) => onFieldChange('liq_distress_wacc_forced', next)}
          disabled={disabled}
          testId="liq-distress-wacc-forced-input"
        />
        <LiquidationPercentInput
          name="liq_intangibles_uplift_pct"
          label={t('intangiblesUpliftLabel')}
          description={t('intangiblesUpliftHint')}
          placeholder={t('intangiblesUpliftPlaceholder')}
          value={liqIntangiblesUpliftPct}
          onChange={(next) => onFieldChange('liq_intangibles_uplift_pct', next)}
          disabled={disabled}
          testId="liq-intangibles-uplift-input"
        />
        <div className="sm:col-span-2">
          <CurrencyInput
            id="liq_multiples_value_override"
            name="liq_multiples_value_override"
            label={t('multiplesValueLabel')}
            description={t('multiplesValueHint')}
            value={liqMultiplesValueOverride}
            onChange={(next) => onFieldChange('liq_multiples_value_override', next)}
            disabled={disabled}
            truncateLabel={false}
          />
        </div>
      </div>
    </motion.div>
  )
}
