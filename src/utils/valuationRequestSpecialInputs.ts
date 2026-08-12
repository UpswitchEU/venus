import {
  LIQUIDATION_ASSET_CLASS_CODES,
  LIQUIDATION_LIABILITY_BUCKET_CODES,
} from '@/lib/methods/liquidation_analysis/liquidationInputConfig'
import {
  buildLiquidationAssetOverrides,
  buildLiquidationLiabilityBuckets,
} from '@/lib/methods/liquidation_analysis/liquidationInputModel'
import { calculateLatencyAmount, useTaxLatencyStore } from '../store/useTaxLatencyStore'
import type { SafeNoteInput, ValuationFormData, ValuationRequest } from '../types/valuation'

type FormDataRecord = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function applyTaxLatencyBalanceSheetAdjustments(
  request: ValuationRequest,
  formData: ValuationFormData
): void {
  const existingBalanceSheetAdjustments = Array.isArray(formData.balance_sheet_adjustments)
    ? formData.balance_sheet_adjustments
    : []
  const taxLatencyItems = useTaxLatencyStore.getState().items
  const taxLatencyAdjustments: ValuationRequest['balance_sheet_adjustments'] =
    taxLatencyItems.length > 0
      ? taxLatencyItems.map((item) => ({
          id: item.id,
          label: item.description || item.accountName || 'Belastinglatentie',
          amount: Math.abs(calculateLatencyAmount(item)),
          type: item.type === 'active' ? ('add' as const) : ('subtract' as const),
          category: 'tax_latency' as const,
          description: item.description,
          ...(item.accountCode ? { account_code: item.accountCode } : {}),
          temporary_difference: Math.abs(item.temporaryDifference),
          tax_rate: item.taxRate,
          tax_latency_type: item.type,
          ...(item.status ? { status: item.status } : {}),
          ...(item.evidence_id ? { evidence_id: item.evidence_id } : {}),
          ...(item.reviewed_at ? { reviewed_at: item.reviewed_at } : {}),
          ...(item.rule_version ? { rule_version: item.rule_version } : {}),
          ...(item.approved_by ? { approved_by: item.approved_by } : {}),
          ...(item.currency ? { currency: item.currency } : {}),
          ...(item.fiscal_year != null ? { fiscal_year: item.fiscal_year } : {}),
          ...(item.effective_date ? { effective_date: item.effective_date } : {}),
        }))
      : []

  const mergedBalanceSheetAdjustments =
    taxLatencyItems.length > 0
      ? [
          ...existingBalanceSheetAdjustments.filter(
            (adjustment) => adjustment.category !== 'tax_latency'
          ),
          ...taxLatencyAdjustments,
        ]
      : existingBalanceSheetAdjustments

  if (mergedBalanceSheetAdjustments.length > 0) {
    request.balance_sheet_adjustments = mergedBalanceSheetAdjustments
  }

  const hasTaxLatencyAdjustment = mergedBalanceSheetAdjustments.some(
    (adjustment) => adjustment.category === 'tax_latency'
  )
  if (
    !hasTaxLatencyAdjustment &&
    Array.isArray(formData.tax_latencies) &&
    formData.tax_latencies.length > 0
  ) {
    request.tax_latencies = formData.tax_latencies
  }
}

