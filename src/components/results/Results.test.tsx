import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../store/useSessionStore'
import { Results } from './Results'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('Results', () => {
  afterEach(() => {
    cleanup()
    useSessionStore.setState({
      session: null,
      status: 'idle',
      errorMessage: null,
    })
  })

  it('renders session html report even before result is bridged', () => {
    useSessionStore.setState({
      status: 'loaded',
      errorMessage: null,
      session: {
        reportId: 'val_ready',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        htmlReport: '<div>Ready report html</div>',
      } as any,
    })

    render(<Results result={null} />)

    expect(screen.getByText('Ready report html')).toBeInTheDocument()
  })
})
