import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StartupIssueRail } from './ChatAssistantAttentionRails'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StartupIssueRail', () => {
  it('surfaces deterministic startup quick fixes before the AI handoff', () => {
    const onApplyStartupIssueQuickFix = vi.fn()
    const onResolveStartupIssue = vi.fn()

    render(
      <StartupIssueRail
        startupIssues={[
          {
            id: 'missing_investment_ask',
            severity: 'block',
            title: 'No round size',
            body: 'Set a target raise.',
            action: 'Use a default.',
            ctaLabel: 'Fix with AI',
            ctaPrompt: 'Help me pick a round size.',
            quickFixLabel: 'Use stage default',
            jumpLabel: 'Jump to Round',
          },
        ]}
        onApplyStartupIssueQuickFix={onApplyStartupIssueQuickFix}
        onResolveStartupIssue={onResolveStartupIssue}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use stage default' }))
    expect(onApplyStartupIssueQuickFix).toHaveBeenCalledWith('missing_investment_ask')
    expect(onResolveStartupIssue).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fix with AI' }))
    expect(onResolveStartupIssue).toHaveBeenCalledWith(
      'missing_investment_ask',
      'Help me pick a round size.'
    )
  })
})