export function applyCapitalHistoryInputs(request: ValuationRequest, fd: FormDataRecord): void {
  const directInvestmentAmount = toFiniteNumber(fd.investment_amount_sought)
  if (directInvestmentAmount != null && directInvestmentAmount >= 0) {
    request.investment_amount_sought = directInvestmentAmount
  }
  const capRoundAmount = toFiniteNumber(fd.capital_round_amount)
  if (capRoundAmount != null && capRoundAmount > 0) {
    request.investment_amount_sought = capRoundAmount
  }

  const capSafeNotes: SafeNoteInput[] = Array.isArray(fd.capital_safe_notes)
    ? (fd.capital_safe_notes as SafeNoteInput[])
    : []
  const cleanedSafeNotes = capSafeNotes
    .filter((n) => n && typeof n === 'object' && toFiniteNumber(n.amount) != null)
    .map((n) => {
      const note: Record<string, unknown> = { amount: Number(n.amount) }
      const valuationCap = toFiniteNumber(n.valuation_cap)
      if (valuationCap != null) note.valuation_cap = valuationCap
      const discountPct = toFiniteNumber(n.discount_pct)
      if (discountPct != null) note.discount_pct = discountPct
      const holderLabel = typeof n.holder_label === 'string' ? n.holder_label.trim() : ''
      if (holderLabel) note.holder_label = holderLabel
      return note
    })
  const optionPoolPct = toFiniteNumber(fd.capital_option_pool_pct)
  const lastRoundAmount = toFiniteNumber(fd.capital_last_round_amount)
  const lastRoundPostMoney = toFiniteNumber(fd.capital_last_round_post_money)
  const lastRoundDate =
    typeof fd.capital_last_round_date === 'string' && fd.capital_last_round_date.trim().length > 0
      ? fd.capital_last_round_date.trim()
      : null

  const hasCapTableSignal =
    Boolean(fd.capital_history_enabled) &&
    (cleanedSafeNotes.length > 0 ||
      (optionPoolPct != null && optionPoolPct > 0) ||
      (lastRoundAmount != null && lastRoundAmount > 0) ||
      (lastRoundPostMoney != null && lastRoundPostMoney > 0) ||
      lastRoundDate != null)

  const directCapTable = isRecord(fd.cap_table) ? fd.cap_table : null
  if (directCapTable) {
    request.cap_table = { ...directCapTable } as ValuationRequest['cap_table']
  }

  if (hasCapTableSignal) {
    request.cap_table = {
      ...(request.cap_table ?? {}),
      ...(optionPoolPct != null ? { option_pool_pct: optionPoolPct } : {}),
      ...(cleanedSafeNotes.length > 0
        ? {
            safe_notes: cleanedSafeNotes as NonNullable<
              ValuationRequest['cap_table']
            >['safe_notes'],
          }
        : {}),
      ...(lastRoundAmount != null ? { last_round_amount: lastRoundAmount } : {}),
      ...(lastRoundPostMoney != null ? { last_round_post_money: lastRoundPostMoney } : {}),
      ...(lastRoundDate != null ? { last_round_date: lastRoundDate } : {}),
    }
  }
}

