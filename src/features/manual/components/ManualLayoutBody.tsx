'use client'

import type { ComponentProps } from 'react'
import { useState } from 'react'
import { StartupAwareInputPanel } from '../../../components/calculator/sections/startup/StartupAwareInputPanel'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../../design-system/components/Resizable'
import { ManualReportWorkspace } from './ManualReportWorkspace'
import { MobilePanelSwitcher } from './MobilePanelSwitcher'

export interface ManualLayoutBodyProps {
  inputLabel: string
  isMobile: boolean
  manualInputProps: ComponentProps<typeof StartupAwareInputPanel>
  outputLabel: string
  /**
   * The shown valuation was calculated from other figures than the ones in the form.
   * Said once, where the stale figures are, instead of in a banner over the workspace.
   */
  outputStale?: { label: string; hint: string } | null
  reportId: string
  workspaceProps: ComponentProps<typeof ManualReportWorkspace>
}

function OutputStalePill({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      role="status"
      title={hint}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-amber-700 dark:text-amber-300"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      {label}
      <span className="sr-only">. {hint}</span>
    </span>
  )
}

export function ManualLayoutBody({
  inputLabel,
  isMobile,
  manualInputProps,
  outputLabel,
  outputStale,
  reportId,
  workspaceProps,
}: ManualLayoutBodyProps) {
  const [mobilePanel, setMobilePanel] = useState<'form' | 'preview'>('form')

  if (isMobile) {
    return (
      <div className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)] min-h-0 flex flex-col">
        <MobilePanelSwitcher
          activePanel={mobilePanel}
          inputLabel={inputLabel}
          onPanelChange={setMobilePanel}
          outputLabel={outputLabel}
          outputStaleLabel={outputStale?.label}
        />
        <div
          className={mobilePanel === 'form' ? 'flex-1 min-h-0 overflow-y-auto' : 'hidden'}
          data-manual-layout-scroll
          data-mobile-panel="form"
        >
          <StartupAwareInputPanel key={reportId} {...manualInputProps} />
        </div>
        <div
          className={mobilePanel === 'preview' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}
          data-mobile-panel="preview"
        >
          {outputStale ? (
            <div className="shrink-0 px-4 pb-2">
              <OutputStalePill label={outputStale.label} hint={outputStale.hint} />
            </div>
          ) : null}
          <div className="flex-1 min-h-0">
            <ManualReportWorkspace {...workspaceProps} />
          </div>
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
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-foreground/[0.06] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
              <span>{outputLabel}</span>
              {outputStale ? (
                <OutputStalePill label={outputStale.label} hint={outputStale.hint} />
              ) : null}
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
