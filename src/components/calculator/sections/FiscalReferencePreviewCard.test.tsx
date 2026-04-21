import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FiscalReferencePreviewCard } from './FiscalReferencePreviewCard'
import type { Fiscal4xPreviewMetrics } from '@/lib/omniPreview'

// Mirror the next-intl mock pattern used by sibling section tests so the
// rendered text we assert on stays stable across locales.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

// PreviewMetricCard is covered by its own tests; stub it down to plain
// `label:value` so we can assert composition without coupling to its DOM.
vi.mock('./previewMetricCards', () => ({
  PreviewMetricCard: ({
    label,
    value,
    emphasis,
  }: {
    label: string
    value: string
    emphasis?: 'default' | 'primary'
  }) => (
    <div
      data-testid="metric-card"
      data-emphasis={emphasis ?? 'default'}
    >{`${label}:${value}`}</div>
  ),
}))

// Radix Tooltip uses a portal; for unit tests we render the inner content
// inline so we can assert the tooltip text is wired to the trigger.
vi.mock('@/design-system/components/Tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipRoot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}))

// Deterministic stub formatter so assertions don't depend on the host
// ICU/CLDR version (en-BE thousands separator changed across Node majors).
const fmt = {
  format: (n: number) => `€${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
} as unknown as Intl.NumberFormat

const baseMetrics: Fiscal4xPreviewMetrics = {
  available: true,
  fiscalAnchor: 380_000,
  bookEquityUsed: 120_000,
  impliedFiscalEquity: 500_000,
  ownershipMultiplierApplied: 1,
}

describe('FiscalReferencePreviewCard', () => {
  it('renders the formula trio when the engine returns a fully available preview', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={baseMetrics}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    const cards = screen.getAllByTestId('metric-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('fields.fiscalPreviewAnchor:€380,000')
    expect(cards[1]).toHaveTextContent('fields.fiscalPreviewBookEquity:€120,000')
    expect(cards[2]).toHaveTextContent('fields.fiscalPreviewImpliedEquity:€500,000')
    // Implied EV is the calculation result and must be visually emphasised.
    expect(cards[2]).toHaveAttribute('data-emphasis', 'primary')
    expect(screen.queryByTestId('fiscal-preview-empty-state')).toBeNull()
    expect(screen.queryByTestId('fiscal-preview-warning')).toBeNull()
  })

  it('renders the ownership badge with a tooltip explaining the multiplier', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={baseMetrics}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    const badge = screen.getByTestId('fiscal-preview-ownership-badge')
    expect(badge).toHaveAttribute('aria-label', 'fields.fiscalPreviewOwnershipStake')
    expect(badge).toHaveTextContent('fields.fiscalPreviewOwnershipStake')
    expect(badge).toHaveTextContent('fields.fiscalPreviewOwnershipStakeValue:pct=100')
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
      'fields.fiscalPreviewOwnershipStakeHint'
    )
  })

  it('omits the ownership badge when no multiplier is available', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{ ...baseMetrics, ownershipMultiplierApplied: null }}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    expect(screen.queryByTestId('fiscal-preview-ownership-badge')).toBeNull()
    expect(screen.queryByTestId('tooltip-content')).toBeNull()
    // Formula must still render; the badge is meta-only.
    expect(screen.getAllByTestId('metric-card')).toHaveLength(3)
  })

  it('shows the empty-state row when the engine returns no fiscal anchor', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          available: false,
          unavailableReason: 'missing_ebitda',
          fiscalAnchor: null,
          bookEquityUsed: null,
          impliedFiscalEquity: null,
          ownershipMultiplierApplied: 1,
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage="Vul EBITDA in om het fiscale anker te tonen."
      />
    )

    const empty = screen.getByTestId('fiscal-preview-empty-state')
    expect(empty).toHaveTextContent('Vul EBITDA in om het fiscale anker te tonen.')
    // No formula cards should render in the empty state — that was the
    // "wall of dashes" the redesign explicitly avoids.
    expect(screen.queryByTestId('metric-card')).toBeNull()
    expect(screen.queryByTestId('fiscal-preview-formula')).toBeNull()
  })

  it('renders the formula and a warning when the anchor is known but book equity is missing', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          available: false,
          unavailableReason: 'missing_book_equity',
          fiscalAnchor: 380_000,
          bookEquityUsed: null,
          impliedFiscalEquity: null,
          ownershipMultiplierApplied: 1,
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage="Eigen vermogen ontbreekt."
      />
    )

    // Formula stays visible so the user can see what they unlocked
    // (anchor) and what's still needed (book equity → implied EV).
    const cards = screen.getAllByTestId('metric-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('fields.fiscalPreviewAnchor:€380,000')
    expect(cards[1]).toHaveTextContent('fields.fiscalPreviewBookEquity:—')
    expect(cards[2]).toHaveTextContent('fields.fiscalPreviewImpliedEquity:—')
    expect(screen.getByTestId('fiscal-preview-warning')).toHaveTextContent(
      'Eigen vermogen ontbreekt.'
    )
  })

  it('exposes the formula relationship to assistive tech via aria-label', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={baseMetrics}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    const formula = screen.getByTestId('fiscal-preview-formula')
    expect(formula).toHaveAttribute('role', 'group')
    expect(formula).toHaveAttribute('aria-label', 'fields.fiscalPreviewFormulaA11y')
  })

  it('renders em-dash placeholders instead of NaN/Infinity when values are not finite', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          available: true,
          fiscalAnchor: Number.POSITIVE_INFINITY,
          bookEquityUsed: Number.NaN,
          impliedFiscalEquity: 500_000,
          ownershipMultiplierApplied: 1,
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    const cards = screen.getAllByTestId('metric-card')
    expect(cards[0]).toHaveTextContent('fields.fiscalPreviewAnchor:—')
    expect(cards[1]).toHaveTextContent('fields.fiscalPreviewBookEquity:—')
    expect(cards[2]).toHaveTextContent('fields.fiscalPreviewImpliedEquity:€500,000')
  })
})
