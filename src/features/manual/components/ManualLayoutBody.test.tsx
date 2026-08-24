import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ManualLayoutBody } from './ManualLayoutBody'

vi.mock('../../../components/calculator/sections/startup/StartupAwareInputPanel', () => ({
  StartupAwareInputPanel: () => <div data-testid="input-panel" />,
}))

vi.mock('./ManualReportWorkspace', () => ({
  ManualReportWorkspace: () => <div data-testid="report-workspace" />,
}))

vi.mock('../../../design-system/components/Resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resize-handle" />,
}))

const baseProps = {
  inputLabel: 'Input',
  isMobile: false,
  outputLabel: 'Output',
  reportId: 'report-1',
  manualInputProps: {} as never,
  workspaceProps: {} as never,
}

describe('ManualLayoutBody', () => {
  it('renders two-column desktop workspace', () => {
    render(<ManualLayoutBody {...baseProps} />)
    expect(screen.getByTestId('input-panel')).toBeInTheDocument()
    expect(screen.getByTestId('report-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle')).toBeInTheDocument()
  })

  it('lets mobile users switch between input and output without losing either panel', () => {
    render(<ManualLayoutBody {...baseProps} isMobile />)

    expect(screen.getByTestId('input-panel')).toBeInTheDocument()
    expect(screen.getByTestId('report-workspace')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Input' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Output' }))

    expect(screen.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('input-panel').parentElement).toHaveClass('hidden')
    expect(screen.getByTestId('report-workspace').parentElement).not.toHaveClass('hidden')
  })
})
