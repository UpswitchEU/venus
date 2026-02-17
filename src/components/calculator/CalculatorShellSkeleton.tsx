'use client';

/**
 * Calculator Shell Skeleton
 *
 * Renders the calculator layout structure with skeleton content.
 * Used during async loading (auth, session, bootstrap) so users see
 * the calculator shape immediately instead of a blocking LoadingState.
 *
 * Matches ManualLayout structure for seamless transition to real content.
 */

import React from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/design-system/components/Resizable';
import { InputFieldsSkeleton } from '@/components/skeletons/InputFieldsSkeleton';
import { ReportSkeleton } from '@/components/skeletons/ReportSkeleton';

function NavSkeleton() {
  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-foreground/[0.06] bg-background">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-foreground/10 animate-pulse" />
        <div className="h-5 w-32 rounded bg-foreground/10 animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-foreground/10 animate-pulse" />
        <div className="h-8 w-8 rounded-full bg-foreground/10 animate-pulse" />
      </div>
    </div>
  );
}

export function CalculatorShellSkeleton() {
  return (
    <div className="aurora-theme flex flex-col h-screen bg-background overflow-hidden">
      <NavSkeleton />

      <div className="flex-1 min-w-0 overflow-hidden m-4 rounded-xl border border-foreground/[0.06]">
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
            <div className="h-full overflow-y-auto p-6">
              <InputFieldsSkeleton />
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="w-px bg-foreground/[0.06] hover:bg-primary/30 transition-colors"
          />

          <ResizablePanel defaultSize={65} minSize={40}>
            <div className="h-full overflow-hidden">
              <ReportSkeleton />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
