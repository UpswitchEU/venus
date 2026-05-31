import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AttentionSummary } from './AttentionSummary'
import type { QualityWarning, StartupAssistantIssue } from './ChatAssistantTypes'

// Minimal next-intl mock so plural ICU stubs return a deterministic label.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'attentionSummary') return `${values?.total ?? '?'} caveats`
    if (key === 'attentionSummaryWithBlockers') {
      return `${values?.total ?? '?'} caveats · ${values?.blockers ?? '?'} to resolve`
    }
    if (key === 'dismissWarning') return 'Dismiss'
    if (key === 'attentionDismissAll') return 'Dismiss all'
    return key
  },
}))

const startupBlock: StartupAssistantIssue = {
  id: 'missing_investment_ask',
  severity: 'block',
  title: 'No round size',
  body: 'Set a target raise so dilution is shown.',
  action: 'Use a default.',
  ctaLabel: 'Fix with AI',
  ctaPrompt: 'Help me pick a round size.',
  quickFixLabel: 'Use stage default',
  jumpLabel: 'Jump to Round',
}

const qualityWarn: QualityWarning = {
  type: 'net_debt_zero',
  severity: 'medium',
  message: 'Net debt assumed zero',
  recommendation: 'Net debt was assumed to be zero.',
  cta_label: 'Add balance data',
  cta_prompt: 'Help me add cash and debt.',
}

const qualityWarn2: QualityWarning = {
  type: 'method_substitution',
  severity: 'medium',
  message: 'Method was substituted',
  recommendation: 'The requested method was substituted.',
  cta_label: 'Restore method',
  cta_prompt: 'Help me restore the original method.',
}

const qualityInline: QualityWarning = {
  type: 'net_debt_unavailable',
  severity: 'high',
  message: 'Equity value is still an estimate',
  recommendation: 'Add cash, debt and current liabilities.',
  cta_label: 'Add balance figures',
  cta_prompt: 'Help me add balance data.',
  inlineFix: {
    fields: [
      { key: 'cash', label: 'Cash & bank' },
      { key: 'total_debt', label: 'Total financial debt' },
      { key: 'current_liabilities', label: 'Current liabilities' },
    ],
  },
}

