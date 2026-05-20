import { useRef, useState } from 'react'

export function useManualAssistantAcknowledgementState() {
  const [acknowledgedQualityWarnings, setAcknowledgedQualityWarnings] = useState<Set<string>>(
    () => new Set()
  )
  const [acknowledgedStartupIssues, setAcknowledgedStartupIssues] = useState<Set<string>>(
    () => new Set()
  )
  const lastQualityWarningResetKeyRef = useRef<string | null>(null)
  const lastSynthesisBlendSkippedRunKeyRef = useRef<string | null>(null)

  return {
    acknowledgedQualityWarnings,
    acknowledgedStartupIssues,
    lastQualityWarningResetKeyRef,
    lastSynthesisBlendSkippedRunKeyRef,
    setAcknowledgedQualityWarnings,
    setAcknowledgedStartupIssues,
  }
}
