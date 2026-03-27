'use client'

import { ResponsiveContainer, BarChart, Bar, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import type { EvEquityBridge } from '@/services/api/accounting'

export interface EVEquityWaterfallChartProps {
  bridge: EvEquityBridge
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function EVEquityWaterfallChart({ bridge }: EVEquityWaterfallChartProps) {
  const steps = [
    { label: 'Enterprise Value', delta: bridge.enterprise_value, cumulative: bridge.enterprise_value, color: '#6d5efc' },
    { label: 'Cash', delta: bridge.cash_and_equivalents, cumulative: bridge.enterprise_value + bridge.cash_and_equivalents, color: '#14b8a6' },
    { label: 'Long-term Debt', delta: -bridge.long_term_debt, cumulative: bridge.enterprise_value + bridge.cash_and_equivalents - bridge.long_term_debt, color: '#f97316' },
    {
      label: 'Short-term Debt',
      delta: -bridge.short_term_financial_debt,
      cumulative:
        bridge.enterprise_value +
        bridge.cash_and_equivalents -
        bridge.long_term_debt -
        bridge.short_term_financial_debt,
      color: '#ef4444',
    },
    { label: 'Equity Value', delta: bridge.equity_value, cumulative: bridge.equity_value, color: '#22c55e', final: true },
  ]

  const chartData = steps.map((step, index) => {
    if (step.final) {
      return {
        label: step.label,
        offset: 0,
        value: Math.max(step.delta, 0),
        color: step.color,
      }
    }
    const previous = index === 0 ? 0 : steps[index - 1].cumulative
    const offset = step.delta >= 0 ? previous : step.cumulative
    return {
      label: step.label,
      offset,
      value: Math.abs(step.delta),
      color: step.color,
    }
  })

  return (
    <section className="rounded-2xl border border-foreground/10 bg-background/70 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">EV to Equity bridge</h3>
        <p className="mt-1 text-sm text-foreground/65">
          Net debt deduction from imported Yuki cash and financial debt balances.
        </p>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={56} />
            <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ color: '#111827' }}
              labelStyle={{ color: '#111827' }}
            />
            <Bar dataKey="offset" stackId="bridge" fill="transparent" />
            <Bar dataKey="value" stackId="bridge" radius={[8, 8, 0, 0]}>
              <LabelList dataKey="value" position="top" formatter={(value: number) => formatCurrency(value)} />
              {chartData.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-foreground/70 sm:grid-cols-2">
        <div className="rounded-xl bg-background px-3 py-2">Cash: {formatCurrency(bridge.cash_and_equivalents)}</div>
        <div className="rounded-xl bg-background px-3 py-2">
          Interest-bearing debt: {formatCurrency(bridge.interest_bearing_debt)}
        </div>
        <div className="rounded-xl bg-background px-3 py-2">Net debt: {formatCurrency(bridge.net_debt)}</div>
        <div className="rounded-xl bg-background px-3 py-2">Equity value: {formatCurrency(bridge.equity_value)}</div>
      </div>
    </section>
  )
}

export default EVEquityWaterfallChart
