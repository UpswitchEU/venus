import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Fiscal4xPreviewMetrics } from '@/lib/omniPreview'
import { FiscalReferencePreviewCard } from './FiscalReferencePreviewCard'

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
    <div data-testid="metric-card" data-emphasis={emphasis ?? 'default'}>{`${label}:${value}`}</div>
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
  ebitdaForAnchor: 95_000,
  ebitdaSource: 'reported_latest_complete_year',
  fiscalAnchor: 380_000,
  bookEquityUsed: 120_000,
  impliedFiscalEquity: 500_000,
  ownershipMultiplierApplied: 1,
}

describe('FiscalReferencePreviewCard', () => {
  it('exposes the weighted EBITDA disclosure through a header help tooltip when relevant', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          ...baseMetrics,
          ebitdaSource: 'weighted_normalized_historical',
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    // The disclosure moved out of the number rail and into a tooltip
    // anchored to a header HelpCircle so it stops crowding the formula.
    const helpButton = screen.getByTestId('fiscal-preview-ebitda-basis-help')
    expect(helpButton).toHaveAttribute('aria-label', 'fields.fiscalPreviewEbitdaBasisWeighted')
    expect(screen.getByText('fields.fiscalPreviewEbitdaBasisWeighted')).toBeTruthy()
  })

  it('omits the EBITDA-basis tooltip when the engine used the raw single-year source', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          ...baseMetrics,
          ebitdaSource: 'reported_latest_complete_year',
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    expect(screen.queryByTestId('fiscal-preview-ebitda-basis-help')).toBeNull()
  })

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
          ebitdaForAnchor: null,
          ebitdaSource: null,
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

  it('renders a single hero anchor card + actionable callout when book equity is missing', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          available: false,
          unavailableReason: 'missing_book_equity',
          ebitdaForAnchor: 95_000,
          ebitdaSource: 'reported_latest_complete_year',
          fiscalAnchor: 380_000,
          bookEquityUsed: null,
          impliedFiscalEquity: null,
          ownershipMultiplierApplied: 1,
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage="Eigen vermogen ontbreekt."
      />
    )

    // Previous design rendered three cards with two em-dashes; that
    // read as "calculator broken" instead of "anchor available, equity
    // pending." Now we render the anchor as a primary hero card and
    // surface the missing-equity callout as a dedicated action block,
    // and the 3-card formula must NOT render.
    expect(screen.queryByTestId('fiscal-preview-formula')).toBeNull()
    const anchorOnly = screen.getByTestId('fiscal-preview-anchor-only')
    expect(anchorOnly).toBeTruthy()
    const cards = screen.getAllByTestId('metric-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('fields.fiscalPreviewAnchor:€380,000')
    expect(cards[0]).toHaveAttribute('data-emphasis', 'primary')
    expect(screen.getByTestId('fiscal-preview-warning')).toHaveTextContent(
      'Eigen vermogen ontbreekt.'
    )
    expect(screen.getByTestId('fiscal-preview-warning')).toHaveTextContent(
      'fields.fiscalPreviewMissingEquityAction'
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

  it('does not leak NaN/Infinity to the DOM when the engine emits degenerate floats', () => {
    render(
      <FiscalReferencePreviewCard
        fiscalPreview={{
          available: true,
          ebitdaForAnchor: 95_000,
          ebitdaSource: 'reported_latest_complete_year',
          fiscalAnchor: Number.POSITIVE_INFINITY,
          bookEquityUsed: Number.NaN,
          impliedFiscalEquity: 500_000,
          ownershipMultiplierApplied: 1,
        }}
        previewCurrencyFormatter={fmt}
        unavailableMessage={null}
      />
    )

    // With NaN book equity, the formula collapses to anchor-only mode.
    // The infinite anchor is rendered as an em-dash (not "Infinity")
    // so the UI never leaks raw IEEE-754 sentinels.
    const cards = screen.getAllByTestId('metric-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('fields.fiscalPreviewAnchor:—')
    // No formula and no `Infinity`/`NaN` substrings anywhere in the card.
    expect(screen.queryByTestId('fiscal-preview-formula')).toBeNull()
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull()
  })
})
