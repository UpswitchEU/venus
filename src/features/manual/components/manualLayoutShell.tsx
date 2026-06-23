import { useMobileViewport } from '../../../hooks/useMobileViewport'

export function PanelSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-foreground/10" />
        <div className="w-24 h-3 rounded bg-foreground/10" />
      </div>
    </div>
  )
}

export function useManualLayoutViewport() {
  const { hasMeasured, matches } = useMobileViewport()

  return {
    hasMeasuredViewport: hasMeasured,
    isMobile: matches,
  }
}

export function useManualLayoutIsMobile() {
  return useManualLayoutViewport().isMobile
}