export function applyLiquidationInputs(request: ValuationRequest, fd: FormDataRecord): void {
  const liquidationInputs: Record<string, unknown> = isRecord(fd.liquidation_inputs)
    ? { ...fd.liquidation_inputs }
    : {}
  if (fd.liq_headcount != null && Number.isFinite(Number(fd.liq_headcount))) {
    liquidationInputs.headcount = Math.max(0, Math.floor(Number(fd.liq_headcount)))
  }
  if (fd.liq_monthly_rent != null && Number.isFinite(Number(fd.liq_monthly_rent))) {
    liquidationInputs.monthly_rent = Number(fd.liq_monthly_rent)
  }
  if (fd.liq_paid_up_capital != null && Number.isFinite(Number(fd.liq_paid_up_capital))) {
    liquidationInputs.paid_up_capital = Number(fd.liq_paid_up_capital)
  }
  if (fd.liq_deferred_tax != null && Number.isFinite(Number(fd.liq_deferred_tax))) {
    liquidationInputs.deferred_tax_liabilities = Number(fd.liq_deferred_tax)
  }
  const liqPremise = fd.liq_premise_override
  if (liqPremise === 'orderly_liquidation' || liqPremise === 'forced_liquidation') {
    liquidationInputs.owner_premise_override = liqPremise
  }
  if (fd.liq_taxable_reserves != null && Number.isFinite(Number(fd.liq_taxable_reserves))) {
    liquidationInputs.taxable_reserves = Number(fd.liq_taxable_reserves)
  }
  if (
    fd.liq_runway_months_orderly != null &&
    Number.isFinite(Number(fd.liq_runway_months_orderly))
  ) {
    liquidationInputs.runway_months_orderly = Math.max(
      1,
      Math.floor(Number(fd.liq_runway_months_orderly))
    )
  }
  if (fd.liq_runway_months_forced != null && Number.isFinite(Number(fd.liq_runway_months_forced))) {
    liquidationInputs.runway_months_forced = Math.max(
      1,
      Math.floor(Number(fd.liq_runway_months_forced))
    )
  }
  if (
    fd.liq_distress_wacc_orderly != null &&
    Number.isFinite(Number(fd.liq_distress_wacc_orderly))
  ) {
    liquidationInputs.distress_wacc_orderly = Math.max(0, Number(fd.liq_distress_wacc_orderly))
  }
  if (fd.liq_distress_wacc_forced != null && Number.isFinite(Number(fd.liq_distress_wacc_forced))) {
    liquidationInputs.distress_wacc_forced = Math.max(0, Number(fd.liq_distress_wacc_forced))
  }
  if (
    fd.liq_realised_capital_gains != null &&
    Number.isFinite(Number(fd.liq_realised_capital_gains))
  ) {
    const gains = Number(fd.liq_realised_capital_gains)
    if (gains > 0) {
      liquidationInputs.realised_capital_gains = gains
    }
  }
  if (
    fd.liq_intangibles_uplift_pct != null &&
    Number.isFinite(Number(fd.liq_intangibles_uplift_pct))
  ) {
    liquidationInputs.identifiable_intangibles_uplift_pct = Math.max(
      0,
      Number(fd.liq_intangibles_uplift_pct)
    )
  }
  if (
    fd.liq_multiples_value_override != null &&
    Number.isFinite(Number(fd.liq_multiples_value_override))
  ) {
    liquidationInputs.multiples_value_override = Number(fd.liq_multiples_value_override)
  }

  const liabilityBuckets = buildLiquidationLiabilityBuckets(fd, LIQUIDATION_LIABILITY_BUCKET_CODES)
  if (Object.keys(liabilityBuckets).length > 0) {
    liquidationInputs.liability_buckets = liabilityBuckets
  }

  const assetOverrides = buildLiquidationAssetOverrides(fd, LIQUIDATION_ASSET_CLASS_CODES)
  if (Object.keys(assetOverrides).length > 0) {
    liquidationInputs.asset_overrides = assetOverrides
  }
  if (Object.keys(liquidationInputs).length > 0) {
    request.liquidation_inputs = liquidationInputs as ValuationRequest['liquidation_inputs']
  }
}

export function applyFiscalInputs(request: ValuationRequest, fd: FormDataRecord): void {
  const fiscalInputs: Record<string, unknown> = isRecord(fd.fiscal_inputs)
    ? { ...fd.fiscal_inputs }
    : {}
  if (fd.fiscal_acquisition_cost != null && Number.isFinite(Number(fd.fiscal_acquisition_cost))) {
    fiscalInputs.acquisition_cost = Number(fd.fiscal_acquisition_cost)
  }
  if (fd.fiscal_anchor_2_value != null && Number.isFinite(Number(fd.fiscal_anchor_2_value))) {
    fiscalInputs.anchor_2_value = Number(fd.fiscal_anchor_2_value)
  }
  if (fd.fiscal_anchor_3_value != null && Number.isFinite(Number(fd.fiscal_anchor_3_value))) {
    fiscalInputs.anchor_3_value = Number(fd.fiscal_anchor_3_value)
  }
  if (fd.fiscal_anchor_4_value != null && Number.isFinite(Number(fd.fiscal_anchor_4_value))) {
    fiscalInputs.anchor_4_value = Number(fd.fiscal_anchor_4_value)
  }
  if (Object.keys(fiscalInputs).length > 0) {
    ;(
      request as ValuationRequest & {
        fiscal_inputs?: Record<string, unknown>
      }
    ).fiscal_inputs = fiscalInputs
  }
}
