import { motion } from 'framer-motion'

import { CurrencyInput } from '../CurrencyInput'
import { LIQUIDATION_PANEL_GROUP } from './LiquidationInputsSectionControls'

interface LiquidationCollectionItem<TCode extends string> {
  code: TCode
  i18nKey: string
}

interface LiquidationInputsCollectionPanelProps<TCode extends string, TField extends string> {
  panelId: string
  testId: string
  subtitle: string
  items: ReadonlyArray<LiquidationCollectionItem<TCode>>
  values?: Partial<Record<TCode, number>>
  getFieldName: (item: LiquidationCollectionItem<TCode>) => TField
  getLabel: (item: LiquidationCollectionItem<TCode>) => string
  getDescription: (item: LiquidationCollectionItem<TCode>) => string
  onFieldChange: (field: TField, value: number | undefined) => void
  disabled?: boolean
}

export function LiquidationInputsCollectionPanel<TCode extends string, TField extends string>({
  panelId,
  testId,
  subtitle,
  items,
  values,
  getFieldName,
  getLabel,
  getDescription,
  onFieldChange,
  disabled,
}: LiquidationInputsCollectionPanelProps<TCode, TField>) {
  return (
    <motion.div
      id={panelId}
      role="region"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.15 }}
      className={LIQUIDATION_PANEL_GROUP}
      data-testid={testId}
    >
      <p className="text-[11px] leading-snug text-foreground/55">{subtitle}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const formKey = getFieldName(item)
          return (
            <CurrencyInput
              key={item.code}
              id={formKey}
              name={formKey}
              label={getLabel(item)}
              description={getDescription(item)}
              value={values?.[item.code]}
              onChange={(next) => onFieldChange(formKey, next)}
              disabled={disabled}
              truncateLabel={false}
            />
          )
        })}
      </div>
    </motion.div>
  )
}
