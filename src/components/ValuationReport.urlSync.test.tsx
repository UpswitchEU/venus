import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ValuationReport } from './ValuationReport'

const updateUrlMock = vi.fn()

vi.mock('next-view-transitions', () => ({
  useTransitionRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock('../hooks/useBootstrapSync', () => ({
  useBootstrapSync: () => ({ isSynced: true }),
}))

vi.mock('../hooks/useEmbeddedMode', () => ({
  useEmbeddedMode: () => ({ isEmbedded: false }),
}))

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: () => ({
    urlState: {},
    updateUrl: updateUrlMock,
  }),
}))

vi.mock('../lib/analytics', () => ({
  trackReportOpen: vi.fn(),
  trackSessionStart: vi.fn(),
}))

vi.mock('../utils/submitAnonymizedBenchmarkContribution', () => ({
  submitAnonymizedBenchmarkContribution: vi.fn(),
}))

vi.mock('./ValuationSessionManager', () => ({
  ValuationSessionManager: ({
    children,
  }: {
    children: (props: Record<string, unknown>) => ReactNode
  }) => (
    <div data-testid="session-manager">
      {children({
        session: null,
        stage: 'ready',
        isLoading: false,
        error: null,
        showOutOfCreditsModal: false,
        onCloseModal: vi.fn(),
        prefilledQuery: undefined,
        autoSend: false,
        onRetry: vi.fn(),
        onStartOver: vi.fn(),
      })}
    </div>
  ),
}))

vi.mock('./ValuationFlowSelector', () => ({
  ValuationFlowSelector: () => <div data-testid="flow-selector" />,
}))

describe('ValuationReport URL sync', () => {
  const reportA = '35a422c3-028f-4d46-88e5-27ac5519826c'
  const reportB = 'ec8c5f17-d0ef-471e-bfa0-b2e9ac946df8'

  beforeEach(() => {
    updateUrlMock.mockClear()
  })

  it('re-syncs initial mode and version when client navigation changes only the report id', async () => {
    const { rerender } = render(
      <ValuationReport reportId={reportA} initialMode="view" initialVersion={2} />
    )

    await waitFor(() => {
      expect(updateUrlMock).toHaveBeenCalledWith({ mode: 'view', version: 2 }, { replace: true })
    })

    updateUrlMock.mockClear()

    rerender(<ValuationReport reportId={reportB} initialMode="view" initialVersion={2} />)

    await waitFor(() => {
      expect(updateUrlMock).toHaveBeenCalledWith({ mode: 'view', version: 2 }, { replace: true })
    })
  })
})
