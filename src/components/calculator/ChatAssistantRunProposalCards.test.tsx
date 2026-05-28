import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatAssistantRunProposalCards } from './ChatAssistantRunProposalCards'
import type { ChatMessage } from './ChatAssistantTypes'

describe('ChatAssistantRunProposalCards', () => {
  it('passes AI-requested valuation methods into the approval callback', () => {
    const onApproveValuationRun = vi.fn()
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      valuationRunRequests: [
        {
          id: 'run-1',
          status: 'pending_approval',
          reportId: 'report-1',
          methods: ['dcf', 'liquidation_analysis'],
          estimatedCredits: 5,
          inputsSummary: {
            business_name: 'Decostere BV',
            business_type: 'manufacturing',
            industry: null,
            revenue: '1000000',
            ebitda: '120000',
            ebitda_normalized: null,
            pending_normalizations: 0,
            applied_normalizations: 0,
          },
        },
      ],
    }

    render(
      <ChatAssistantRunProposalCards
        message={message}
        onApproveValuationRun={onApproveValuationRun}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.valuation.actionLabel' }))

    expect(onApproveValuationRun).toHaveBeenCalledWith('run-1', 'report-1', [
      'dcf',
      'liquidation_analysis',
    ])
  })

  it('renders report-generation proposals through the shared shell actions', () => {
    const onApproveReportGeneration = vi.fn()
    const onRejectReportGeneration = vi.fn()
    const message: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      reportGenerationRequests: [
        {
          id: 'report-proposal-1',
          status: 'pending_approval',
          reportId: 'report-1',
          resultSummary: {
            business_name: 'Decostere BV',
            business_type: 'manufacturing',
            valuation_method: 'dcf',
            currency: 'EUR',
            midpoint: 1250000,
            min: 1000000,
            max: 1500000,
            confidence_score: 82,
            calculated_at: '2026-05-28T10:00:00Z',
          },
        },
      ],
    }

    render(
      <ChatAssistantRunProposalCards
        message={message}
        onApproveReportGeneration={onApproveReportGeneration}
        onRejectReportGeneration={onRejectReportGeneration}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.report.actionLabel' }))
    expect(onApproveReportGeneration).toHaveBeenCalledWith('report-proposal-1', 'report-1')

    fireEvent.click(screen.getByRole('button', { name: 'proposalCards.common.buttonCancel' }))
    expect(onRejectReportGeneration).toHaveBeenCalledWith('report-proposal-1')
  })
})
