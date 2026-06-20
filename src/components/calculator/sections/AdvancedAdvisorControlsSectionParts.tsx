import { Info, RotateCcw } from 'lucide-react'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraFormAlert } from '@/design-system/components/FormSection'
import { Slider } from '@/design-system/components/Slider'
import { Switch } from '@/design-system/components/Switch'
import type {
  ActivePreviewChangeKey,
  AdvancedAdvisorLivePreview,
  AdvisorDiscountKey,
  MultipleTypeKey,
} from './advancedAdvisorControlsModel'
import { ADVISOR_DISCOUNT_ROWS, MULTIPLE_TYPE_ROWS } from './advancedAdvisorControlsModel'

const MISSING_VALUE_LABEL = '\u2014'

function formatSignedCurrency(value: number, currencyFormatter: Intl.NumberFormat) {
  if (value > 0) return `+${currencyFormatter.format(value)}`
  return currencyFormatter.format(value)
}

export function AdvancedAdvisorLivePreviewCard({
  activePreviewChangeKeys,
  currencyFormatter,
  livePreview,
  previewEbitdaBasis,
  signedPercentFormatter,
  t,
}: {
  activePreviewChangeKeys: ActivePreviewChangeKey[]
  currencyFormatter: Intl.NumberFormat
  livePreview: AdvancedAdvisorLivePreview
  previewEbitdaBasis: number | null
  signedPercentFormatter: Intl.NumberFormat
  t: (key: string) => string
}) {
  return (
    <div
      className="rounded-lg border border-primary/15 bg-primary/[0.045] p-4 space-y-3"
      data-testid="advisor-controls-live-preview"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{t('livePreviewTitle')}</div>
          <div className="mt-1 text-xs text-foreground/55">
            {previewEbitdaBasis != null
              ? currencyFormatter.format(previewEbitdaBasis)
              : MISSING_VALUE_LABEL}{' '}
            EBITDA
          </div>
        </div>
        <div
          className={`font-mono text-sm font-semibold tabular-nums ${
            livePreview.deltaValue >= 0 ? 'text-success' : 'text-destructive'
          }`}
          data-testid="advisor-controls-live-preview-delta"
        >
          {formatSignedCurrency(livePreview.deltaValue, currencyFormatter)}
          {livePreview.deltaPercent != null
            ? ` (${signedPercentFormatter.format(livePreview.deltaPercent)}%)`
            : ''}
        </div>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md border border-foreground/10 bg-background/55 px-3 py-2">
          <div className="text-foreground/55">{t('livePreviewBefore')}</div>
          <div
            className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground"
            data-testid="advisor-controls-live-preview-before"
          >
            {currencyFormatter.format(livePreview.beforeValue)}
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-foreground/55">
            {livePreview.beforeMultiple.toFixed(2)}x
          </div>
        </div>
        <div className="rounded-md border border-foreground/10 bg-background/55 px-3 py-2">
          <div className="text-foreground/55">{t('livePreviewAfter')}</div>
          <div
            className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground"
            data-testid="advisor-controls-live-preview-after"
          >
            {currencyFormatter.format(livePreview.afterValue)}
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-foreground/55">
            {livePreview.afterMultiple.toFixed(2)}x
          </div>
        </div>
      </div>

      <div className="space-y-1" data-testid="advisor-controls-curve-shift">
        <div className="h-1.5 rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground/35"
            style={{ width: livePreview.beforeWidth }}
          />
        </div>
        <div className="h-1.5 rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: livePreview.afterWidth }}
          />
        </div>
      </div>

      {activePreviewChangeKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="advisor-controls-active-changes">
          {activePreviewChangeKeys.map((changeKey) => (
            <span
              key={changeKey}
              className="rounded-md border border-primary/15 bg-background/60 px-2 py-1 text-[10px] font-medium text-foreground/65"
            >
              {t(changeKey)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdvisorMultipleTypeBlendPanel({
  disabled,
  multipleBlendWeights,
  onReset,
  onUpdateWeight,
  t,
}: {
  disabled?: boolean
  multipleBlendWeights: Record<MultipleTypeKey, number>
  onReset: () => void
  onUpdateWeight: (key: MultipleTypeKey, nextValue: number) => void
  t: (key: string) => string
}) {
  return (
    <div className="space-y-3 rounded-lg border border-foreground/10 bg-background/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{t('multipleTypeBlendTitle')}</div>
          <p className="text-xs text-foreground/55">{t('multipleTypeBlendSubtitle')}</p>
        </div>
        <AuroraButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled}
          className="gap-1.5 text-xs sm:self-start"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('resetMultipleBlend')}
        </AuroraButton>
      </div>

      <div className="space-y-3">
        {MULTIPLE_TYPE_ROWS.map((row) => {
          const value = multipleBlendWeights[row.key]
          const isModelDefault = value === row.defaultWeight
          return (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-foreground/75">{t(row.labelKey)}</span>
                  <span className="font-mono text-xs tabular-nums text-foreground/60">
                    {value}%
                  </span>
                </div>
                <Slider
                  value={value}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(next) => onUpdateWeight(row.key, next)}
                  disabled={disabled}
                  showTooltip
                  formatValue={(v) => `${Math.round(v)}%`}
                  aria-label={`${t(row.labelKey)} ${t('multipleTypeWeight')}`}
                />
              </div>
              <div className="flex items-end justify-end pb-[0.8125rem]">
                <span className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-[10px] font-medium text-foreground/55">
                  {isModelDefault ? t('discountModelDefault') : t('discountAdvisorWeight')}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AdvisorRiskControlsPanel({
  disabled,
  discountWeights,
  floorFactor,
  onReset,
  onRiskEnabledChange,
  onUpdateDiscountWeight,
  onUpdateFloorFactor,
  riskEnabled,
  t,
}: {
  disabled?: boolean
  discountWeights: Record<AdvisorDiscountKey, number>
  floorFactor: number
  onReset: () => void
  onRiskEnabledChange: (checked: boolean) => void
  onUpdateDiscountWeight: (key: AdvisorDiscountKey, nextValue: number) => void
  onUpdateFloorFactor: (nextValue: number) => void
  riskEnabled: boolean
  t: (key: string) => string
}) {
  return (
    <div className="space-y-3 rounded-lg border border-foreground/10 bg-background/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Switch
          checked={riskEnabled}
          onChange={onRiskEnabledChange}
          label={t('riskAnalysisToggle')}
          description={t('riskAnalysisToggleDescription')}
          size="sm"
          disabled={disabled}
        />
        <AuroraButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled}
          className="gap-1.5 text-xs sm:self-start"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('resetRiskWeights')}
        </AuroraButton>
      </div>

      {!riskEnabled && (
        <AuroraFormAlert type="info" icon={<Info className="h-3.5 w-3.5" aria-hidden />}>
          {t('preAdjustmentReference')}
        </AuroraFormAlert>
      )}

      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{t('discountWeightingTitle')}</div>
        <p className="text-xs text-foreground/55">{t('discountWeightingSubtitle')}</p>
      </div>

      <div className="space-y-3">
        {ADVISOR_DISCOUNT_ROWS.map((row) => {
          const value = discountWeights[row.key]
          return (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-foreground/75">{t(row.labelKey)}</span>
                  <span className="font-mono text-xs tabular-nums text-foreground/60">
                    {value.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={value}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(next) => onUpdateDiscountWeight(row.key, next)}
                  disabled={disabled || !riskEnabled}
                  showTooltip
                  formatValue={(v) => `${v.toFixed(2)}x`}
                  aria-label={`${t(row.labelKey)} ${t('advisorWeight')}`}
                />
              </div>
              <div className="flex items-end justify-end pb-[0.8125rem]">
                <span className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-[10px] font-medium text-foreground/55">
                  {value === 1 ? t('discountModelDefault') : t('discountAdvisorWeight')}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-1.5 border-t border-foreground/10 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-foreground/75">{t('discountFloor')}</span>
          <span className="font-mono text-xs tabular-nums text-foreground/60">
            {Math.round(floorFactor * 100)}%
          </span>
        </div>
        <Slider
          value={floorFactor}
          min={0}
          max={1}
          step={0.05}
          onChange={onUpdateFloorFactor}
          disabled={disabled || !riskEnabled}
          showTooltip
          formatValue={(v) => `${Math.round(v * 100)}%`}
          aria-label={t('discountFloorAriaLabel')}
        />
      </div>
    </div>
  )
}
