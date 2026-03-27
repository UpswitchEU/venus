'use client'

import { Landmark } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type RawResult = Record<string, any> | null | undefined

type WaterfallDatum = {
  label: string
  fullLabel: string
  offset: number
  value: number
  signedValue: number
  fill: string
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pickObject(...candidates: unknown[]): Record<string, any> | null {
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, any>
    }
  }
  return null
}

function getStep7Result(result: RawResult): Record<string, any> | null {
  const nested = pickObject(result?.valuation_result)
  const detailedResults = pickObject(result?.detailed_results, nested?.detailed_results)
  const stepResults = pickObject(detailedResults?.step_results)
  const step7 = pickObject(stepResults?.['7'], stepResults?.[7])
  return pickObject(step7?.result, step7)
}

function getReportContext(result: RawResult): Record<string, any> | null {
  const nested = pickObject(result?.valuation_result)
  return pickObject(
    result?.report_context,
    result?.details?.report_context,
    nested?.report_context,
    nested?.details?.report_context
  )
}

function formatCompactCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function buildWaterfallData(result: RawResult, locale: string, t: ReturnType<typeof useTranslations>) {
  const reportContext = getReportContext(result)
  const step7 = getStep7Result(result)

  const enterpriseValue =
    toNumber(reportContext?.enterprise_value_mid) ??
    toNumber(result?.dcf_valuation?.enterprise_value) ??
    toNumber(result?.multiples_valuation?.enterprise_value) ??
    null
  const equityValue =
    toNumber(reportContext?.equity_value) ??
    toNumber(result?.equity_value_mid) ??
    toNumber(result?.dcf_valuation?.equity_value) ??
    toNumber(result?.multiples_valuation?.equity_value) ??
    null

  if (enterpriseValue == null || equityValue == null) {
    return null
  }

  const cash =
    toNumber(reportContext?.cash_balance) ??
    toNumber(step7?.cash) ??
    toNumber(result?.current_year_data?.cash) ??
    0
  const debt =
    toNumber(reportContext?.total_debt) ??
    toNumber(step7?.total_debt) ??
    toNumber(result?.current_year_data?.total_debt) ??
    0
  const nwcAdjustment =
    toNumber(step7?.nwc_surplus_deficit) ??
    toNumber(reportContext?.nwc_surplus_deficit) ??
    0

  let runningTotal = enterpriseValue
  const items: WaterfallDatum[] = [
    {
      label: t('equityBridge.enterpriseShort'),
      fullLabel: t('equityBridge.enterpriseValue'),
      offset: 0,
      value: Math.abs(enterpriseValue),
      signedValue: enterpriseValue,
      fill: '#2563eb',
    },
  ]

  items.push({
    label: t('equityBridge.cashShort'),
    fullLabel: t('equityBridge.cash'),
    offset: runningTotal,
    value: Math.abs(cash),
    signedValue: cash,
    fill: '#16a34a',
  })
  runningTotal += cash

  items.push({
    label: t('equityBridge.debtShort'),
    fullLabel: t('equityBridge.debt'),
    offset: runningTotal - debt,
    value: Math.abs(debt),
    signedValue: -Math.abs(debt),
    fill: '#dc2626',
  })
  runningTotal -= debt

  const nextTotal = runningTotal + nwcAdjustment
  items.push({
    label: t('equityBridge.nwcShort'),
    fullLabel: t('equityBridge.nwc'),
    offset: Math.min(runningTotal, nextTotal),
    value: Math.abs(nwcAdjustment),
    signedValue: nwcAdjustment,
    fill: '#6b7280',
  })
  runningTotal = nextTotal

  items.push({
    label: t('equityBridge.equityShort'),
    fullLabel: t('equityBridge.equityValue'),
    offset: 0,
    value: Math.abs(equityValue),
    signedValue: equityValue,
    fill: '#2563eb',
  })

  return {
    enterpriseValue,
    equityValue,
    chartData: items,
    importedHint: t('equityBridge.dataSourceHint'),
    locale,
  }
}

export function EquityBridgeWaterfall({
  result,
  locale,
}: {
  result: RawResult
  locale: string
}) {
  const t = useTranslations('report')
  const chart = buildWaterfallData(result, locale, t)

  if (!chart) return null

  return (
    <div className="border-b border-primary/15 bg-primary/[0.03] px-4 py-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Landmark className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/75">
            {t('equityBridge.title')}
          </p>
          <p className="text-sm text-foreground/70">{t('equityBridge.blurb')}</p>
          <p className="mt-1 text-[11px] text-foreground/50">{chart.importedHint}</p>
        </div>
      </div>

      <div className="h-72 rounded-xl border border-primary/10 bg-background/80 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart.chartData} margin={{ top: 8, right: 16, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'rgba(100,116,139,0.9)' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={88}
              tickFormatter={(value) => formatCompactCurrency(value, chart.locale)}
              tick={{ fontSize: 11, fill: 'rgba(100,116,139,0.9)' }}
            />
            <Tooltip
              cursor={false}
              formatter={(value: number, _name, payload) => {
                const signedValue = payload?.payload?.signedValue ?? value
                return formatCompactCurrency(signedValue, chart.locale)
              }}
              labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid rgba(37,99,235,0.12)',
                background: 'rgba(255,255,255,0.98)',
              }}
            />
            <Bar dataKey="offset" stackId="bridge" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="bridge" radius={[8, 8, 0, 0]}>
              {chart.chartData.map((entry) => (
                <Cell key={entry.fullLabel} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
