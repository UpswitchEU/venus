import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ValuationReport } from './ValuationReport'

const updateUrlMock = vi.fn()
const replaceMock = vi.fn()

vi.mock('next-view-transitions', () => ({
  useTransitionRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
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
    replaceMock.mockClear()
    window.localStorage.clear()
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

  it('promotes a saved val_* concept to the durable report UUID without losing query state', async () => {
    const sessionKey = 'val_1700000000_route123'
    const reportUuid = '35a422c3-028f-4d46-88e5-27ac5519826c'
    window.history.replaceState({}, '', `/en/reports/${sessionKey}?source=mercury&tab=history`)

    render(<ValuationReport reportId={sessionKey} />)
    window.dispatchEvent(
      new CustomEvent('upswitch:report-identity-promoted', {
        detail: {
          previousId: sessionKey,
          sessionKey,
          reportId: reportUuid,
          engineRunId: 'val_engine_run_123',
        },
      })
    )

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        `/en/reports/${reportUuid}?source=mercury&tab=history`
      )
    })
  })

  it('resolves a persisted session-key alias on a later Mercury round-trip', async () => {
    const sessionKey = 'val_1700000000_return123'
    const reportUuid = 'ec8c5f17-d0ef-471e-bfa0-b2e9ac946df8'
    window.localStorage.setItem(`upswitch:report-alias:v1:${sessionKey}`, reportUuid)
    window.history.replaceState({}, '', `/nl/reports/${sessionKey}?source=mercury`)

    render(<ValuationReport reportId={sessionKey} />)

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(`/nl/reports/${reportUuid}?source=mercury`)
    })
  })
})