describe('AttentionSummary', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<AttentionSummary startupIssues={[]} qualityWarnings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a single item inline without a summary header bar', () => {
    render(<AttentionSummary startupIssues={[]} qualityWarnings={[qualityWarn]} />)
    expect(screen.getByText('Net debt assumed zero')).toBeInTheDocument()
    // No summary header bar — only the title-expand button + dismiss + CTA
    expect(screen.queryByTestId('assistant-attention-summary')).toBeInTheDocument()
    // The summary header bar uses aria-controls="assistant-attention-list"; not present here
    expect(screen.queryByRole('button', { name: /caveat/i })).not.toBeInTheDocument()
  })

  it('collapses to a summary bar when there are 2+ items and shows blocker count', () => {
    render(
      <AttentionSummary
        startupIssues={[startupBlock]}
        qualityWarnings={[qualityWarn, qualityWarn2]}
      />
    )
    // Summary bar is collapsed by default — item titles are NOT in the DOM
    expect(screen.queryByText('No round size')).not.toBeInTheDocument()
    expect(screen.queryByText('Net debt assumed zero')).not.toBeInTheDocument()
    // Header shows blocker breakdown: 1 block (startup) + 2 medium → warn = 1 blocker out of 3
    expect(screen.getByText('3 caveats · 1 to resolve')).toBeInTheDocument()
  })

  it('expands to show every item, severity-sorted with block first', () => {
    render(
      <AttentionSummary
        startupIssues={[startupBlock]}
        qualityWarnings={[qualityWarn, qualityWarn2]}
      />
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    const items = screen.getAllByTestId(/^attention-item-/)
    expect(items).toHaveLength(3)
    // First item should be severity=block (the startup issue)
    expect(items[0]).toHaveAttribute('data-severity', 'block')
    // The two quality warnings normalize from severity=medium → 'warn'
    expect(items[1]).toHaveAttribute('data-severity', 'warn')
    expect(items[2]).toHaveAttribute('data-severity', 'warn')
  })

  it('dispatches resolve to the correct callback for each source', () => {
    const onResolveStartupIssue = vi.fn()
    const onResolveQualityWarning = vi.fn()
    render(
      <AttentionSummary
        startupIssues={[startupBlock]}
        qualityWarnings={[qualityWarn]}
        onResolveStartupIssue={onResolveStartupIssue}
        onResolveQualityWarning={onResolveQualityWarning}
      />
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Fix with AI' }))
    expect(onResolveStartupIssue).toHaveBeenCalledWith(
      'missing_investment_ask',
      'Help me pick a round size.'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add balance data' }))
    expect(onResolveQualityWarning).toHaveBeenCalledWith(
      'net_debt_zero',
      'Help me add cash and debt.'
    )
  })

  it('opens an inline fill form for a warning with inlineFix and applies parsed values', () => {
    const onInlineFixQualityWarning = vi.fn()
    const onResolveQualityWarning = vi.fn()
    render(
      <AttentionSummary
        startupIssues={[]}
        qualityWarnings={[qualityInline]}
        onInlineFixQualityWarning={onInlineFixQualityWarning}
        onResolveQualityWarning={onResolveQualityWarning}
      />
    )

    // The inline-fix CTA replaces the chat CTA: clicking it reveals the fields
    // and must NOT fire a chat turn.
    fireEvent.click(screen.getByRole('button', { name: 'Add balance figures' }))
    expect(onResolveQualityWarning).not.toHaveBeenCalled()

    // 3 labelled euro inputs appear (one per balance field).
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(3)
    // Non-digits are stripped; a blank field counts as 0.
    fireEvent.change(screen.getByLabelText('Cash & bank'), { target: { value: '5.000' } })
    fireEvent.change(screen.getByLabelText('Total financial debt'), {
      target: { value: '30000' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'qualityInlineApply' }))
    expect(onInlineFixQualityWarning).toHaveBeenCalledWith('net_debt_unavailable', {
      cash: 5000,
      total_debt: 30000,
      current_liabilities: 0,
    })
  })

  it('disables the inline apply until at least one field is filled', () => {
    render(
      <AttentionSummary
        startupIssues={[]}
        qualityWarnings={[qualityInline]}
        onInlineFixQualityWarning={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add balance figures' }))
    expect(screen.getByRole('button', { name: 'qualityInlineApply' })).toBeDisabled()
  })

  it('dispatches dismiss to the correct callback for each source', () => {
    const onDismissStartupIssue = vi.fn()
    const onDismissQualityWarning = vi.fn()
    render(
      <AttentionSummary
        startupIssues={[startupBlock]}
        qualityWarnings={[qualityWarn]}
        onDismissStartupIssue={onDismissStartupIssue}
        onDismissQualityWarning={onDismissQualityWarning}
      />
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' })
    expect(dismissButtons).toHaveLength(2)
    fireEvent.click(dismissButtons[0]!)
    expect(onDismissStartupIssue).toHaveBeenCalledWith('missing_investment_ask')
    fireEvent.click(dismissButtons[1]!)
    expect(onDismissQualityWarning).toHaveBeenCalledWith('net_debt_zero')
  })

  it('toggling a title opens the body for that item only', () => {
    render(<AttentionSummary startupIssues={[startupBlock]} qualityWarnings={[qualityWarn]} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    // Body text is not shown by default
    expect(screen.queryByText('Set a target raise so dilution is shown.')).not.toBeInTheDocument()
    // Click the title — body appears
    fireEvent.click(screen.getByText('No round size'))
    expect(screen.getByText('Set a target raise so dilution is shown.')).toBeInTheDocument()
    // The other item's body stays hidden
    expect(screen.queryByText('Net debt was assumed to be zero.')).not.toBeInTheDocument()
  })

  it('dismiss-all dispatches dismiss for every item across both sources', () => {
    const onDismissStartupIssue = vi.fn()
    const onDismissQualityWarning = vi.fn()
    render(
      <AttentionSummary
        startupIssues={[startupBlock]}
        qualityWarnings={[qualityWarn, qualityWarn2]}
        onDismissStartupIssue={onDismissStartupIssue}
        onDismissQualityWarning={onDismissQualityWarning}
      />
    )
    fireEvent.click(screen.getByTestId('attention-dismiss-all'))
    expect(onDismissStartupIssue).toHaveBeenCalledTimes(1)
    expect(onDismissStartupIssue).toHaveBeenCalledWith('missing_investment_ask')
    expect(onDismissQualityWarning).toHaveBeenCalledTimes(2)
    expect(onDismissQualityWarning).toHaveBeenNthCalledWith(1, 'net_debt_zero')
    expect(onDismissQualityWarning).toHaveBeenNthCalledWith(2, 'method_substitution')
  })

  it('drops items with an empty/whitespace title to avoid blank cards', () => {
    const emptyStartup: StartupAssistantIssue = {
      ...startupBlock,
      id: 'empty_startup',
      title: '   ',
    }
    const emptyQuality: QualityWarning = {
      type: 'silent_engine_emit',
      severity: 'high',
      message: '',
      cta_label: 'Fix',
      cta_prompt: 'Fix it',
    }
    render(
      <AttentionSummary
        startupIssues={[emptyStartup]}
        qualityWarnings={[emptyQuality, qualityWarn]}
      />
    )
    // Only the well-formed quality warning makes it through — inline single-item.
    expect(screen.queryByTestId('assistant-attention-summary')).toBeInTheDocument()
    expect(screen.getByText('Net debt assumed zero')).toBeInTheDocument()
    expect(screen.queryByTestId('attention-item-startup:empty_startup')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('attention-item-quality:silent_engine_emit')
    ).not.toBeInTheDocument()
  })

  it('promotes the quick-fix to the primary style when there is no AI-resolve action', () => {
    const startupQuickFixOnly: StartupAssistantIssue = {
      id: 'qf_only',
      severity: 'warn',
      title: 'Pick a stage default',
      body: 'No AI resolve available, but a deterministic fix exists.',
      action: 'Use a stage default.',
      ctaLabel: '',
      ctaPrompt: '',
      quickFixLabel: 'Use stage default',
    }
    render(<AttentionSummary startupIssues={[startupQuickFixOnly]} qualityWarnings={[]} />)
    const button = screen.getByRole('button', { name: 'Use stage default' })
    expect(button).toHaveAttribute('data-primary', 'true')
  })

  it('renders a role=region landmark with the count as the accessible name', () => {
    render(
      <AttentionSummary
        startupIssues={[startupBlock]}
        qualityWarnings={[qualityWarn, qualityWarn2]}
      />
    )
    const region = screen.getByRole('region', {
      name: '3 caveats · 1 to resolve',
    })
    expect(region).toBeInTheDocument()
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('clamps long titles in the closed state and removes the clamp once opened', () => {
    const longTitle = 'X'.repeat(420)
    const longBodied: QualityWarning = {
      type: 'long_message',
      severity: 'medium',
      message: longTitle,
      recommendation: 'Body text shown on expand.',
      cta_label: 'Resolve',
      cta_prompt: 'Resolve it.',
    }
    render(<AttentionSummary startupIssues={[]} qualityWarnings={[longBodied]} />)
    const title = screen.getByText(longTitle)
    expect(title.className).toMatch(/line-clamp-2/)
    // Tap to open — clamp is dropped so the advisor can read the whole thing.
    fireEvent.click(title)
    expect(title.className).not.toMatch(/line-clamp-2/)
  })

  it('renders a card with no body without throwing and without an aria-expanded title', () => {
    const noBody: StartupAssistantIssue = {
      id: 'no_body',
      severity: 'info',
      title: 'Heads-up only',
      body: '',
      action: '',
      ctaLabel: '',
      ctaPrompt: '',
    }
    render(<AttentionSummary startupIssues={[noBody]} qualityWarnings={[]} />)
    const titleButton = screen.getByText('Heads-up only')
    expect(titleButton).not.toHaveAttribute('aria-expanded')
  })
})
