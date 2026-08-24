import type { ComponentProps } from 'react'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../../design-system/components/Resizable'
import { ManualReportWorkspace } from './ManualReportWorkspace'

export interface ManualLayoutBodyProps {
  inputLabel: string
  isMobile: boolean
  manualInputProps: ComponentProps<typeof StartupAwareInputPanel>
  outputLabel: string
  reportId: string
  workspaceProps: ComponentProps<typeof ManualReportWorkspace>
}

export function ManualLayoutBody({
  inputLabel,
  isMobile,
  manualInputProps,
  outputLabel,
  reportId,
  workspaceProps,
}: ManualLayoutBodyProps) {
  if (isMobile) {
    return (
      <div className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)] min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto" data-manual-layout-scroll>
          <StartupAwareInputPanel key={reportId} {...manualInputProps} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden m-4 rounded-xl border border-foreground/[0.06]">
      <ResizablePanelGroup className="h-full w-full">
        <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
          <div className="h-full flex flex-col min-h-0">
            <div className="shrink-0 border-b border-foreground/[0.06] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
              {inputLabel}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto" data-manual-layout-scroll>
              <StartupAwareInputPanel key={reportId} {...manualInputProps} />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle
          withHandle
          className="w-px bg-foreground/[0.06] hover:bg-primary/30 data-[state=dragging]:bg-primary/50 transition-colors"
        />

        <ResizablePanel defaultSize={65} minSize={35}>
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-foreground/[0.06] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
              {outputLabel}
            </div>
            <div className="min-h-0 flex-1">
              <ManualReportWorkspace {...workspaceProps} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
