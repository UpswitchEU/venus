import type { ComponentProps, ReactNode } from 'react'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../../design-system/components/Resizable'
import { ManualReportWorkspace } from './ManualReportWorkspace'

export interface ManualLayoutBodyProps {
  isMobile: boolean
  manualInputProps: ComponentProps<typeof StartupAwareInputPanel>
  reportId: string
  assistantPanel?: ReactNode
  workspaceProps: ComponentProps<typeof ManualReportWorkspace>
}

export function ManualLayoutBody({
  isMobile,
  manualInputProps,
  reportId,
  assistantPanel,
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
        <ResizablePanel defaultSize={assistantPanel ? 30 : 35} minSize={25} maxSize={50}>
          <div className="h-full flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto" data-manual-layout-scroll>
              <StartupAwareInputPanel key={reportId} {...manualInputProps} />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle
          withHandle
          className="w-px bg-foreground/[0.06] hover:bg-primary/30 data-[state=dragging]:bg-primary/50 transition-colors"
        />

        <ResizablePanel defaultSize={assistantPanel ? 45 : 65} minSize={35}>
          <ManualReportWorkspace {...workspaceProps} />
        </ResizablePanel>

        {assistantPanel ? (
          <>
            <ResizableHandle
              withHandle
              className="w-px bg-foreground/[0.06] hover:bg-primary/30 data-[state=dragging]:bg-primary/50 transition-colors"
            />
            <ResizablePanel defaultSize={25} minSize={22} maxSize={42}>
              <div className="h-full min-h-0 border-l border-foreground/[0.06] bg-background">
                {assistantPanel}
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  )
}
