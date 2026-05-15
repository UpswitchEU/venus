import { useEffect, useState } from 'react'

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

export function useManualLayoutIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}
