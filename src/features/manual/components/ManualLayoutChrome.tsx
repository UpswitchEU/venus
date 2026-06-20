import type { ComponentProps } from 'react'
import { Suspense } from 'react'
import { ChatAssistantDrawer } from '../../../components/calculator'
import { venusAiDockShellClassName } from '../../../components/calculator/venus-ai-dock-layout'
import { ManualLayoutBody } from './ManualLayoutBody'
import { ManualLayoutContextBar } from './ManualLayoutContextBar'
import { ManualLayoutModals } from './ManualLayoutModals'
import { ManualLayoutNav } from './ManualLayoutNav'
import { ManualPdfStaleBanner } from './ManualPdfStaleBanner'

interface ManualLayoutChromeProps {
  bodyProps: ComponentProps<typeof ManualLayoutBody>
  chatDrawerOpen: boolean
  chatDrawerProps: ComponentProps<typeof ChatAssistantDrawer>
  contextBarProps: ComponentProps<typeof ManualLayoutContextBar>
  isMobile: boolean
  modalsProps: ComponentProps<typeof ManualLayoutModals>
  navProps: ComponentProps<typeof ManualLayoutNav>
  pdfStaleBannerProps: ComponentProps<typeof ManualPdfStaleBanner>
  showAssistantFab: boolean
}

export function ManualLayoutChrome({
  bodyProps,
  chatDrawerOpen,
  chatDrawerProps,
  contextBarProps,
  isMobile,
  modalsProps,
  navProps,
  pdfStaleBannerProps,
  showAssistantFab,
}: ManualLayoutChromeProps) {
  return (
    <>
      <div
        className={venusAiDockShellClassName(
          chatDrawerOpen,
          isMobile,
          'aurora-theme flex flex-col h-[100dvh] bg-background overflow-hidden'
        )}
      >
        <ManualLayoutNav {...navProps} />
        <ManualPdfStaleBanner {...pdfStaleBannerProps} />
        <ManualLayoutContextBar {...contextBarProps} />
        <ManualLayoutBody {...bodyProps} />
        <ManualLayoutModals {...modalsProps} />
      </div>
      <Suspense fallback={null}>
        <ChatAssistantDrawer
          {...chatDrawerProps}
          lockScroll={isMobile}
          showFabWhenClosed={showAssistantFab}
        />
      </Suspense>
    </>
  )
}
