import { render, screen } from '@testing-library/react'
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
  isMobile: false,
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

  it('renders mobile scroll container without report workspace column', () => {
    render(<ManualLayoutBody {...baseProps} isMobile />)
    expect(screen.getByTestId('input-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('report-workspace')).not.toBeInTheDocument()
  })
})
